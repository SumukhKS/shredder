-- Remembering which exercise an imported name means, and being able to undo a merge.
--
-- exercise_aliases: a name from another app -> the exercise it is. Rows with no user_id are known
-- renames that hold for everyone; a user's own rows (their merges and import choices) win over them.
-- exercise_merge_log: enough about each merge to put it back: a copy of the deleted custom exercise
-- and which logged sessions and routine entries moved.

create function public.exercise_alias_key(p_name text)
returns text
language sql
immutable
as $$
  -- Keep in step with aliasKey in src/lib/exercise-match.ts.
  select regexp_replace(replace(lower(p_name), '&', 'and'), '[^a-z0-9]', '', 'g')
$$;

create table public.exercise_aliases (
  id          uuid primary key default gen_random_uuid(),
  alias_key   text not null check (alias_key <> ''),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create unique index exercise_aliases_shared on public.exercise_aliases (alias_key) where user_id is null;
create unique index exercise_aliases_own on public.exercise_aliases (user_id, alias_key) where user_id is not null;

alter table public.exercise_aliases enable row level security;
create policy "aliases read" on public.exercise_aliases
  for select to authenticated using (user_id is null or user_id = (select auth.uid()));
create policy "own aliases write" on public.exercise_aliases
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Known renames: the same exercise under another app's name. Only clear matches belong here, because
-- they merge by themselves for everyone. A target missing from the library is simply skipped.
insert into public.exercise_aliases (alias_key, exercise_id)
select public.exercise_alias_key(a.alias), e.id
from (values
  ('Skull Crusher (Barbell)', 'Skull Crusher (EZ Bar)'),
  ('Preacher Curl (Barbell)', 'Preacher Curl (EZ Bar)'),
  ('Cable Fly Crossovers', 'Cable Crossover'),
  ('Seated Cable Row - V Grip (Cable)', 'Seated Cable Row'),
  ('Seated Cable Row - Bar Grip (Cable)', 'Seated Cable Row'),
  ('Seated Cable Row - Bar Grip', 'Seated Cable Row'),
  ('Butterfly (Pec Deck)', 'Pec Deck'),
  ('Dumbbell Row', 'Single Arm Row (Dumbbell)'),
  ('Overhead Press (Dumbbell)', 'Shoulder Press (Dumbbell)'),
  ('Bicep Curl (Cable)', 'Cable Curl'),
  ('Triceps Rope Pushdown', 'Triceps Pushdown (Rope)'),
  ('Treadmill', 'Treadmill Run'),
  ('Jump Rope', 'Skipping Rope'),
  ('Ab Wheel', 'Ab Wheel Rollout'),
  ('Cycling (Machine)', 'Cycling (Stationary)'),
  ('Lat Pulldown (Machine)', 'Front Pulldown (Machine)'),
  ('Seated Shoulder Press (Machine)', 'Shoulder Press (Machine)'),
  ('Shoulder Press (Machine Plates)', 'Shoulder Press (Machine)'),
  ('Iso-Lateral Chest Press (Machine)', 'Chest Press (Machine)'),
  ('Rear Delt Reverse Fly (Machine)', 'Seated Reverse Fly (Machine)'),
  ('Seated Incline Curl (Dumbbell)', 'Incline Curl (Dumbbell)'),
  ('Iso-Lateral Row (Machine)', 'Unilateral Row (Machine)'),
  ('Chest Fly (Machine)', 'Pec Deck'),
  ('Triceps Kickback (Cable)', 'Kickback (Cable)'),
  ('Triceps Kickback (Dumbbell)', 'Kickback (Dumbbell)'),
  ('Hanging Leg Raises (Weighted)', 'Hanging Leg Raise'),
  ('Decline Crunch (Weighted)', 'Decline Crunch'),
  ('Lying Leg Raise', 'Lying Leg Raise Flat Bench'),
  ('Lying Leg Raises (Weighted)', 'Lying Leg Raise Flat Bench'),
  ('Hammer Curl (Cable)', 'Hammer Curl (With Rope) (Cable)'),
  ('Seated Wrist Extension (Barbell)', 'Reverse Wrist Curl (Barbell)'),
  ('Squat (Bodyweight)', 'Quads (Bodyweight Squat)')
) as a (alias, target)
join public.exercises e on e.name = a.target and e.created_by is null
on conflict do nothing;

create table public.exercise_merge_log (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  from_exercise        jsonb not null,
  to_exercise_id       uuid not null references public.exercises (id) on delete cascade,
  workout_exercise_ids uuid[] not null default '{}',
  routine_exercise_ids uuid[] not null default '{}',
  merged_at            timestamptz not null default now(),
  undone_at            timestamptz
);
create index exercise_merge_log_user on public.exercise_merge_log (user_id, merged_at desc);

alter table public.exercise_merge_log enable row level security;
create policy "own merge log read" on public.exercise_merge_log
  for select to authenticated using (user_id = (select auth.uid()));

-- As before, plus: the merge is logged, and the name is remembered so a later import uses the same exercise.
create or replace function public.merge_exercises(p_pairs jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pair jsonb;
  v_from uuid;
  v_to uuid;
  v_custom exercises;
  v_workouts uuid[];
  v_routines uuid[];
  v_targets uuid[] := '{}';
  v_count int := 0;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  for v_pair in select * from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb)) loop
    v_from := (v_pair ->> 'from')::uuid;
    v_to := (v_pair ->> 'to')::uuid;
    if v_from = v_to then
      continue;
    end if;
    -- Only your own custom exercise can be merged away, and only into one you can see.
    select * into v_custom from exercises where id = v_from and created_by = v_user;
    if not found then
      raise exception 'exercise % is not one of your custom exercises', v_from;
    end if;
    if not exists (select 1 from exercises where id = v_to and (created_by is null or created_by = v_user)) then
      raise exception 'exercise % is not in the library', v_to;
    end if;

    with moved as (
      update workout_exercises we set exercise_id = v_to
      from workouts w
      where w.id = we.workout_id and w.user_id = v_user and we.exercise_id = v_from
      returning we.id
    )
    select coalesce(array_agg(id), '{}') into v_workouts from moved;

    with moved as (
      update routine_exercises re set exercise_id = v_to
      from routines r
      where r.id = re.routine_id and r.user_id = v_user and re.exercise_id = v_from
      returning re.id
    )
    select coalesce(array_agg(id), '{}') into v_routines from moved;

    insert into exercise_merge_log (user_id, from_exercise, to_exercise_id, workout_exercise_ids, routine_exercise_ids)
    values (v_user, to_jsonb(v_custom), v_to, v_workouts, v_routines);

    -- Earlier names for this exercise follow it, and its own name now means the target.
    update exercise_aliases set exercise_id = v_to where user_id = v_user and exercise_id = v_from;
    insert into exercise_aliases (alias_key, exercise_id, user_id)
    values (exercise_alias_key(v_custom.name), v_to, v_user)
    on conflict (user_id, alias_key) where user_id is not null do update set exercise_id = excluded.exercise_id;

    delete from personal_records where user_id = v_user and exercise_id = v_from;
    delete from exercises where id = v_from and created_by = v_user;

    v_targets := array_append(v_targets, v_to);
    v_count := v_count + 1;
  end loop;

  perform refresh_prs(v_user, v_targets);
  perform refresh_records(v_user, v_targets);
  return v_count;
end;
$$;

-- Puts a merged custom exercise back, with the sessions and routine entries that moved.
create function public.undo_exercise_merge(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_log exercise_merge_log;
  v_custom exercises;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  select * into v_log from exercise_merge_log where id = p_log_id and user_id = v_user and undone_at is null;
  if not found then
    raise exception 'that merge cannot be undone';
  end if;

  v_custom := jsonb_populate_record(null::exercises, v_log.from_exercise);
  insert into exercises select v_custom.*;

  update workout_exercises we set exercise_id = v_custom.id
  from workouts w
  where w.id = we.workout_id and w.user_id = v_user and we.id = any (v_log.workout_exercise_ids);

  update routine_exercises re set exercise_id = v_custom.id
  from routines r
  where r.id = re.routine_id and r.user_id = v_user and re.id = any (v_log.routine_exercise_ids);

  delete from exercise_aliases where user_id = v_user and alias_key = exercise_alias_key(v_custom.name);
  update exercise_merge_log set undone_at = now() where id = p_log_id;

  perform refresh_prs(v_user, array[v_custom.id, v_log.to_exercise_id]);
  perform refresh_records(v_user, array[v_custom.id, v_log.to_exercise_id]);
end;
$$;

revoke all on function public.merge_exercises(jsonb) from public, anon;
grant execute on function public.merge_exercises(jsonb) to authenticated;
revoke all on function public.undo_exercise_merge(uuid) from public, anon;
grant execute on function public.undo_exercise_merge(uuid) to authenticated;
