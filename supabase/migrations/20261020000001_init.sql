-- Shredder core schema
-- Every user-owned table has row level security. XP is awarded only by
-- server-side functions so the client can't grant itself points.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text,
  sex               text check (sex in ('male', 'female')),
  birth_year        int check (birth_year between 1900 and 2100),
  height_cm         numeric(5, 1),
  weight_kg         numeric(5, 1),
  activity_level    text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'athlete')),
  goal              text check (goal in ('cut', 'maintain', 'bulk')),
  calorie_target    int not null default 2200,
  protein_g         int not null default 140,
  carbs_g           int not null default 250,
  fat_g             int not null default 70,
  water_ml_target   int not null default 3000,
  steps_target      int not null default 8000,
  sleep_min_target  int not null default 480,
  total_xp          int not null default 0,
  current_streak    int not null default 0,
  longest_streak    int not null default 0,
  last_active_day   date,
  onboarded         boolean not null default false,
  created_at        timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Exercises and routines
-- ---------------------------------------------------------------------------
create table public.exercises (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  primary_muscle     text not null,
  secondary_muscles  text[] not null default '{}',
  equipment          text not null default 'barbell',
  kind               text not null default 'weight_reps'
                     check (kind in ('weight_reps', 'bodyweight_reps', 'duration', 'distance_time')),
  created_by         uuid references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now()
);
create index exercises_name_trgm on public.exercises using gin (name gin_trgm_ops);

create table public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index routines_user on public.routines (user_id);

create table public.routine_exercises (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references public.routines (id) on delete cascade,
  exercise_id   uuid not null references public.exercises (id) on delete restrict,
  position      int not null,
  target_sets   int not null default 3,
  target_reps   text not null default '8-12',
  rest_seconds  int not null default 90
);
create index routine_exercises_routine on public.routine_exercises (routine_id);

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------
create table public.workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id    uuid references public.routines (id) on delete set null,
  name          text not null,
  day           date not null,
  started_at    timestamptz not null,
  finished_at   timestamptz not null,
  duration_s    int generated always as (extract(epoch from finished_at - started_at)::int) stored,
  notes         text,
  total_volume  numeric(10, 1) not null default 0,
  total_sets    int not null default 0,
  pr_count      int not null default 0,
  xp_earned     int not null default 0,
  created_at    timestamptz not null default now()
);
create index workouts_user_day on public.workouts (user_id, day desc);

create table public.workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.workouts (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete restrict,
  position     int not null,
  notes        text
);
create index workout_exercises_workout on public.workout_exercises (workout_id);
create index workout_exercises_exercise on public.workout_exercises (exercise_id);

create table public.workout_sets (
  id                   uuid primary key default gen_random_uuid(),
  workout_exercise_id  uuid not null references public.workout_exercises (id) on delete cascade,
  position             int not null,
  set_type             text not null default 'normal' check (set_type in ('warmup', 'normal', 'drop', 'failure')),
  weight_kg            numeric(6, 2),
  reps                 int,
  duration_s           int,
  distance_m           numeric(8, 1),
  rpe                  numeric(3, 1) check (rpe between 1 and 10),
  e1rm                 numeric(6, 1),
  is_pr                boolean not null default false
);
create index workout_sets_we on public.workout_sets (workout_exercise_id);

create table public.personal_records (
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  best_e1rm    numeric(6, 1) not null,
  best_weight  numeric(6, 2) not null,
  reps         int not null,
  workout_id   uuid references public.workouts (id) on delete set null,
  achieved_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- ---------------------------------------------------------------------------
-- Nutrition
-- ---------------------------------------------------------------------------
create table public.foods (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  brand          text,
  barcode        text unique,
  source         text not null default 'custom' check (source in ('seed', 'off', 'custom')),
  serving_label  text not null default '100 g',
  serving_g      numeric(7, 1) not null default 100,
  kcal_100g      numeric(6, 1) not null,
  protein_100g   numeric(5, 1) not null default 0,
  carbs_100g     numeric(5, 1) not null default 0,
  fat_100g       numeric(5, 1) not null default 0,
  fiber_100g     numeric(5, 1),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index foods_name_trgm on public.foods using gin (name gin_trgm_ops);

create table public.food_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  meal        text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snacks')),
  food_id     uuid references public.foods (id) on delete set null,
  food_name   text not null,
  grams       numeric(7, 1) not null check (grams > 0),
  kcal        numeric(7, 1) not null,
  protein     numeric(6, 1) not null default 0,
  carbs       numeric(6, 1) not null default 0,
  fat         numeric(6, 1) not null default 0,
  created_at  timestamptz not null default now()
);
create index food_logs_user_day on public.food_logs (user_id, day);

create table public.water_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  ml          int not null check (ml > 0 and ml <= 5000),
  created_at  timestamptz not null default now()
);
create index water_logs_user_day on public.water_logs (user_id, day);

-- ---------------------------------------------------------------------------
-- Health and body
-- ---------------------------------------------------------------------------
create table public.daily_health (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  steps      int check (steps >= 0),
  sleep_min  int check (sleep_min between 0 and 1440),
  source     text not null default 'manual' check (source in ('manual', 'healthkit', 'health_connect')),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.body_metrics (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day           date not null,
  weight_kg     numeric(5, 1) not null,
  body_fat_pct  numeric(4, 1),
  unique (user_id, day)
);

-- ---------------------------------------------------------------------------
-- XP ledger
-- ---------------------------------------------------------------------------
create table public.xp_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  amount      int not null,
  ref         text not null,
  day         date not null,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index xp_events_user_day on public.xp_events (user_id, day desc);

-- Awards XP once per (user, kind, ref) and keeps the daily streak current.
-- Returns the XP actually granted, including any streak bonus.
create function public.award_xp(p_user uuid, p_kind text, p_amount int, p_ref text, p_day date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
  v_last date;
  v_streak int;
  v_bonus int := 0;
begin
  insert into xp_events (user_id, kind, amount, ref, day)
  values (p_user, p_kind, p_amount, p_ref, p_day)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 0;
  end if;

  select last_active_day, current_streak into v_last, v_streak
  from profiles where id = p_user for update;

  if v_last is null or p_day > v_last then
    v_streak := case when v_last = p_day - 1 then v_streak + 1 else 1 end;
    -- First activity of a new day: streak bonus, 5 XP per streak day, capped at 50.
    v_bonus := least(v_streak, 10) * 5;
    insert into xp_events (user_id, kind, amount, ref, day)
    values (p_user, 'streak', v_bonus, p_day::text, p_day)
    on conflict (user_id, kind, ref) do nothing;

    update profiles
    set current_streak = v_streak,
        longest_streak = greatest(longest_streak, v_streak),
        last_active_day = p_day,
        total_xp = total_xp + p_amount + v_bonus
    where id = p_user;
  else
    update profiles set total_xp = total_xp + p_amount where id = p_user;
  end if;

  return p_amount + v_bonus;
end;
$$;

revoke all on function public.award_xp(uuid, text, int, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- finish_workout: saves a whole workout atomically, detects PRs, awards XP
-- ---------------------------------------------------------------------------
-- Payload shape:
-- {
--   "name": "Push day", "routine_id": null, "day": "2026-10-20",
--   "started_at": "...", "finished_at": "...", "notes": null,
--   "exercises": [
--     { "exercise_id": "...", "notes": null,
--       "sets": [ { "set_type": "normal", "weight_kg": 60, "reps": 8,
--                   "duration_s": null, "distance_m": null, "rpe": 8 } ] }
--   ]
-- }
create function public.finish_workout(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (p ->> 'day')::date;
  v_workout uuid;
  v_we uuid;
  v_ex jsonb;
  v_set jsonb;
  v_ex_pos int := 0;
  v_set_pos int;
  v_weight numeric;
  v_reps int;
  v_type text;
  v_e1rm numeric;
  v_best_e1rm numeric;
  v_best_set uuid;
  v_best_weight numeric;
  v_best_reps int;
  v_set_id uuid;
  v_prev numeric;
  v_volume numeric := 0;
  v_sets int := 0;
  v_prs jsonb := '[]'::jsonb;
  v_xp int;
  v_granted int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_array_length(coalesce(p -> 'exercises', '[]'::jsonb)) = 0 then
    raise exception 'workout has no exercises';
  end if;

  insert into workouts (user_id, routine_id, name, day, started_at, finished_at, notes)
  values (
    v_user,
    nullif(p ->> 'routine_id', '')::uuid,
    coalesce(nullif(trim(p ->> 'name'), ''), 'Workout'),
    v_day,
    (p ->> 'started_at')::timestamptz,
    (p ->> 'finished_at')::timestamptz,
    p ->> 'notes'
  )
  returning id into v_workout;

  for v_ex in select * from jsonb_array_elements(p -> 'exercises') loop
    v_ex_pos := v_ex_pos + 1;
    insert into workout_exercises (workout_id, exercise_id, position, notes)
    values (v_workout, (v_ex ->> 'exercise_id')::uuid, v_ex_pos, v_ex ->> 'notes')
    returning id into v_we;

    v_set_pos := 0;
    v_best_e1rm := 0;
    v_best_set := null;

    for v_set in select * from jsonb_array_elements(v_ex -> 'sets') loop
      v_set_pos := v_set_pos + 1;
      v_type := coalesce(v_set ->> 'set_type', 'normal');
      v_weight := nullif(v_set ->> 'weight_kg', '')::numeric;
      v_reps := nullif(v_set ->> 'reps', '')::int;
      v_e1rm := null;

      -- Epley estimate, only trusted for working sets of 1-12 reps
      if v_type <> 'warmup' and v_weight > 0 and v_reps between 1 and 12 then
        v_e1rm := round(v_weight * (1 + v_reps / 30.0), 1);
      end if;

      insert into workout_sets (workout_exercise_id, position, set_type, weight_kg, reps,
                                duration_s, distance_m, rpe, e1rm)
      values (v_we, v_set_pos, v_type, v_weight, v_reps,
              nullif(v_set ->> 'duration_s', '')::int,
              nullif(v_set ->> 'distance_m', '')::numeric,
              nullif(v_set ->> 'rpe', '')::numeric,
              v_e1rm)
      returning id into v_set_id;

      if v_type <> 'warmup' then
        v_sets := v_sets + 1;
        v_volume := v_volume + coalesce(v_weight, 0) * coalesce(v_reps, 0);
      end if;

      if v_e1rm is not null and v_e1rm > v_best_e1rm then
        v_best_e1rm := v_e1rm;
        v_best_set := v_set_id;
        v_best_weight := v_weight;
        v_best_reps := v_reps;
      end if;
    end loop;

    if v_best_set is not null then
      select best_e1rm into v_prev
      from personal_records
      where user_id = v_user and exercise_id = (v_ex ->> 'exercise_id')::uuid;

      if v_prev is null or v_best_e1rm > v_prev then
        insert into personal_records (user_id, exercise_id, best_e1rm, best_weight, reps, workout_id, achieved_at)
        values (v_user, (v_ex ->> 'exercise_id')::uuid, v_best_e1rm, v_best_weight, v_best_reps, v_workout, now())
        on conflict (user_id, exercise_id) do update
          set best_e1rm = excluded.best_e1rm,
              best_weight = excluded.best_weight,
              reps = excluded.reps,
              workout_id = excluded.workout_id,
              achieved_at = excluded.achieved_at;

        -- The first time an exercise is logged sets a baseline, not a PR.
        if v_prev is not null then
          update workout_sets set is_pr = true where id = v_best_set;
          v_prs := v_prs || jsonb_build_object(
            'exercise_id', v_ex ->> 'exercise_id',
            'name', (select name from exercises where id = (v_ex ->> 'exercise_id')::uuid),
            'e1rm', v_best_e1rm,
            'previous', v_prev
          );
        end if;
      end if;
    end if;
  end loop;

  -- 40 base + 2 per working set (max 60) + 20 per PR (max 100)
  v_xp := 40 + least(v_sets * 2, 60) + least(jsonb_array_length(v_prs) * 20, 100);
  v_granted := award_xp(v_user, 'workout', v_xp, v_workout::text, v_day);

  update workouts
  set total_volume = v_volume,
      total_sets = v_sets,
      pr_count = jsonb_array_length(v_prs),
      xp_earned = v_xp
  where id = v_workout;

  return jsonb_build_object(
    'workout_id', v_workout,
    'xp', v_granted,
    'total_volume', v_volume,
    'total_sets', v_sets,
    'prs', v_prs
  );
end;
$$;

revoke all on function public.finish_workout(jsonb) from public, anon;
grant execute on function public.finish_workout(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- XP triggers for daily habits
-- ---------------------------------------------------------------------------
create function public.xp_on_food_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_protein numeric;
  v_target int;
begin
  -- 5 XP per entry, first 6 entries a day
  select count(*) into v_count from xp_events
  where user_id = new.user_id and kind = 'food_log' and day = new.day;
  if v_count < 6 then
    perform award_xp(new.user_id, 'food_log', 5, new.id::text, new.day);
  end if;

  select coalesce(sum(protein), 0) into v_protein from food_logs
  where user_id = new.user_id and day = new.day;
  select protein_g into v_target from profiles where id = new.user_id;
  if v_protein >= v_target then
    perform award_xp(new.user_id, 'protein_goal', 20, new.day::text, new.day);
  end if;
  return new;
end;
$$;

create trigger food_logs_xp after insert on public.food_logs
  for each row execute function public.xp_on_food_log();

create function public.xp_on_water_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_target int;
begin
  select coalesce(sum(ml), 0) into v_total from water_logs
  where user_id = new.user_id and day = new.day;
  select water_ml_target into v_target from profiles where id = new.user_id;
  if v_total >= v_target then
    perform award_xp(new.user_id, 'water_goal', 15, new.day::text, new.day);
  end if;
  return new;
end;
$$;

create trigger water_logs_xp after insert on public.water_logs
  for each row execute function public.xp_on_water_log();

create function public.xp_on_daily_health()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles;
begin
  select * into v_profile from profiles where id = new.user_id;
  if new.steps is not null and new.steps >= v_profile.steps_target then
    perform award_xp(new.user_id, 'steps_goal', 20, new.day::text, new.day);
  end if;
  if new.sleep_min is not null and new.sleep_min >= v_profile.sleep_min_target - 30 then
    perform award_xp(new.user_id, 'sleep_goal', 15, new.day::text, new.day);
  end if;
  return new;
end;
$$;

create trigger daily_health_xp after insert or update on public.daily_health
  for each row execute function public.xp_on_daily_health();

create function public.xp_on_weigh_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform award_xp(new.user_id, 'weigh_in', 5, new.day::text, new.day);
  -- Keep the profile weight current for calorie calculations
  update profiles set weight_kg = new.weight_kg
  where id = new.user_id
    and new.day >= coalesce((select max(day) from body_metrics where user_id = new.user_id), new.day);
  return new;
end;
$$;

create trigger body_metrics_xp after insert or update on public.body_metrics
  for each row execute function public.xp_on_weigh_in();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.exercises         enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts          enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets      enable row level security;
alter table public.personal_records  enable row level security;
alter table public.foods             enable row level security;
alter table public.food_logs         enable row level security;
alter table public.water_logs        enable row level security;
alter table public.daily_health      enable row level security;
alter table public.body_metrics      enable row level security;
alter table public.xp_events         enable row level security;

-- Profiles: read and edit your own. XP and streak columns are not client-writable.
create policy "own profile read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (display_name, sex, birth_year, height_cm, weight_kg, activity_level, goal,
              calorie_target, protein_g, carbs_g, fat_g, water_ml_target, steps_target,
              sleep_min_target, onboarded)
  on public.profiles to authenticated;

-- Exercises: shared library plus your own custom ones
create policy "exercise read" on public.exercises
  for select to authenticated using (created_by is null or created_by = (select auth.uid()));
create policy "exercise create" on public.exercises
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "exercise edit own" on public.exercises
  for update to authenticated using (created_by = (select auth.uid()));
create policy "exercise delete own" on public.exercises
  for delete to authenticated using (created_by = (select auth.uid()));

-- Simple owner tables
create policy "own routines" on public.routines
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own workouts" on public.workouts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own food logs" on public.food_logs
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own water" on public.water_logs
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own health" on public.daily_health
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own body metrics" on public.body_metrics
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Read-only from the client
create policy "own prs read" on public.personal_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own xp read" on public.xp_events
  for select to authenticated using (user_id = (select auth.uid()));

-- Child tables follow their parent
create policy "own routine exercises" on public.routine_exercises
  for all to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy "own workout exercises" on public.workout_exercises
  for all to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())));
create policy "own workout sets" on public.workout_sets
  for all to authenticated
  using (exists (
    select 1 from public.workout_exercises we join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.workout_exercises we join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())));

-- Foods: shared catalogue, anyone signed in can add (barcode lookups get cached here)
create policy "foods read" on public.foods
  for select to authenticated using (true);
create policy "foods create" on public.foods
  for insert to authenticated with check (created_by = (select auth.uid()) and source in ('off', 'custom'));
create policy "foods edit own custom" on public.foods
  for update to authenticated using (created_by = (select auth.uid()) and source = 'custom');

-- ---------------------------------------------------------------------------
-- previous_sets: last logged working sets per exercise (the "Previous" column)
-- ---------------------------------------------------------------------------
create function public.previous_sets(p_exercise_ids uuid[])
returns table (exercise_id uuid, sets jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (we.exercise_id)
         we.exercise_id,
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'weight_kg', s.weight_kg, 'reps', s.reps,
                    'duration_s', s.duration_s, 'distance_m', s.distance_m)
                  order by s.position), '[]'::jsonb)
          from workout_sets s
          where s.workout_exercise_id = we.id and s.set_type <> 'warmup') as sets
  from workout_exercises we
  join workouts w on w.id = we.workout_id
  where we.exercise_id = any (p_exercise_ids)
    and w.user_id = auth.uid()
  order by we.exercise_id, w.started_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view public.daily_nutrition with (security_invoker = true) as
select user_id, day,
       round(sum(kcal))::int    as kcal,
       round(sum(protein), 1)   as protein,
       round(sum(carbs), 1)     as carbs,
       round(sum(fat), 1)       as fat
from public.food_logs
group by user_id, day;

create view public.weekly_volume with (security_invoker = true) as
select user_id,
       date_trunc('week', day)::date as week,
       count(*)::int                 as workouts,
       sum(total_volume)             as volume,
       sum(total_sets)::int          as sets
from public.workouts
group by user_id, date_trunc('week', day);
