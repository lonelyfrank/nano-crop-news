-- UI: il breadcrumb (Mondo › Italia › Lombardia) sulla mappa risale
-- `parent_id`, già presente su `regions` ma non ritornato da questa RPC.
-- Il tipo di ritorno cambia: va droppata la firma esistente prima (una
-- `create or replace` da sola non basta a cambiare le colonne di ritorno).
drop function if exists public.get_region_article_counts(timestamptz, timestamptz);

create or replace function public.get_region_article_counts(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id bigint,
  name text,
  level region_level,
  parent_id bigint,
  lat double precision,
  lng double precision,
  article_count bigint
)
language sql
stable
as $$
  select r.id, r.name, r.level, r.parent_id, r.lat, r.lng, count(distinct ar.article_id) as article_count
  from public.regions r
  join public.article_regions ar on ar.region_id = r.id
  join public.articles a on a.id = ar.article_id
  where r.level in ('region', 'province', 'country')
    and not (r.name = 'Italia' and r.level = 'country')
    and (p_from is null or a.published_at >= p_from)
    and (p_to is null or a.published_at <= p_to)
  group by r.id, r.name, r.level, r.parent_id, r.lat, r.lng
  order by article_count desc;
$$;

grant execute on function public.get_region_article_counts(timestamptz, timestamptz) to anon, authenticated;
