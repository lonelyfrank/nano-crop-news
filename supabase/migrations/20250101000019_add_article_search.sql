-- Macro Step 5a: ricerca full-text sul feed principale.
-- Colonna generata (nessun trigger da mantenere, sempre in sync) + indice
-- GIN. Config "simple" (non "italian"/"english"): il feed è misto
-- IT/EN, uno stemmer specifico per una lingua penalizzerebbe l'altra.
alter table public.articles
  add column search_vector tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(excerpt, ''))
  ) stored;

create index articles_search_vector_idx on public.articles using gin (search_vector);

-- get_my_feed guadagna un p_search opzionale, stesso pattern p_from/p_to
-- dello Step 4. La firma cambia: va droppata esplicitamente prima (vedi
-- nota nella migration 18 sull'ambiguità di overload di PostgREST).
drop function if exists public.get_my_feed(timestamptz, int, timestamptz, timestamptz);

create or replace function public.get_my_feed(
  p_cursor timestamptz default null,
  p_limit int default 20,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null
)
returns table (article jsonb)
language sql
stable
as $$
  select (to_jsonb(a) - 'embedding' - 'search_vector')
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
  where (p_cursor is null or a.published_at < p_cursor)
    and (p_from is null or a.published_at >= p_from)
    and (p_to is null or a.published_at <= p_to)
    and (p_search is null or p_search = '' or a.search_vector @@ websearch_to_tsquery('simple', p_search))
    and (
      exists (
        select 1
        from public.user_preferences up
        where up.user_id = auth.uid() and up.source_id = a.source_id
      )
      or exists (
        select 1
        from public.user_preferences up
        join public.article_tag atg2 on atg2.tag_id = up.tag_id
        where up.user_id = auth.uid() and atg2.article_id = a.id
      )
    )
  order by a.published_at desc
  limit p_limit;
$$;

grant execute on function public.get_my_feed(timestamptz, int, timestamptz, timestamptz, text) to authenticated;

-- Le altre due RPC che espongono "to_jsonb(a)" (Step 3/4) devono escludere
-- anche search_vector dal jsonb ritornato, non solo embedding: senza
-- questo la rappresentazione testuale del tsvector finirebbe nel JSON
-- restituito al client (rumore, non un problema di sicurezza).
drop function if exists public.get_trending_clusters(timestamptz, timestamptz, int);

create or replace function public.get_trending_clusters(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 20
)
returns table (cluster_id bigint, source_count bigint, article_count bigint, article jsonb)
language sql
stable
as $$
  with windowed_articles as (
    select a.id, a.cluster_id, a.source_id, a.published_at
    from public.articles a
    where a.cluster_id is not null
      and (p_from is null or a.published_at >= p_from)
      and (p_to is null or a.published_at <= p_to)
  ),
  cluster_stats as (
    select cluster_id,
      count(distinct source_id) as source_count,
      count(*) as article_count,
      max(published_at) as latest_at
    from windowed_articles
    group by cluster_id
    having count(distinct source_id) >= 2
  ),
  representative as (
    select distinct on (wa.cluster_id) wa.cluster_id, wa.id as article_id
    from windowed_articles wa
    order by wa.cluster_id, wa.published_at desc
  )
  select
    cs.cluster_id,
    cs.source_count,
    cs.article_count,
    (to_jsonb(a) - 'embedding' - 'search_vector')
      || jsonb_build_object(
           'source', to_jsonb(s),
           'tags', coalesce((
             select jsonb_agg(to_jsonb(t))
             from public.tags t
             join public.article_tag atg on atg.tag_id = t.id
             where atg.article_id = a.id
           ), '[]'::jsonb)
         ) as article
  from cluster_stats cs
  join representative r on r.cluster_id = cs.cluster_id
  join public.articles a on a.id = r.article_id
  join public.sources s on s.id = a.source_id
  order by cs.source_count desc, cs.article_count desc, cs.latest_at desc
  limit p_limit;
$$;

grant execute on function public.get_trending_clusters(timestamptz, timestamptz, int) to anon, authenticated;

drop function if exists public.get_articles_for_region(bigint, int, timestamptz, timestamptz);

create or replace function public.get_articles_for_region(
  p_region_id bigint,
  p_limit int default 30,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (article jsonb)
language sql
stable
as $$
  select (to_jsonb(a) - 'embedding' - 'search_vector')
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
    and (p_from is null or a.published_at >= p_from)
    and (p_to is null or a.published_at <= p_to)
  order by a.published_at desc
  limit p_limit;
$$;

grant execute on function public.get_articles_for_region(bigint, int, timestamptz, timestamptz) to anon, authenticated;
