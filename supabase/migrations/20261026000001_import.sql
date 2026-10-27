-- Importing history from other apps (Hevy). Imported workouts keep where they came from
-- and an id from that app, so importing again skips what is already here. They count for
-- history, charts and personal records, but earn no XP.

alter table public.workouts
  add column source text not null default 'shredder' check (source in ('shredder', 'hevy')),
  add column external_id text;
create unique index workouts_external on public.workouts (user_id, source, external_id)
  where external_id is not null;

alter table public.routines
  add column source text not null default 'shredder' check (source in ('shredder', 'hevy')),
  add column external_id text;
create unique index routines_external on public.routines (user_id, source, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- import_workouts: saves a batch of past workouts, then refreshes personal records
-- ---------------------------------------------------------------------------
-- Payload shape:
-- {
--   "source": "hevy",
--   "workouts": [
--     { "external_id": "2026-10-20T12:30Z", "name": "Push day", "day": "2026-10-20",
--       "started_at": "...", "finished_at": "...", "notes": null,
--       "exercises": [ { "exercise_id": "...", "notes": null, "sets": [ ...as finish_workout... ] } ] }
--   ]
-- }
create function public.import_workouts(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_source text := p ->> 'source';
  v_w jsonb;
  v_ex jsonb;
  v_set jsonb;
  v_workout uuid;
  v_we uuid;
  v_ex_pos int;
  v_set_pos int;
  v_type text;
  v_weight numeric;
  v_reps int;
  v_e1rm numeric;
  v_volume numeric;
  v_sets int;
  v_touched uuid[] := '{}';
  v_imported int := 0;
  v_skipped int := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if v_source is null or v_source = 'shredder' then
    raise exception 'unknown import source';
  end if;

  for v_w in select * from jsonb_array_elements(coalesce(p -> 'workouts', '[]'::jsonb)) loop
    if jsonb_array_length(coalesce(v_w -> 'exercises', '[]'::jsonb)) = 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into workouts (user_id, name, day, started_at, finished_at, notes, source, external_id)
    values (
      v_user,
      coalesce(nullif(trim(v_w ->> 'name'), ''), 'Workout'),
      (v_w ->> 'day')::date,
      (v_w ->> 'started_at')::timestamptz,
      greatest((v_w ->> 'finished_at')::timestamptz, (v_w ->> 'started_at')::timestamptz),
      nullif(trim(v_w ->> 'notes'), ''),
      v_source,
      v_w ->> 'external_id'
    )
    on conflict (user_id, source, external_id) where external_id is not null do nothing
    returning id into v_workout;

    if v_workout is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_imported := v_imported + 1;
    v_ex_pos := 0;
    v_volume := 0;
    v_sets := 0;

    for v_ex in select * from jsonb_array_elements(v_w -> 'exercises') loop
      v_ex_pos := v_ex_pos + 1;
      insert into workout_exercises (workout_id, exercise_id, position, notes)
      values (v_workout, (v_ex ->> 'exercise_id')::uuid, v_ex_pos, nullif(trim(v_ex ->> 'notes'), ''))
      returning id into v_we;
      v_touched := v_touched || (v_ex ->> 'exercise_id')::uuid;

      v_set_pos := 0;
      for v_set in select * from jsonb_array_elements(v_ex -> 'sets') loop
        v_set_pos := v_set_pos + 1;
        v_type := coalesce(v_set ->> 'set_type', 'normal');
        v_weight := nullif(v_set ->> 'weight_kg', '')::numeric;
        v_reps := nullif(v_set ->> 'reps', '')::int;
        v_e1rm := null;
        -- Same Epley rule as finish_workout
        if v_type <> 'warmup' and v_weight > 0 and v_reps between 1 and 12 then
          v_e1rm := round(v_weight * (1 + v_reps / 30.0), 1);
        end if;

        insert into workout_sets (workout_exercise_id, position, set_type, weight_kg, reps,
                                  duration_s, distance_m, rpe, e1rm)
        values (v_we, v_set_pos, v_type, v_weight, v_reps,
                nullif(v_set ->> 'duration_s', '')::int,
                nullif(v_set ->> 'distance_m', '')::numeric,
                nullif(v_set ->> 'rpe', '')::numeric,
                v_e1rm);

        if v_type <> 'warmup' then
          v_sets := v_sets + 1;
          v_volume := v_volume + coalesce(v_weight, 0) * coalesce(v_reps, 0);
        end if;
      end loop;
    end loop;

    update workouts set total_volume = v_volume, total_sets = v_sets where id = v_workout;
  end loop;

  -- Personal records: the best set ever logged for each exercise this batch touched,
  -- across all of the user's workouts. Imports never award XP or PR badges.
  insert into personal_records (user_id, exercise_id, best_e1rm, best_weight, reps, workout_id, achieved_at)
  select distinct on (we.exercise_id)
         v_user, we.exercise_id, s.e1rm, s.weight_kg, s.reps, w.id, w.started_at
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where w.user_id = v_user
    and we.exercise_id = any (v_touched)
    and s.e1rm is not null
  order by we.exercise_id, s.e1rm desc, w.started_at
  on conflict (user_id, exercise_id) do update
    set best_e1rm = excluded.best_e1rm,
        best_weight = excluded.best_weight,
        reps = excluded.reps,
        workout_id = excluded.workout_id,
        achieved_at = excluded.achieved_at
    where excluded.best_e1rm > personal_records.best_e1rm;

  return jsonb_build_object('imported', v_imported, 'skipped', v_skipped);
end;
$$;

revoke all on function public.import_workouts(jsonb) from public, anon;
grant execute on function public.import_workouts(jsonb) to authenticated;
