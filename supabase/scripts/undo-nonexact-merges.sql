-- One-off: put back every merge on one account where the two names aren't exactly the same (ignoring
-- only upper/lower case and surrounding spaces). Custom exercises, their sets and routines return, and
-- PRs and records are worked out again. Hand-picked merges are included: the log can't tell them apart.
-- Run after migration 20261031000001_search_and_exact_mapping.sql is pushed:
--   npx supabase db query --linked -f supabase/scripts/undo-nonexact-merges.sql
-- All or nothing: any failure, or any change in the number of logged sets, rolls everything back.
-- To preview, run the select at the bottom on its own first.
do $$
declare
  v_user constant uuid := '45fc2fd5-73ff-472a-bb0b-865f70c914b3';
  v_log record;
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where w.user_id = v_user;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  for v_log in
    select l.id
    from exercise_merge_log l
    left join exercises e on e.id = l.to_exercise_id
    where l.user_id = v_user
      and l.undone_at is null
      and lower(trim(l.from_exercise ->> 'name')) is distinct from lower(trim(e.name))
    order by l.merged_at desc
  loop
    perform undo_exercise_merge(v_log.id);
  end loop;

  select count(*) into v_after
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where w.user_id = v_user;
  if v_after <> v_before then
    raise exception 'logged sets changed from % to %', v_before, v_after;
  end if;
end;
$$;

-- What is left merged afterwards (before the run, this same list shows what will stay merged).
select l.from_exercise ->> 'name' as custom, e.name as library, l.merged_at
from exercise_merge_log l
left join exercises e on e.id = l.to_exercise_id
where l.user_id = '45fc2fd5-73ff-472a-bb0b-865f70c914b3' and l.undone_at is null
order by l.merged_at desc;
