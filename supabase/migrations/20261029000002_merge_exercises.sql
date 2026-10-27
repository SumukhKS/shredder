-- Merge your custom exercises into library ones (e.g. ones a Hevy import created before the library
-- had them). Every logged set, routine entry and record moves to the library exercise, then the
-- custom copy is deleted and PR medals and records are worked out again for the merged exercises.

create function public.merge_exercises(p_pairs jsonb)
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
    if not exists (select 1 from exercises where id = v_from and created_by = v_user) then
      raise exception 'exercise % is not one of your custom exercises', v_from;
    end if;
    if not exists (select 1 from exercises where id = v_to and (created_by is null or created_by = v_user)) then
      raise exception 'exercise % is not in the library', v_to;
    end if;

    update workout_exercises we set exercise_id = v_to
    from workouts w
    where w.id = we.workout_id and w.user_id = v_user and we.exercise_id = v_from;

    update routine_exercises re set exercise_id = v_to
    from routines r
    where r.id = re.routine_id and r.user_id = v_user and re.exercise_id = v_from;

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

revoke all on function public.merge_exercises(jsonb) from public, anon;
grant execute on function public.merge_exercises(jsonb) to authenticated;
