-- Tabella predisposta per il futuro modulo Q&A basato su AI: nessuna logica
-- applicativa la popola in questa fase (nessuna function/route la scrive).
create table public.user_questions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id bigint not null references public.articles (id) on delete cascade,
  question text not null,
  answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_questions enable row level security;

create policy "Users manage their own questions"
  on public.user_questions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
