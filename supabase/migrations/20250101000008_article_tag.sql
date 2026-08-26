create table public.article_tag (
  article_id bigint not null references public.articles (id) on delete cascade,
  tag_id bigint not null references public.tags (id) on delete cascade,
  primary key (article_id, tag_id)
);

create index article_tag_tag_id_idx on public.article_tag (tag_id);

alter table public.article_tag enable row level security;

create policy "Public can read article_tag"
  on public.article_tag for select
  to anon, authenticated
  using (true);
