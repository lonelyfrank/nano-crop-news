create table public.sources (
  id bigint generated always as identity primary key,
  name text not null,
  rss_url text not null unique,
  website_url text not null,
  category text,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_active_idx on public.sources (active);

alter table public.sources enable row level security;

create policy "Public can read active sources"
  on public.sources for select
  to anon, authenticated
  using (active = true);
