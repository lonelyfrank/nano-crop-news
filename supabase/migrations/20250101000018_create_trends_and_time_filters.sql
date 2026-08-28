-- Macro Step 4: tendenze (nessuna nuova tabella, solo aggregazioni su dati
-- già esistenti) + filtro temporale su feed/mappa/tendenze.

-- "Storia di tendenza": cluster (Step 1) con almeno 2 fonti distinte nella
-- finestra temporale — è il segnale esplicito della spec ("la stessa
-- notizia coperta da più fonti diverse").
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
    (to_jsonb(a) - 'embedding')
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

-- Filtro temporale opzionale sulle RPC esistenti (Step 3 e Step 1): nuovi
-- parametri con default null in coda. NB: "create or replace" da solo NON
-- basta quando cambia la lista dei parametri — Postgres la tratterebbe come
-- una funzione overload distinta (stesso nome, firma diversa) invece che
-- sostituire quella vecchia, e PostgREST darebbe poi un errore di funzione
-- ambigua chiamandola con meno argomenti (entrambe le firme diventano
-- candidate). Le vecchie firme vanno droppate esplicitamente prima.
drop function if exists public.get_region_article_counts();
drop function if exists public.get_articles_for_region(bigint, int);
drop function if exists public.get_my_feed(timestamptz, int);

create or replace function public.get_region_article_counts(
  p_from timestamptz default null,
  p_to timestamptz default null
)
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
  join public.articles a on a.id = ar.article_id
  where r.level in ('region', 'province', 'country')
    and not (r.name = 'Italia' and r.level = 'country')
    and (p_from is null or a.published_at >= p_from)
    and (p_to is null or a.published_at <= p_to)
  group by r.id, r.name, r.level, r.lat, r.lng
  order by article_count desc;
$$;

grant execute on function public.get_region_article_counts(timestamptz, timestamptz) to anon, authenticated;

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
    and (p_from is null or a.published_at >= p_from)
    and (p_to is null or a.published_at <= p_to)
  order by a.published_at desc
  limit p_limit;
$$;

grant execute on function public.get_articles_for_region(bigint, int, timestamptz, timestamptz) to anon, authenticated;

create or replace function public.get_my_feed(
  p_cursor timestamptz default null,
  p_limit int default 20,
  p_from timestamptz default null,
  p_to timestamptz default null
)
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
  where (p_cursor is null or a.published_at < p_cursor)
    and (p_from is null or a.published_at >= p_from)
    and (p_to is null or a.published_at <= p_to)
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

grant execute on function public.get_my_feed(timestamptz, int, timestamptz, timestamptz) to authenticated;
