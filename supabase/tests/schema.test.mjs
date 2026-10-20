// Runs every migration in an in-memory Postgres (PGlite) and checks XP, PRs, streaks and row level security.
// npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';

const dir = new URL('../migrations', import.meta.url).pathname;
const db = new PGlite({ extensions: { pg_trgm } });

// Minimal Supabase auth stub
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated, anon;
  alter default privileges in schema public grant all on sequences to authenticated, anon;
`);

for (const f of ['20261020000001_init.sql', '20261020000002_seed.sql']) {
  await db.exec(readFileSync(`${dir}/${f}`, 'utf8'));
  console.log('applied', f);
}

const U = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${U}', 'sumukh@example.com', '{"display_name":"Sumukh"}'), ('${V}', 'other@example.com', '{}')`);

async function as(user, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
}
const one = async (u, sql, p) => (await as(u, sql, p)).rows[0];
const assert = (cond, msg) => {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('ok -', msg);
};

const prof = await one(U, `select * from profiles`);
assert(prof.display_name === 'Sumukh', 'profile auto-created with display name');
assert((await as(U, `select * from profiles`)).rows.length === 1, 'user sees only own profile');

// Client cannot write XP
let blocked = false;
try { await as(U, `update profiles set total_xp = 99999 where id = '${U}'`); } catch { blocked = true; }
assert(blocked, 'client cannot update total_xp');
blocked = false;
try { await as(U, `select award_xp('${U}', 'cheat', 1000, 'x', current_date)`); } catch { blocked = true; }
assert(blocked, 'client cannot call award_xp');

await as(U, `update profiles set calorie_target = 2100, protein_g = 50, onboarded = true where id = '${U}'`);

const bench = (await one(U, `select id from exercises where name = 'Bench Press (Barbell)'`)).id;
const squat = (await one(U, `select id from exercises where name = 'Squat (Barbell)'`)).id;

const payload = (day, w) => ({
  name: 'Push day', routine_id: null, day,
  started_at: `${day}T10:00:00Z`, finished_at: `${day}T11:05:00Z`,
  exercises: [
    { exercise_id: bench, notes: null, sets: [
      { set_type: 'warmup', weight_kg: 40, reps: 10 },
      { set_type: 'normal', weight_kg: w, reps: 8 },
      { set_type: 'normal', weight_kg: w, reps: 6 },
    ] },
    { exercise_id: squat, notes: 'felt good', sets: [{ set_type: 'normal', weight_kg: 100, reps: 5 }] },
  ],
});

const r1 = (await one(U, `select finish_workout($1::jsonb) as r`, [JSON.stringify(payload('2026-10-19', 60))])).r;
assert(r1.total_sets === 3 && r1.prs.length === 0, `first workout: 3 working sets, baseline not PR (${JSON.stringify(r1)})`);
assert(r1.xp === 40 + 6 + 5, `first workout XP = base 46 + streak 5 (${r1.xp})`);

const r2 = (await one(U, `select finish_workout($1::jsonb) as r`, [JSON.stringify(payload('2026-10-20', 70))])).r;
assert(r2.prs.length === 1 && Number(r2.prs[0].e1rm) === 88.7, `second workout: bench PR detected at e1rm 88.7 (${JSON.stringify(r2.prs)})`);
assert(r2.xp === 46 + 20 + 10, `second workout XP incl PR and 2-day streak (${r2.xp})`);

const p2 = await one(U, `select total_xp, current_streak, longest_streak from profiles`);
assert(p2.current_streak === 2 && p2.total_xp === r1.xp + r2.xp, `streak 2, total XP ${p2.total_xp}`);

const prev = (await as(U, `select * from previous_sets($1::uuid[])`, [[bench]])).rows;
assert(prev.length === 1 && Number(prev[0].sets[0].weight_kg) === 70 && prev[0].sets.length === 2, 'previous_sets returns latest working sets');

// Food log XP + protein goal
const paneer = (await one(U, `select * from foods where name = 'Paneer'`));
for (let i = 0; i < 8; i++) {
  await as(U, `insert into food_logs (day, meal, food_id, food_name, grams, kcal, protein, carbs, fat)
               values ('2026-10-20', 'lunch', $1, 'Paneer', 100, 265, 18.3, 1.2, 20.8)`, [paneer.id]);
}
const foodXp = await one(U, `select count(*)::int n, sum(amount)::int s from xp_events where kind = 'food_log'`);
assert(foodXp.n === 6 && foodXp.s === 30, 'food logging XP capped at 6 entries/day');
assert((await one(U, `select count(*)::int n from xp_events where kind = 'protein_goal'`)).n === 1, 'protein goal awarded once');

// Water goal
await as(U, `insert into water_logs (day, ml) values ('2026-10-20', 2000)`);
assert((await one(U, `select count(*)::int n from xp_events where kind = 'water_goal'`)).n === 0, 'no water XP below target');
await as(U, `insert into water_logs (day, ml) values ('2026-10-20', 1000), ('2026-10-20', 500)`);
assert((await one(U, `select count(*)::int n from xp_events where kind = 'water_goal'`)).n === 1, 'water goal awarded once');

// Steps / sleep via upsert
await as(U, `insert into daily_health (user_id, day, steps) values ('${U}', '2026-10-20', 9000)
             on conflict (user_id, day) do update set steps = excluded.steps`);
await as(U, `insert into daily_health (user_id, day, sleep_min) values ('${U}', '2026-10-20', 470)
             on conflict (user_id, day) do update set sleep_min = excluded.sleep_min`);
const h = await one(U, `select * from daily_health`);
assert(h.steps === 9000 && h.sleep_min === 470, 'partial upserts keep both steps and sleep');
assert((await one(U, `select count(*)::int n from xp_events where kind in ('steps_goal','sleep_goal')`)).n === 2, 'steps and sleep goals awarded');

// Weigh-in updates profile weight
await as(U, `insert into body_metrics (user_id, day, weight_kg) values ('${U}', '2026-10-20', 73.4)
             on conflict (user_id, day) do update set weight_kg = excluded.weight_kg`);
await as(U, `insert into body_metrics (user_id, day, weight_kg) values ('${U}', '2026-10-20', 73.1)
             on conflict (user_id, day) do update set weight_kg = excluded.weight_kg`);
assert(Number((await one(U, `select weight_kg from profiles`)).weight_kg) === 73.1, 'weigh-in syncs profile weight');

// Views
const dn = await one(U, `select * from daily_nutrition where day = '2026-10-20'`);
assert(dn.kcal === 2120, `daily_nutrition view sums kcal (${dn.kcal})`);
const wv = (await as(U, `select * from weekly_volume`)).rows;
assert(wv.length >= 1, 'weekly_volume view returns rows');

// Isolation: other user sees nothing of U
assert((await as(V, `select * from workouts`)).rows.length === 0, 'other user cannot see workouts');
assert((await as(V, `select * from food_logs`)).rows.length === 0, 'other user cannot see food logs');
assert((await as(V, `select * from previous_sets($1::uuid[])`, [[bench]])).rows.length === 0, 'previous_sets scoped to caller');
assert((await as(V, `select * from workout_sets`)).rows.length === 0, 'other user cannot see sets');
blocked = false;
try {
  await as(V, `insert into workout_exercises (workout_id, exercise_id, position) values ($1, $2, 1)`, [r1.workout_id, bench]);
} catch { blocked = true; }
assert(blocked, 'other user cannot attach exercises to someone else’s workout');

// Routine
const rt = await one(U, `insert into routines (name) values ('Pull') returning id`);
await as(U, `insert into routine_exercises (routine_id, exercise_id, position) values ($1, $2, 1)`, [rt.id, squat]);
assert((await as(V, `select * from routine_exercises`)).rows.length === 0, 'routine exercises are private');

// Custom food + seed protection
blocked = false;
try { await as(U, `insert into foods (name, source, kcal_100g, created_by) values ('Fake', 'seed', 100, '${U}')`); } catch { blocked = true; }
assert(blocked, 'client cannot insert seed foods');
await as(U, `insert into foods (name, source, kcal_100g, created_by, barcode) values ('Protein bar', 'custom', 380, '${U}', '8901234567890')`);
assert((await as(V, `select * from foods where barcode = '8901234567890'`)).rows.length === 1, 'cached barcode foods are shared');

// Delete workout cascades
await as(U, `delete from workouts where id = $1`, [r1.workout_id]);
assert((await one(U, `select count(*)::int n from workout_sets`)).n === 4, 'deleting a workout cascades to its sets');

console.log('\nAll SQL checks passed.');
