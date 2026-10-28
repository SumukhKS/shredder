-- Profile page: a picture, a short bio and a birthday on the profile, and every body
-- measurement (not just weight) in body_metrics so they can be logged and charted.

alter table public.profiles
  add column if not exists bio        text check (char_length(bio) <= 300),
  add column if not exists birthday   date check (birthday between '1900-01-01' and '2100-01-01'),
  add column if not exists avatar_url text check (char_length(avatar_url) <= 1000);

grant update (bio, birthday, avatar_url) on public.profiles to authenticated;

-- A row can now hold any measurements; weight is one of them and may be left out.
alter table public.body_metrics alter column weight_kg drop not null;
alter table public.body_metrics
  add column if not exists neck_cm      numeric(5, 1) check (neck_cm > 0),
  add column if not exists shoulders_cm numeric(5, 1) check (shoulders_cm > 0),
  add column if not exists chest_cm     numeric(5, 1) check (chest_cm > 0),
  add column if not exists waist_cm     numeric(5, 1) check (waist_cm > 0),
  add column if not exists hips_cm      numeric(5, 1) check (hips_cm > 0),
  add column if not exists arm_cm       numeric(5, 1) check (arm_cm > 0),
  add column if not exists forearm_cm   numeric(5, 1) check (forearm_cm > 0),
  add column if not exists thigh_cm     numeric(5, 1) check (thigh_cm > 0),
  add column if not exists calf_cm      numeric(5, 1) check (calf_cm > 0);

-- Same as before, but a measurement-only row (no weight) leaves the profile weight alone.
create or replace function public.xp_on_weigh_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform award_xp(new.user_id, 'weigh_in', 5, new.day::text, new.day);
  -- Keep the profile weight current for calorie calculations
  if new.weight_kg is not null then
    update profiles set weight_kg = new.weight_kg
    where id = new.user_id
      and new.day >= coalesce((select max(day) from body_metrics where user_id = new.user_id and weight_kg is not null), new.day);
  end if;
  return new;
end;
$$;

-- Profile pictures: a public bucket where each user writes only inside their own folder
-- (avatars/<user id>/...). Skipped where Supabase Storage isn't installed (the local tests).
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy "own avatar insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy "own avatar update" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy "own avatar delete" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end;
$$;
