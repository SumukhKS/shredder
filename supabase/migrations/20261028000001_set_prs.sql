-- Set-level PRs: every working set that beats all earlier sets of the same exercise gets a medal.
-- "Beats" means no earlier set had at least as much weight and at least as many reps, so heavier
-- weight, or more reps at that weight or heavier, both count. The first workout with an exercise
-- sets a baseline, so none of its sets are PRs. Warm-ups and sets without reps (holds, cardio) never count.
--
-- Flags are recomputed over the whole history of the exercises touched, so saving, importing
-- and deleting workouts all keep them right, and workouts.pr_count is the number of medals.
-- (personal_records, the PR list after a workout and the XP for PRs keep the best-e1rm rule.)

create function public.refresh_prs(p_user uuid, p_exercise_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or coalesce(cardinality(p_exercise_ids), 0) = 0 then
    return;
  end if;

  -- Clear every flag on these exercises, then set the medals.
  update workout_sets s
  set is_pr = false
  from workout_exercises we, workouts w
  where we.id = s.workout_exercise_id
    and w.id = we.workout_id
    and w.user_id = p_user
    and we.exercise_id = any (p_exercise_ids)
    and s.is_pr;

  with sets as (
    select s.id, we.exercise_id, w.id workout_id, coalesce(s.weight_kg, 0) wt, s.reps,
           row_number() over (partition by we.exercise_id order by w.started_at, w.id, we.position, s.position) seq
    from workout_sets s
    join workout_exercises we on we.id = s.workout_exercise_id
    join workouts w on w.id = we.workout_id
    where w.user_id = p_user
      and we.exercise_id = any (p_exercise_ids)
      and s.set_type <> 'warmup'
      and s.reps > 0
  )
  update workout_sets s
  set is_pr = true
  from sets a
  where a.id = s.id
    and exists (select 1 from sets b where b.exercise_id = a.exercise_id and b.workout_id <> a.workout_id and b.seq < a.seq)
    and not exists (
      select 1 from sets b
      where b.exercise_id = a.exercise_id and b.seq < a.seq and b.wt >= a.wt and b.reps >= a.reps
    );

  update workouts w
  set pr_count = (
    select count(*)
    from workout_sets s
    join workout_exercises we on we.id = s.workout_exercise_id
    where we.workout_id = w.id and s.is_pr
  )
  where w.user_id = p_user
    and exists (
      select 1 from workout_exercises we
      where we.workout_id = w.id and we.exercise_id = any (p_exercise_ids)
    );
end;
$$;

revoke all on function public.refresh_prs(uuid, uuid[]) from public, anon, authenticated;

-- Saving a workout: run the existing save, then refresh the medals for its exercises.
alter function public.finish_workout(jsonb) rename to finish_workout_core;
revoke all on function public.finish_workout_core(jsonb) from public, anon, authenticated;

create function public.finish_workout(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := finish_workout_core(p);
  perform refresh_prs(
    auth.uid(),
    array(select distinct (e ->> 'exercise_id')::uuid from jsonb_array_elements(p -> 'exercises') e)
  );
  return v_result;
end;
$$;

revoke all on function public.finish_workout(jsonb) from public, anon;
grant execute on function public.finish_workout(jsonb) to authenticated;

-- Importing history (e.g. from Hevy): same idea, over every exercise in the import.
alter function public.import_workouts(jsonb) rename to import_workouts_core;
revoke all on function public.import_workouts_core(jsonb) from public, anon, authenticated;

create function public.import_workouts(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := import_workouts_core(p);
  perform refresh_prs(
    auth.uid(),
    array(
      select distinct (e ->> 'exercise_id')::uuid
      from jsonb_array_elements(p -> 'workouts') w, jsonb_array_elements(w -> 'exercises') e
    )
  );
  return v_result;
end;
$$;

revoke all on function public.import_workouts(jsonb) from public, anon;
grant execute on function public.import_workouts(jsonb) to authenticated;

-- Deleting a workout (or an exercise from one) can turn later sets into PRs.
create function public.refresh_prs_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform refresh_prs(auth.uid(), array(select distinct exercise_id from gone));
  return null;
end;
$$;

revoke all on function public.refresh_prs_after_delete() from public, anon, authenticated;

create trigger workout_exercises_refresh_prs
after delete on public.workout_exercises
referencing old table as gone
for each statement
execute function public.refresh_prs_after_delete();

-- Live medals while logging: the most reps done at each weight so far, per exercise.
create function public.exercise_set_history(p_exercise_ids uuid[])
returns table (exercise_id uuid, weight_kg numeric, reps int)
language sql
stable
security invoker
set search_path = public
as $$
  select we.exercise_id, coalesce(s.weight_kg, 0), max(s.reps)
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where we.exercise_id = any (p_exercise_ids)
    and w.user_id = auth.uid()
    and s.set_type <> 'warmup'
    and s.reps > 0
  group by we.exercise_id, coalesce(s.weight_kg, 0);
$$;

revoke all on function public.exercise_set_history(uuid[]) from public, anon;
grant execute on function public.exercise_set_history(uuid[]) to authenticated;

-- Medals for the history already logged.
select public.refresh_prs(u.user_id, u.ids)
from (
  select w.user_id, array_agg(distinct we.exercise_id) ids
  from workouts w
  join workout_exercises we on we.workout_id = w.id
  group by w.user_id
) u;
