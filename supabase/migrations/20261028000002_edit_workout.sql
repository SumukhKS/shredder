-- update_workout: edit a workout after it was logged (name, date, start and end time, exercises
-- and sets). The exercises and sets are replaced as a whole, then totals, set medals and
-- personal records are recomputed for every exercise the workout had before or has now.
-- Editing never changes the XP the workout earned.
-- ---------------------------------------------------------------------------
-- Payload shape:
-- { "id": "...", "name": "Push day", "day": "2026-10-20", "started_at": "...", "finished_at": "...",
--   "exercises": [ { "exercise_id": "...", "notes": null, "sets": [ ...as finish_workout... ] } ] }

-- personal_records for some exercises, rebuilt from the whole history (an edit can lower a best).
create function public.refresh_records(p_user uuid, p_exercise_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or coalesce(cardinality(p_exercise_ids), 0) = 0 then
    return;
  end if;
  delete from personal_records where user_id = p_user and exercise_id = any (p_exercise_ids);
  insert into personal_records (user_id, exercise_id, best_e1rm, best_weight, reps, workout_id, achieved_at)
  select distinct on (we.exercise_id)
         p_user, we.exercise_id, s.e1rm, s.weight_kg, s.reps, w.id, w.started_at
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where w.user_id = p_user
    and we.exercise_id = any (p_exercise_ids)
    and s.e1rm is not null
  order by we.exercise_id, s.e1rm desc, w.started_at;
end;
$$;

revoke all on function public.refresh_records(uuid, uuid[]) from public, anon, authenticated;

create function public.update_workout(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_workout uuid := (p ->> 'id')::uuid;
  v_started timestamptz := (p ->> 'started_at')::timestamptz;
  v_finished timestamptz := (p ->> 'finished_at')::timestamptz;
  v_touched uuid[];
  v_we uuid;
  v_ex jsonb;
  v_set jsonb;
  v_ex_pos int := 0;
  v_set_pos int;
  v_weight numeric;
  v_reps int;
  v_type text;
  v_e1rm numeric;
  v_volume numeric := 0;
  v_sets int := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from workouts where id = v_workout and user_id = v_user) then
    raise exception 'workout not found';
  end if;
  if jsonb_array_length(coalesce(p -> 'exercises', '[]'::jsonb)) = 0 then
    raise exception 'workout has no exercises';
  end if;
  if v_started is null or v_finished is null or v_finished < v_started then
    raise exception 'the workout must end after it starts';
  end if;

  select array_agg(distinct exercise_id) into v_touched from workout_exercises where workout_id = v_workout;

  update workouts
  set name = coalesce(nullif(trim(p ->> 'name'), ''), 'Workout'),
      day = (p ->> 'day')::date,
      started_at = v_started,
      finished_at = v_finished
  where id = v_workout;

  delete from workout_exercises where workout_id = v_workout;

  for v_ex in select * from jsonb_array_elements(p -> 'exercises') loop
    v_ex_pos := v_ex_pos + 1;
    insert into workout_exercises (workout_id, exercise_id, position, notes)
    values (v_workout, (v_ex ->> 'exercise_id')::uuid, v_ex_pos, nullif(trim(v_ex ->> 'notes'), ''))
    returning id into v_we;
    v_touched := coalesce(v_touched, '{}') || (v_ex ->> 'exercise_id')::uuid;

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

  select array_agg(distinct x) into v_touched from unnest(v_touched) x;
  perform refresh_prs(v_user, v_touched);
  perform refresh_records(v_user, v_touched);

  return jsonb_build_object('workout_id', v_workout, 'total_volume', v_volume, 'total_sets', v_sets);
end;
$$;

revoke all on function public.update_workout(jsonb) from public, anon;
grant execute on function public.update_workout(jsonb) to authenticated;
