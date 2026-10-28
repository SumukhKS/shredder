-- Profile pictures could not be uploaded: Storage needs a select policy on your own files to
-- upload with upsert and to list (and clean up) your old pictures. Phone photos also often
-- exceed 2 MB, so the limit goes up to 10 MB. Skipped where Storage isn't installed (local tests).
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  update storage.buckets set file_size_limit = 10485760 where id = 'avatars';

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'own avatar read'
  ) then
    execute $p$
      create policy "own avatar read" on storage.objects for select to authenticated
        using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
  end if;
end;
$$;
