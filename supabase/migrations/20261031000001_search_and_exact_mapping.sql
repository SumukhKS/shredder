-- Food search: how well the name fits comes first, then whose food it is. Before, a weak match on a
-- verified food beat an exact match on a community one.
create or replace function public.search_foods(p_query text, p_limit int default 50)
returns setof public.foods
language sql
stable
set search_path = public
as $$
  with words as (
    select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%') as patterns
    from regexp_split_to_table(trim(p_query), '\s+') w
    where w <> ''
  ),
  typed as (
    select
      lower(trim(p_query)) as q,
      replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') as q_like
  )
  select f.*
  from foods f, words, typed
  where words.patterns is not null
    and (f.name || ' ' || coalesce(f.brand, '')) ilike all (words.patterns)
  order by
    case
      when lower(f.name) = typed.q then 0
      when lower(f.name) like typed.q_like || '%' then 1
      when ' ' || regexp_replace(lower(f.name), '[^a-z0-9]+', ' ', 'g') like '% ' || typed.q_like || '%' then 2
      else 3
    end,
    case when f.created_by = auth.uid() then 0 when f.source in ('seed', 'usda') then 1 else 2 end,
    char_length(f.name),
    f.name
  limit least(greatest(p_limit, 1), 200);
$$;

-- Exercises now map only on the exact same name, so the shared list of renames is gone. Safe to re-run.
-- A person's own rows stay: those are choices they made themselves.
delete from public.exercise_aliases where user_id is null;
