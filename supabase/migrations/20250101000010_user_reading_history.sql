create table public.user_reading_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id bigint not null references public.articles (id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (user_id, article_id)
);

alter table public.user_reading_history enable row level security;

create policy "Users manage their own reading history"
  on public.user_reading_history for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
