-- exercise_bests: your heaviest working weight and best estimated 1RM per exercise,
-- so the app can celebrate a PR the moment a set is ticked off.
create function public.exercise_bests(p_exercise_ids uuid[])
returns table (exercise_id uuid, best_e1rm numeric, best_weight numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select we.exercise_id, max(s.e1rm), max(s.weight_kg)
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where we.exercise_id = any (p_exercise_ids)
    and w.user_id = auth.uid()
    and s.set_type <> 'warmup'
  group by we.exercise_id;
$$;

revoke all on function public.exercise_bests(uuid[]) from public, anon;
grant execute on function public.exercise_bests(uuid[]) to authenticated;
