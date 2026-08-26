-- Estensioni abilitate fin da subito. pgvector non è ancora usata da
-- nessuna logica applicativa in v1 (colonna `articles.embedding`, vedi
-- migration 000005): è predisposta per la futura ricerca semantica.
-- pg_cron/pg_net servono per schedulare l'invocazione periodica della Edge
-- Function di ingestion RSS (vedi migration 000013).
--
-- Il search_path di questo progetto non include "extensions": la colonna
-- vector va quindi referenziata come "extensions.vector(...)" (vedi
-- migration 000005), non come "vector(...)" bare.
create extension if not exists vector with schema extensions;

-- pg_cron e pg_net usano uno schema proprio fisso (cron / net) a prescindere
-- da eventuali clausole "with schema": niente "with schema extensions" qui,
-- a differenza di vector.
create extension if not exists pg_cron;
create extension if not exists pg_net;
