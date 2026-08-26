-- Schedula l'invocazione periodica della Edge Function `fetch-rss` (ogni 20
-- minuti di default, in linea con la spec 15-30 min) usando pg_cron + pg_net.
--
-- Prerequisito (da fare UNA VOLTA sul progetto Supabase, prima di applicare
-- questa migration, via SQL editor o dashboard "Vault"):
--   select vault.create_secret('https://<il-tuo-project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<la-tua-service-role-key>', 'service_role_key');
--
-- Se in futuro cambi RSS_FETCH_INTERVAL_MINUTES, aggiorna anche l'espressione
-- cron qui sotto (non è letta da una tabella di config, dev'essere coerente
-- a mano con quella usata nella Edge Function).
select cron.schedule(
  'fetch-rss-job',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/fetch-rss',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
