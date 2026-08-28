-- Macro Step 2: geo-tagging rule-based. "Dove parla" un articolo, non "dove
-- è pubblicato" — un articolo può riguardare più zone contemporaneamente.
create type region_level as enum ('country', 'macro_region', 'region', 'province');
create type region_source_type as enum ('source_default', 'url_pattern', 'rss_category', 'gazetteer_match');

create table public.regions (
  id bigint generated always as identity primary key,
  name text not null,
  level region_level not null,
  parent_id bigint references public.regions(id) on delete set null,
  lat double precision,
  lng double precision,
  unique (name, level)
);

alter table public.regions enable row level security;

create policy "Public can read regions"
  on public.regions for select
  to anon, authenticated
  using (true);

-- Lo unique è su (article_id, region_id, source_type), non solo
-- (article_id, region_id): se due tecniche diverse trovano
-- indipendentemente la stessa regione per lo stesso articolo, restano due
-- righe distinte — è il segnale che serve per misurare l'affidabilità di
-- ogni tecnica (obiettivo esplicito dello step), non rumore da deduplicare.
create table public.article_regions (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.articles(id) on delete cascade,
  region_id bigint not null references public.regions(id) on delete cascade,
  source_type region_source_type not null,
  confidence real not null,
  created_at timestamptz not null default now(),
  unique (article_id, region_id, source_type)
);

create index article_regions_article_id_idx on public.article_regions (article_id);
create index article_regions_region_id_idx on public.article_regions (region_id);

alter table public.article_regions enable row level security;

create policy "Public can read article_regions"
  on public.article_regions for select
  to anon, authenticated
  using (true);
