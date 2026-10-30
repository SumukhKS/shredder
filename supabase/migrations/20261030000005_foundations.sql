-- Groundwork for the screens to come: routine set rows, recipes, your own foods, ranked food search,
-- profile numbers calculated on the server, share links, progress photos, more import sources, the
-- phone's step sensor, retries that can't double-log a workout, and the app tour.

-- Routines: one row per set, each with its own target reps. Null target reps show no hint.
alter table public.routine_exercises
  add column set_targets jsonb check (set_targets is null or jsonb_typeof(set_targets) = 'array'),
  add column rest_enabled boolean not null default true;

update public.routine_exercises
set set_targets = (
  select jsonb_agg(jsonb_build_object('reps', s.reps))
  from (
    select substring(target_reps from '\d{1,3}')::int as reps
    from generate_series(1, greatest(least(target_sets, 50), 1))
  ) s
);

-- Recipes, private to each user. Items keep their own numbers, so deleting a food doesn't change a recipe.
create table public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  servings    numeric(5, 1) not null default 1 check (servings > 0 and servings <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index recipes_user on public.recipes (user_id);

create table public.recipe_items (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  position   int not null default 0,
  food_id    uuid references public.foods (id) on delete set null,
  food_name  text not null,
  grams      numeric(7, 1) not null check (grams > 0 and grams <= 100000),
  kcal       numeric(7, 1) not null check (kcal >= 0),
  protein    numeric(6, 1) not null default 0 check (protein >= 0),
  carbs      numeric(6, 1) not null default 0 check (carbs >= 0),
  fat        numeric(6, 1) not null default 0 check (fat >= 0)
);
create index recipe_items_recipe on public.recipe_items (recipe_id);

alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
create policy "own recipes" on public.recipes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own recipe items" on public.recipe_items for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())));

-- Your own foods can be deleted as well as edited. Past logs keep their numbers (food_id goes null).
create policy "foods delete own custom" on public.foods
  for delete to authenticated using (created_by = (select auth.uid()) and source = 'custom');

-- Food search on the server, so results are ranked before the row limit rather than cut off unranked:
-- your own foods, then verified ones, then community ones; within those, names starting with the search first.
create function public.search_foods(p_query text, p_limit int default 50)
returns setof public.foods
language sql
stable
set search_path = public
as $$
  with words as (
    select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%') as patterns
    from regexp_split_to_table(trim(p_query), '\s+') w
    where w <> ''
  )
  select f.*
  from foods f, words
  where words.patterns is not null
    and (f.name || ' ' || coalesce(f.brand, '')) ilike all (words.patterns)
  order by
    case when f.created_by = auth.uid() then 0 when f.source in ('seed', 'usda') then 1 else 2 end,
    case when f.name ilike trim(p_query) then 0 when lower(f.name) like lower(trim(p_query)) || '%' then 1 else 2 end,
    char_length(f.name),
    f.name
  limit least(greatest(p_limit, 1), 200);
$$;

-- Profile numbers. Reading rows on the phone stops at PostgREST's 1,000-row limit, which made totals
-- wrong after a large import. `days` covers the last 370 days, for the daily, weekly and monthly graphs.
create function public.profile_stats(p_today date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with me as (select auth.uid() as id),
  workout_days as (
    select day, count(*)::int as workouts, sum(total_volume) as volume
    from workouts where user_id = (select id from me) group by day
  ),
  food_days as (
    select day, round(sum(kcal))::int as kcal, round(sum(protein), 1) as protein
    from food_logs where user_id = (select id from me) group by day
  ),
  water_days as (
    select day, sum(ml)::int as water_ml
    from water_logs where user_id = (select id from me) and day > p_today - 370 group by day
  ),
  health_days as (
    select day, steps, sleep_min from daily_health where user_id = (select id from me)
  ),
  recent as (
    select day from workout_days union select day from food_days union select day from water_days union select day from health_days
  )
  select jsonb_build_object(
    'workouts', coalesce((select sum(workouts) from workout_days), 0),
    'diet_days', (select count(*) from food_days),
    'step_goal_days', (
      select count(*) from health_days
      where steps >= greatest(1, (select steps_target from profiles where id = (select id from me)))
    ),
    'weeks', coalesce((
      select jsonb_agg(week order by week desc)
      from (select distinct date_trunc('week', day)::date as week from workout_days) w
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', r.day,
        'workouts', w.workouts,
        'volume', w.volume,
        'kcal', f.kcal,
        'protein', f.protein,
        'steps', h.steps,
        'sleep_min', h.sleep_min,
        'water_ml', wa.water_ml
      ) order by r.day)
      from recent r
      left join workout_days w on w.day = r.day
      left join food_days f on f.day = r.day
      left join water_days wa on wa.day = r.day
      left join health_days h on h.day = r.day
      where r.day > p_today - 370 and r.day <= p_today
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.profile_stats(date) from public, anon;
grant execute on function public.profile_stats(date) to authenticated;

-- Share links use their own id rather than the account id, and show only what's returned here.
alter table public.profiles add column share_id uuid not null default gen_random_uuid();
create unique index profiles_share_id on public.profiles (share_id);

create function public.public_profile(p_share uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_avatar text;
  v_bio text;
  v_week date := date_trunc('week', current_date)::date;
  v_streak int := 0;
begin
  select id, display_name, avatar_url, bio into v_id, v_name, v_avatar, v_bio
  from profiles where share_id = p_share;
  if v_id is null then
    return null;
  end if;
  -- The current week doesn't break a streak until it's over.
  if not exists (select 1 from workouts where user_id = v_id and day >= v_week and day < v_week + 7) then
    v_week := v_week - 7;
  end if;
  while exists (select 1 from workouts where user_id = v_id and day >= v_week and day < v_week + 7) loop
    v_streak := v_streak + 1;
    v_week := v_week - 7;
  end loop;
  return jsonb_build_object(
    'name', v_name,
    'avatar_url', v_avatar,
    'bio', v_bio,
    'workouts', (select count(*) from workouts where user_id = v_id),
    'week_streak', v_streak
  );
end;
$$;
revoke all on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to anon, authenticated;

-- Progress photos: a private bucket, read through signed links. Skipped where Storage isn't installed.
create table public.progress_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  path        text not null unique check (char_length(path) <= 500),
  created_at  timestamptz not null default now(),
  check (split_part(path, '/', 1) = user_id::text)
);
create index progress_photos_user_day on public.progress_photos (user_id, day desc);
alter table public.progress_photos enable row level security;
create policy "own progress photos" on public.progress_photos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy "own progress photo read" on storage.objects for select to authenticated
      using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy "own progress photo insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy "own progress photo delete" on storage.objects for delete to authenticated
      using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end;
$$;

-- More apps to import from.
alter table public.workouts drop constraint workouts_source_check;
alter table public.workouts add constraint workouts_source_check
  check (source in ('shredder', 'hevy', 'strong', 'liftoff', 'fitnotes', 'jefit', 'csv'));
alter table public.routines drop constraint routines_source_check;
alter table public.routines add constraint routines_source_check
  check (source in ('shredder', 'hevy', 'strong', 'liftoff', 'fitnotes', 'jefit', 'csv'));

-- Steps counted by the phone's own sensor.
alter table public.daily_health drop constraint daily_health_source_check;
alter table public.daily_health add constraint daily_health_source_check
  check (source in ('manual', 'healthkit', 'health_connect', 'phone_sensor'));

-- A workout saved offline gets an id on the phone. Sending it again, for example after the connection
-- dropped before the reply arrived, returns the workout already saved instead of logging a second one.
alter table public.workouts add column client_id uuid;
create unique index workouts_client_id on public.workouts (user_id, client_id) where client_id is not null;

create or replace function public.finish_workout(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := nullif(p ->> 'client_id', '')::uuid;
  v_saved workouts%rowtype;
  v_result jsonb;
begin
  if v_client is not null then
    select * into v_saved from workouts where user_id = auth.uid() and client_id = v_client;
    if found then
      return jsonb_build_object(
        'workout_id', v_saved.id,
        'xp', 0,
        'total_volume', v_saved.total_volume,
        'total_sets', v_saved.total_sets,
        'prs', '[]'::jsonb,
        'already_saved', true
      );
    end if;
  end if;
  v_result := finish_workout_core(p);
  if v_client is not null then
    update workouts set client_id = v_client where id = (v_result ->> 'workout_id')::uuid;
  end if;
  perform refresh_prs(
    auth.uid(),
    array(select distinct (e ->> 'exercise_id')::uuid from jsonb_array_elements(p -> 'exercises') e)
  );
  return v_result;
end;
$$;

-- The app tour shows once per account. Everyone who has already set up has no need of it.
alter table public.profiles add column tour_seen boolean not null default false;
update public.profiles set tour_seen = true where onboarded;
grant update (tour_seen) on public.profiles to authenticated;
