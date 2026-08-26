-- Un utente può avere più righe: una per ogni tag e/o fonte preferita.
create table public.user_preferences (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tag_id bigint references public.tags (id) on delete cascade,
  source_id bigint references public.sources (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_preferences_tag_or_source check (tag_id is not null or source_id is not null)
);

create index user_preferences_user_tag_idx on public.user_preferences (user_id, tag_id);
create index user_preferences_user_source_idx on public.user_preferences (user_id, source_id);

alter table public.user_preferences enable row level security;

create policy "Users manage their own preferences"
  on public.user_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
