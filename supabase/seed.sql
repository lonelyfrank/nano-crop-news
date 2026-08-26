-- Fonti RSS pubbliche di esempio, pronte da attivare. Verifica sempre i
-- termini d'uso di ogni fonte prima di un utilizzo in produzione.
insert into public.sources (name, rss_url, website_url, category) values
  -- Nota: "/feed" senza slash finale — con lo slash il sito risponde 403.
  ('Il Post', 'https://www.ilpost.it/feed', 'https://www.ilpost.it', 'Attualità'),
  ('ANSA - Homepage', 'https://www.ansa.it/sito/ansait_rss.xml', 'https://www.ansa.it', 'Attualità'),
  ('Il Fatto Quotidiano', 'https://www.ilfattoquotidiano.it/feed/', 'https://www.ilfattoquotidiano.it', 'Attualità'),
  ('Wired Italia', 'https://www.wired.it/feed/rss', 'https://www.wired.it', 'Tecnologia'),
  ('BBC News', 'http://feeds.bbci.co.uk/news/rss.xml', 'https://www.bbc.com/news', 'Attualità'),
  ('TechCrunch', 'https://techcrunch.com/feed/', 'https://techcrunch.com', 'Tecnologia'),
  ('The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com', 'Tecnologia')
on conflict (rss_url) do nothing;

-- Tag di esempio per la pagina impostazioni. Nessuna logica automatica
-- assegna i tag agli articoli ingested in v1 (vedi README): l'associazione
-- article_tag è predisposta a schema ma va popolata manualmente finché non
-- si aggiunge un classificatore dedicato.
insert into public.tags (name) values
  ('Politica'), ('Tecnologia'), ('Economia'), ('Sport'), ('Cultura'), ('Scienza'), ('Mondo')
on conflict (name) do nothing;
