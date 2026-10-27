// Runs every migration in an in-memory Postgres (PGlite) and checks XP, PRs, streaks and row level security.
// npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../migrations', import.meta.url));
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

for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
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

// Importing history from Hevy: no XP, duplicates skipped, personal records refreshed
const xpBefore = (await one(U, `select total_xp from profiles`)).total_xp;
const hevy = (start, w) => ({
  external_id: start, name: 'Hevy push', day: start.slice(0, 10),
  started_at: start, finished_at: start.replace('T09', 'T10'), notes: 'from hevy',
  exercises: [{ exercise_id: bench, notes: null, sets: [
    { set_type: 'warmup', weight_kg: 40, reps: 10 },
    { set_type: 'normal', weight_kg: w, reps: 5, rpe: 9 },
    { set_type: 'drop', weight_kg: w - 20, reps: 8 },
  ] }],
});
const batch = { source: 'hevy', workouts: [hevy('2025-01-06T09:00:00Z', 80), hevy('2025-01-13T09:00:00Z', 100)] };
const imp = (await one(U, `select import_workouts($1::jsonb) as r`, [JSON.stringify(batch)])).r;
assert(imp.imported === 2 && imp.skipped === 0, `import saves both workouts (${JSON.stringify(imp)})`);
assert((await one(U, `select total_xp from profiles`)).total_xp === xpBefore, 'imported workouts earn no XP');
const pr = await one(U, `select best_e1rm, best_weight, reps from personal_records where exercise_id = $1`, [bench]);
assert(Number(pr.best_e1rm) === 116.7 && Number(pr.best_weight) === 100, `imported history sets the bench PR (${JSON.stringify(pr)})`);
const iw = await one(U, `select total_sets, total_volume::float as volume, source, xp_earned from workouts
                         where external_id = '2025-01-13T09:00:00Z'`);
assert(iw.total_sets === 2 && iw.volume === 1140 && iw.source === 'hevy' && iw.xp_earned === 0,
  `imported workout totals exclude warm-ups (${JSON.stringify(iw)})`);
const again = (await one(U, `select import_workouts($1::jsonb) as r`, [JSON.stringify(batch)])).r;
assert(again.imported === 0 && again.skipped === 2, 'importing the same workouts again skips them');
const weaker = { source: 'hevy', workouts: [hevy('2025-02-03T09:00:00Z', 50)] };
await as(U, `select import_workouts($1::jsonb)`, [JSON.stringify(weaker)]);
assert(Number((await one(U, `select best_e1rm from personal_records where exercise_id = $1`, [bench])).best_e1rm) === 116.7,
  'a weaker imported workout keeps the existing PR');
blocked = false;
try { await as(U, `select import_workouts($1::jsonb)`, [JSON.stringify({ source: 'shredder', workouts: [] })]); } catch { blocked = true; }
assert(blocked, 'imports must name another app as their source');
const vImp = (await one(V, `select import_workouts($1::jsonb) as r`, [JSON.stringify(batch)])).r;
assert(vImp.imported === 2, 'the same Hevy workouts import separately for another user');
assert((await as(V, `select * from personal_records`)).rows.length === 1 &&
  (await as(U, `select * from workouts where source = 'hevy'`)).rows.length === 3, 'imports stay per user');

// Live PR alerts read the best lift so far
const best = await one(U, `select best_e1rm::float e, best_weight::float w from exercise_bests(array[$1::uuid])`, [bench]);
const prRow = await one(U, `select best_e1rm::float e from personal_records where exercise_id = $1`, [bench]);
assert(best.e === prRow.e && best.w >= 100, `exercise_bests matches the PR table (${JSON.stringify(best)})`);
await as(V, `delete from workouts`);
assert((await as(V, `select * from exercise_bests(array[$1::uuid])`, [bench])).rows.length === 0,
  'exercise_bests only sees your own history');

// Exercise demos and everyday foods
const noDemo = (await one(U, `select count(*)::int n from exercises where created_by is null and media_id is null and gif_id is null`)).n;
assert(noDemo === 0, `every library exercise has a demo (${noDemo} missing)`);
const library = (await one(U, `select count(*)::int n from exercises where created_by is null`)).n;
assert(library > 1200, `the full ExerciseDB library is in (${library} exercises)`);
const libSteps = (await one(U, `select count(*)::int n from exercises where created_by is null and coalesce(array_length(instructions, 1), 0) = 0`)).n;
assert(libSteps === 0, `every library exercise has instructions (${libSteps} missing)`);
const benchDemo = await one(U, `select media_id, array_length(instructions, 1) n from exercises where name = 'Bench Press (Barbell)'`);
assert(benchDemo.media_id === 'Barbell_Bench_Press_-_Medium_Grip' && benchDemo.n > 2, 'bench press has photos and instructions');
const gifs = (await one(U, `select count(*)::int n from exercises where created_by is null and gif_id is not null`)).n;
assert(gifs === 1291, `1,291 library exercises have an animated GIF (${gifs})`);
assert((await one(U, `select gif_id from exercises where name = 'Chin Up'`)).gif_id === 'T2mxWqc', 'chin up uses the working GIF');
const usda = (await one(U, `select count(*)::int n from foods where source = 'usda'`)).n;
assert(usda > 7000, `USDA everyday foods loaded (${usda})`);
const egg = await one(U, `select serving_label, serving_g::float g, kcal_100g::float kcal from foods where name = 'Egg, whole, cooked, hard-boiled'`);
assert(egg.serving_label === '1 large' && egg.g === 50 && egg.kcal === 155, `egg has a sensible serving (${JSON.stringify(egg)})`);
blocked = false;
try { await as(U, `insert into foods (name, source, kcal_100g, created_by) values ('Fake', 'usda', 100, '${U}')`); } catch { blocked = true; }
assert(blocked, 'client cannot insert USDA foods');

// Set-level PR medals: more weight, or more reps at that weight or heavier, than any earlier set
const W = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users (id, email) values ('${W}', 'medals@example.com')`);
const session = (day, sets, ex = bench) => ({
  name: 'Bench', routine_id: null, day, started_at: `${day}T10:00:00Z`, finished_at: `${day}T11:00:00Z`,
  exercises: [{ exercise_id: ex, notes: null, sets: sets.map(([weight_kg, reps, set_type = 'normal']) => ({ set_type, weight_kg, reps })) }],
});
const medals = async (day) =>
  (await as(W, `select s.weight_kg::float w, s.reps r, s.is_pr pr from workout_sets s
                join workout_exercises we on we.id = s.workout_exercise_id join workouts w on w.id = we.workout_id
                where w.day = $1 order by s.position`, [day])).rows.map((s) => s.pr);
const save = (p) => one(W, `select finish_workout($1::jsonb) as r`, [JSON.stringify(p)]);

await save(session('2026-09-01', [[40, 10, 'warmup'], [60, 10], [62.5, 6], [60, 8]]));
assert(JSON.stringify(await medals('2026-09-01')) === '[false,false,false,false]', 'the first workout with an exercise earns no medals, even when it ramps up');
await save(session('2026-09-03', [[40, 12, 'warmup'], [60, 11], [62.5, 8], [62.5, 8], [55, 12]]));
assert(JSON.stringify(await medals('2026-09-03')) === '[false,true,true,false,true]',
  `extra reps, more weight and a rep best at a lighter weight each get a medal; a repeat and warm-ups do not (${await medals('2026-09-03')})`);
assert((await one(W, `select pr_count from workouts where day = '2026-09-03'`)).pr_count === 3, 'pr_count counts the medals');
await save(session('2026-09-05', [[60, 9], [62.5, 8]]));
assert(JSON.stringify(await medals('2026-09-05')) === '[false,false]', 'matching or falling short of an earlier set is not a PR');
// Deleting the 3 Sept workout makes 5 Sept's 60 x 9 and 62.5 x 8 the new bests after 1 Sept.
await as(W, `delete from workouts where day = '2026-09-03'`);
assert(JSON.stringify(await medals('2026-09-05')) === '[false,true]', `medals are recomputed after a delete (${await medals('2026-09-05')})`);
assert((await one(W, `select pr_count from workouts where day = '2026-09-05'`)).pr_count === 1, 'pr_count follows a delete');
// Importing older history re-dates the baseline.
await as(W, `select import_workouts($1::jsonb)`, [JSON.stringify({ source: 'hevy', workouts: [{
  external_id: 'old', name: 'Old bench', day: '2026-08-01', started_at: '2026-08-01T09:00:00Z', finished_at: '2026-08-01T10:00:00Z',
  exercises: [{ exercise_id: bench, notes: null, sets: [{ set_type: 'normal', weight_kg: 50, reps: 10 }] }] }] })]);
assert(JSON.stringify(await medals('2026-09-01')) === '[false,true,true,false]', `imported earlier history turns later bests into medals (${await medals('2026-09-01')})`);
const hist = (await as(W, `select weight_kg::float w, reps from exercise_set_history(array[$1::uuid]) order by 1`, [bench])).rows;
assert(JSON.stringify(hist) === '[{"w":50,"reps":10},{"w":60,"reps":10},{"w":62.5,"reps":8}]', `live history lists the most reps per weight (${JSON.stringify(hist)})`);
assert((await as(U, `select * from exercise_set_history(array[$1::uuid])`, [bench])).rows.every((r) => Number(r.weight_kg) !== 62.5),
  'live history only sees your own sets');
blocked = false;
try { await as(W, `select refresh_prs('${U}', array['${bench}'::uuid])`); } catch { blocked = true; }
assert(blocked, "users can't recompute someone else's medals");

// Editing a logged workout: date, time, sets; totals, medals and records follow
const target = await one(W, `select id, xp_earned from workouts where day = '2026-09-05'`);
const edit = (p) => one(W, `select update_workout($1::jsonb) as r`, [JSON.stringify(p)]);
const edited = (await edit({
  id: target.id, name: 'Heavy bench', day: '2026-09-06',
  started_at: '2026-09-06T07:30:00Z', finished_at: '2026-09-06T08:45:00Z',
  exercises: [{ exercise_id: bench, notes: 'moved', sets: [
    { set_type: 'warmup', weight_kg: 40, reps: 10 }, { set_type: 'normal', weight_kg: 70, reps: 5 }, { set_type: 'normal', weight_kg: 60, reps: 12 },
  ] }],
})).r;
const ew = await one(W, `select name, day::text, duration_s, total_sets, total_volume::float v, pr_count, xp_earned from workouts where id = $1`, [target.id]);
assert(ew.name === 'Heavy bench' && ew.day === '2026-09-06' && ew.duration_s === 4500,
  `edit changes the name, date and times (${JSON.stringify(ew)})`);
assert(ew.total_sets === 2 && ew.v === 1070 && edited.total_sets === 2, `edit recomputes the totals (${JSON.stringify(ew)})`);
assert(JSON.stringify(await medals('2026-09-06')) === '[false,true,true]', `edited sets get their medals (${await medals('2026-09-06')})`);
assert(ew.pr_count === 2 && ew.xp_earned === target.xp_earned, 'edit updates pr_count and leaves XP alone');
assert(Number((await one(W, `select best_e1rm from personal_records where exercise_id = $1`, [bench])).best_e1rm) === 84,
  'edit refreshes the personal record (60 x 12 is the best estimated 1RM)');
await edit({ id: target.id, name: 'Light bench', day: '2026-09-06', started_at: '2026-09-06T07:30:00Z', finished_at: '2026-09-06T08:00:00Z',
  exercises: [{ exercise_id: bench, notes: null, sets: [{ set_type: 'normal', weight_kg: 50, reps: 5 }] }] });
assert(Number((await one(W, `select best_e1rm from personal_records where exercise_id = $1`, [bench])).best_e1rm) === 80,
  'lowering an edited set lowers the record back to 60 x 10');
blocked = false;
try { await as(U, `select update_workout($1::jsonb)`, [JSON.stringify({ id: target.id, name: 'x', day: '2026-09-06',
  started_at: '2026-09-06T07:30:00Z', finished_at: '2026-09-06T08:00:00Z', exercises: [{ exercise_id: bench, sets: [] }] })]); } catch { blocked = true; }
assert(blocked, "you can't edit someone else's workout");
blocked = false;
try { await edit({ id: target.id, name: 'x', day: '2026-09-06', started_at: '2026-09-06T09:00:00Z', finished_at: '2026-09-06T08:00:00Z',
  exercises: [{ exercise_id: bench, sets: [] }] }); } catch { blocked = true; }
assert(blocked, 'a workout has to end after it starts');

// Merging a custom exercise (e.g. from a Hevy import) into the library one
const curlLib = (await one(W, `select id from exercises where created_by is null and name = 'Bicep Curl (Dumbbell)'`)).id;
const curlCustom = (await one(W, `insert into exercises (name, primary_muscle, equipment, created_by) values ('Biceps Curl (Dumbbell)', 'other', 'other', '${W}') returning id`)).id;
const curlDay = (day, w) => ({ name: 'Arms', routine_id: null, day, started_at: `${day}T10:00:00Z`, finished_at: `${day}T10:40:00Z`,
  exercises: [{ exercise_id: curlCustom, notes: null, sets: [{ set_type: 'normal', weight_kg: w, reps: 10 }] }] });
await save(curlDay('2026-09-10', 12));
await save(curlDay('2026-09-12', 14));
const curlRoutine = (await one(W, `insert into routines (name) values ('Arms') returning id`)).id;
await as(W, `insert into routine_exercises (routine_id, exercise_id, position) values ($1, $2, 1)`, [curlRoutine, curlCustom]);
blocked = false;
try { await as(U, `select merge_exercises($1::jsonb)`, [JSON.stringify([{ from: curlCustom, to: curlLib }])]); } catch { blocked = true; }
assert(blocked, "you can't merge someone else's custom exercise");
blocked = false;
try { await as(W, `select merge_exercises($1::jsonb)`, [JSON.stringify([{ from: curlLib, to: bench }])]); } catch { blocked = true; }
assert(blocked, "library exercises can't be merged away");
const merged = (await one(W, `select merge_exercises($1::jsonb) n`, [JSON.stringify([{ from: curlCustom, to: curlLib }])])).n;
assert(merged === 1, 'merge reports how many exercises it merged');
const moved = await one(W, `select count(*)::int n from workout_exercises we join workouts w on w.id = we.workout_id where we.exercise_id = $1`, [curlLib]);
assert(moved.n === 2, `logged sessions move to the library exercise (${moved.n})`);
assert((await one(W, `select exercise_id from routine_exercises where routine_id = $1`, [curlRoutine])).exercise_id === curlLib,
  'routines move to the library exercise');
assert((await as(W, `select * from exercises where id = $1`, [curlCustom])).rows.length === 0, 'the custom copy is deleted');
assert(Number((await one(W, `select best_weight from personal_records where exercise_id = $1`, [curlLib])).best_weight) === 14,
  'records are worked out for the library exercise');
assert(JSON.stringify(await medals('2026-09-12')) === '[true]' && JSON.stringify(await medals('2026-09-10')) === '[false]',
  'medals are recomputed after merging');

console.log('\nAll SQL checks passed.');
