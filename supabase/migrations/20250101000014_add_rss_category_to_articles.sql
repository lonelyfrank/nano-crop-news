-- Categoria nativa del feed RSS (tag <category>, quando presente), catturata
-- fin da ora per servire da input alla futura pipeline di geo-tagging
-- rule-based (Macro Step 2): una delle 4 tecniche pianificate mappa i
-- valori noti di questo campo a `regions`. Non usata da nessuna logica
-- applicativa in questa fase.
alter table public.articles
  add column rss_category text;
