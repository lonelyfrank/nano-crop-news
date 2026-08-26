create table public.tags (
  id bigint generated always as identity primary key,
  name text not null unique
);

alter table public.tags enable row level security;

create policy "Public can read tags"
  on public.tags for select
  to anon, authenticated
  using (true);
