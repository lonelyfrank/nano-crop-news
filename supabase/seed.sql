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
  ('The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com', 'Tecnologia'),

  -- Fonti per categoria, mix italiano/internazionale (tutte verificate live:
  -- HTTP 200 + XML valido, prima dell'inserimento qui).
  ('ANSA - Politica', 'https://www.ansa.it/sito/notizie/politica/politica_rss.xml', 'https://www.ansa.it', 'Politica'),
  ('ANSA - Economia', 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml', 'https://www.ansa.it', 'Economia'),
  ('ANSA - Sport', 'https://www.ansa.it/sito/notizie/sport/sport_rss.xml', 'https://www.ansa.it', 'Sport'),
  ('ANSA - Cultura', 'https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml', 'https://www.ansa.it', 'Cultura'),
  ('ANSA - Mondo', 'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml', 'https://www.ansa.it', 'Mondo'),
  -- Nota: "ANSA - Tecnologia" esclusa dopo verifica: il feed risponde 200
  -- ma tutti gli articoli sono fermi a maggio 2023 (feed abbandonato).
  -- Tecnologia resta comunque coperta da Wired Italia, TechCrunch, The
  -- Verge, BBC Technology.
  ('Rai News - Esteri', 'https://www.rainews.it/rss/esteri', 'https://www.rainews.it', 'Mondo'),
  ('Rai News - Sport', 'https://www.rainews.it/rss/sport', 'https://www.rainews.it', 'Sport'),
  -- Nota: "Gazzetta dello Sport" (gazzetta.it/rss/home.xml) è stata esclusa
  -- dopo verifica: il feed risponde 200 ma contiene articoli del 2022-2023,
  -- non notizie correnti (lastBuildDate anch'esso fermo a gennaio 2024).
  ('BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'https://www.bbc.com/news/world', 'Mondo'),
  ('BBC Business', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'https://www.bbc.com/news/business', 'Economia'),
  ('BBC Technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml', 'https://www.bbc.com/news/technology', 'Tecnologia'),
  ('BBC Sport', 'https://feeds.bbci.co.uk/sport/rss.xml?edition=uk', 'https://www.bbc.com/sport', 'Sport'),
  ('BBC Science', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'https://www.bbc.com/news/science_and_environment', 'Scienza')
on conflict (rss_url) do nothing;

-- Tag di esempio per la pagina impostazioni. Nessuna logica automatica
-- assegna i tag agli articoli ingested in v1 (vedi README): l'associazione
-- article_tag è predisposta a schema ma va popolata manualmente finché non
-- si aggiunge un classificatore dedicato.
insert into public.tags (name) values
  ('Politica'), ('Tecnologia'), ('Economia'), ('Sport'), ('Cultura'), ('Scienza'), ('Mondo')
on conflict (name) do nothing;
