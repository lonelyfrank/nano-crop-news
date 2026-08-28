-- Macro Step 3 (mappa): conteggio articoli per regione, con la stessa
-- granularità della spec ("Italia con granularità fine, resto del mondo a
-- livello paese") — esclude la riga 'Italia'/country perché l'Italia è
-- rappresentata dalle sue regioni/province, non da un unico punto.
create or replace function public.get_region_article_counts()
returns table (
  id bigint,
  name text,
  level region_level,
  lat double precision,
  lng double precision,
  article_count bigint
)
language sql
stable
as $$
  select r.id, r.name, r.level, r.lat, r.lng, count(distinct ar.article_id) as article_count
  from public.regions r
  join public.article_regions ar on ar.region_id = r.id
  where r.level in ('region', 'province', 'country')
    and not (r.name = 'Italia' and r.level = 'country')
  group by r.id, r.name, r.level, r.lat, r.lng
  order by article_count desc;
$$;

grant execute on function public.get_region_article_counts() to anon, authenticated;

-- Stesso pattern di get_my_feed: ritorna righe già in forma jsonb annidata
-- (source + tags) per parità con il resto del frontend.
create or replace function public.get_articles_for_region(p_region_id bigint, p_limit int default 30)
returns table (article jsonb)
language sql
stable
as $$
  select (to_jsonb(a) - 'embedding')
    || jsonb_build_object(
         'source', to_jsonb(s),
         'tags', coalesce((
           select jsonb_agg(to_jsonb(t))
           from public.tags t
           join public.article_tag atg on atg.tag_id = t.id
           where atg.article_id = a.id
         ), '[]'::jsonb)
       ) as article
  from public.articles a
  join public.sources s on s.id = a.source_id
  join public.article_regions ar on ar.article_id = a.id
  where ar.region_id = p_region_id
  order by a.published_at desc
  limit p_limit;
$$;

grant execute on function public.get_articles_for_region(bigint, int) to anon, authenticated;
