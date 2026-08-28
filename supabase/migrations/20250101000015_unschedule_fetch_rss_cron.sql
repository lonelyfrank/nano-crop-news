-- L'ingestion non è più schedulata via pg_cron/pg_net + Edge Function: da
-- ora gira come script Node, schedulato da GitHub Actions (vedi
-- .github/workflows/ingest.yml). Disattiva il vecchio job per evitare una
-- doppia ingestion (stessa fonte scaricata due volte, spreco di risorse).
do $$
begin
  perform cron.unschedule('fetch-rss-job');
exception
  when others then
    -- Il job potrebbe essere già stato rimosso manualmente: non bloccare la migration.
    null;
end $$;
