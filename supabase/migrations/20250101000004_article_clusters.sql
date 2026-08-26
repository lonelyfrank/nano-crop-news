-- main_article_id non ha ancora un vincolo FK qui: la tabella `articles` non
-- esiste ancora a questo punto (dipendenza circolare cluster <-> main
-- article). Il vincolo viene aggiunto nella migration 000006, dopo la
-- creazione di `articles`.
create table public.article_clusters (
  id bigint generated always as identity primary key,
  main_article_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.article_clusters enable row level security;
-- Nessuna policy pubblica: non è interrogata direttamente dal frontend, solo
-- dalla Edge Function di ingestion (che usa la service role key e quindi
-- bypassa RLS).
