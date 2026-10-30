-- One request each for Today's day and week, instead of seven. Each new connection through the proxy
-- costs about a second, so this is what makes Today quick. Row-level security still decides what's seen.

create function public.day_bundle(p_day date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'logs', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from food_logs l where l.day = p_day), '[]'::jsonb),
    'water', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'ml', w.ml) order by w.created_at) from water_logs w where w.day = p_day), '[]'::jsonb),
    'health', (select jsonb_build_object('day', h.day, 'steps', h.steps, 'sleep_min', h.sleep_min, 'source', h.source) from daily_health h where h.day = p_day),
    'workouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'day', w.day, 'started_at', w.started_at, 'duration_s', w.duration_s,
        'total_volume', w.total_volume, 'total_sets', w.total_sets, 'pr_count', w.pr_count
      ) order by w.started_at)
      from workouts w where w.day = p_day
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.day_bundle(date) from public, anon;
grant execute on function public.day_bundle(date) to authenticated;

-- Water, steps and sleep for each of the `p_days` days ending on `p_end`, oldest first.
create function public.habit_week(p_end date, p_days int default 7)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_agg(jsonb_build_object(
    'day', d.day,
    'water', coalesce((select sum(w.ml) from water_logs w where w.day = d.day), 0),
    'steps', coalesce((select h.steps from daily_health h where h.day = d.day), 0),
    'sleep', coalesce((select h.sleep_min from daily_health h where h.day = d.day), 0)
  ) order by d.day)
  from (select (p_end - g)::date as day from generate_series(0, greatest(p_days, 1) - 1) g) d;
$$;
revoke all on function public.habit_week(date, int) from public, anon;
grant execute on function public.habit_week(date, int) to authenticated;
