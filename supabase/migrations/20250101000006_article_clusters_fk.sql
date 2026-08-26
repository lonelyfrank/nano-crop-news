alter table public.article_clusters
  add constraint article_clusters_main_article_id_fkey
  foreign key (main_article_id) references public.articles (id) on delete set null;
