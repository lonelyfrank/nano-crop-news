create type public.article_summary_type as enum ('rss_excerpt', 'extractive', 'ai_generated');

create table public.articles (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.sources (id) on delete cascade,
  title text not null,
  original_url text not null unique,
  excerpt text not null,
  full_content text,
  summary_type public.article_summary_type,
  summary_text text,
  author text,
  image_url text,
  published_at timestamptz not null,
  cluster_id bigint references public.article_clusters (id) on delete set null,

  -- Non popolata/interrogata da nessuna logica applicativa in v1: predisposta
  -- per la futura ricerca semantica. Dimensione compatibile con i modelli di
  -- embedding più comuni (es. OpenAI text-embedding-3-small).
  embedding extensions.vector(1536),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index articles_published_at_idx on public.articles (published_at desc);
create index articles_source_id_idx on public.articles (source_id);
create index articles_cluster_id_idx on public.articles (cluster_id);

alter table public.articles enable row level security;

create policy "Public can read articles"
  on public.articles for select
  to anon, authenticated
  using (true);
