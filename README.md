# Nano Crop News

Aggregatore di notizie da feed RSS pubblici, ispirato a [Column.news](https://column.news).
Nessuna generazione AI in questa v1 (solo excerpt del feed RSS), ma schema DB
e codice già predisposti per aggiungerla in futuro (riassunti, Q&A, ricerca
semantica via embeddings) senza migrazioni dolorose.

## Stack

- **Backend**: [Supabase](https://supabase.com) — Postgres managed con
  `pgvector` abilitato fin da subito, Auth, RLS, API REST auto-generate
  (PostgREST), Edge Functions (Deno/TypeScript)
- **Ingestion RSS**: Edge Function `fetch-rss`, schedulata con `pg_cron` + `pg_net`
- **Frontend**: Nuxt 4 (Vue 3) con `@nuxtjs/supabase`, deploy su Vercel

Niente Docker, niente server da amministrare: Supabase ospita database/auth/
cron/function, Vercel ospita il frontend.

## Struttura del repository

```
frontend/            Applicazione Nuxt (UI), deploy su Vercel
supabase/
  migrations/         Schema SQL, RLS, funzione RPC, scheduling cron
  functions/fetch-rss/ Edge Function di ingestion RSS
  seed.sql            Fonti RSS + tag di esempio
.env.example          Variabili della Edge Function (secrets Supabase)
```

## Architettura dell'ingestion (v1, senza AI)

- Un job `pg_cron` (migration `20250101000013_schedule_rss_fetch.sql`) invoca
  ogni 20 minuti (default; spec: 15-30 min) la Edge Function `fetch-rss` via
  `pg_net`.
- La function itera le `sources` attive, scarica ogni feed (nessuno scraping
  del contenuto completo, solo i campi già nel feed: titolo, `description`,
  autore, immagine da `enclosure`/`media:content`), deduplica su
  `original_url` e salva `summary_type = rss_excerpt` con `summary_text` =
  excerpt.
- **Riassunto disaccoppiato dal resto del codice**:
  `supabase/functions/fetch-rss/summary.ts` definisce l'interfaccia
  `SummaryGenerator`; `RssExcerptSummaryGenerator` è l'implementazione di
  default per la v1. `AiSummaryGenerator` è già presente ma vuota (lancia
  un'eccezione con TODO): per attivare in futuro i riassunti AI basta
  implementarne la logica e cambiare **una riga** in `index.ts` (quale
  generatore viene istanziato).
- **Clustering/deduplica cross-fonte**: `clusterer.ts` confronta il titolo
  del nuovo articolo con quelli pubblicati nella finestra
  `RSS_CLUSTER_WINDOW_HOURS` (default 72h) usando un coefficiente di
  similarity a bigrammi (equivalente, per scopo, a `similar_text()` di PHP);
  se supera `RSS_CLUSTER_SIMILARITY_THRESHOLD` (default 80), l'articolo entra
  nello stesso `article_clusters.id` invece di crearne uno nuovo.
- La colonna `articles.embedding` (pgvector) e la tabella `user_questions`
  esistono nello schema ma non sono scritte/lette da nessuna logica
  applicativa in questa fase: sono pronte per il futuro modulo di ricerca
  semantica/Q&A.

### Limite noto: assegnazione tag

`tags`/`article_tag` esistono e sono usati dalla pagina impostazioni e da "i
miei interessi", ma **nessuna logica automatica assegna i tag agli articoli
ingested** (non richiesta dalla spec). Sono seedati come lista di esempio ma
vanno associati agli articoli a mano finché non si aggiunge un classificatore
dedicato. Il filtro sempre popolato dall'ingestion è quello per **fonte**.

## Setup

Verificato end-to-end su CLI `supabase` v2.115.0 — se la tua versione è
diversa, alcuni comandi potrebbero chiamarsi diversamente (vedi note sotto).
Non serve installarla globalmente: `npx supabase <comando>` funziona.

### 1. Progetto Supabase

```bash
npx supabase login
npx supabase link --project-ref <il-tuo-project-ref>   # chiede la password del DB

npx supabase db push                                    # applica tutte le migrations
npx supabase db query --linked -f supabase/seed.sql     # popola sources + tags
```

> Nota: `supabase db execute` non esiste più in questa versione della CLI;
> il comando corretto è `supabase db query --linked -f <file>`. Se anche
> questo non fosse disponibile, incolla il contenuto di `supabase/seed.sql`
> nell'SQL Editor della dashboard.

Se `db push` si ferma su un errore tipo `type "vector" does not exist`, il
search_path del tuo progetto non include lo schema `extensions`: le
migrations in questo repo usano già `extensions.vector(1536)` esplicito per
questo motivo — se hai modificato la migration `articles` verifica di non
aver tolto il prefisso.

### 2. Secrets per lo scheduling del cron

Nel SQL Editor della dashboard Supabase (una tantum, **prima** di fare `db
push`, altrimenti la migration del cron si registra comunque ma il job
fallirà silenziosamente ai primi tick finché non crei i secret):

```sql
select vault.create_secret('https://<il-tuo-project-ref>.supabase.co', 'project_url');
select vault.create_secret('<la-tua-service-role-key>', 'service_role_key');
```

Prendi la service_role key da Settings → API → sezione "Legacy API Keys" (o
"secret" nella UI più recente) **della dashboard**, non dalla CLI: il comando
`supabase projects api-keys` la stampa in chiaro anche senza `--reveal` per le
chiavi legacy, quindi se la usi finisce nella cronologia del terminale.

> La sintassi esatta di Vault/`pg_cron`/`pg_net` è quella documentata da
> Supabase al momento in cui leggi questo file: verificala nella dashboard del
> tuo progetto (Database → Cron / Vault) prima di applicare la migration,
> potrebbe essere cambiata rispetto a quanto scritto qui.

### 3. Deploy della Edge Function

```bash
cp .env.example .env   # e compila i valori
npx supabase functions deploy fetch-rss --use-api
npx supabase secrets set --env-file .env
```

`--use-api` bundla la function lato server invece che con un Docker locale:
utile se non hai Docker (va bene anche con solo Podman installato, che il
deploy "normale" non usa automaticamente).

Per testarla manualmente (senza aspettare il cron): questa versione della CLI
non ha `supabase functions invoke`, quindi si chiama direttamente l'endpoint
HTTP con l'**anon/publishable key** (mai la service_role):

```bash
curl -X POST "https://<il-tuo-project-ref>.supabase.co/functions/v1/fetch-rss" \
  -H "Authorization: Bearer <anon-o-publishable-key>"
```

Risposta attesa: `{"created": N, "report": {"Nome fonte": "X nuovi articoli (Y nel feed)", ...}}`.
Se una fonte dà errore HTTP 403/404, il suo feed potrebbe aver cambiato URL o
bloccare richieste automatizzate — verifica manualmente l'URL nel browser
(è già successo con "Il Post": la spec richiedeva `/feed`, non `/feed/`, che
qui dà 403 — corretto nel seed).

### 4. Frontend

```bash
cd frontend
cp .env.example .env    # SUPABASE_URL + SUPABASE_KEY (anon/public key) del progetto
npm install
npm run dev
```

Apri `http://localhost:3000`: dovresti vedere il feed (vuoto finché non lanci
`fetch-rss` almeno una volta), e riuscire a registrarti/loggarti e salvare le
preferenze in Impostazioni.

### 5. Deploy frontend su Vercel

- Collega il repository su [vercel.com](https://vercel.com) (preset Nuxt
  rilevato automaticamente).
- Imposta le environment variable del progetto Vercel: `SUPABASE_URL`,
  `SUPABASE_KEY` (la stessa anon/public key, **mai** la service role key).
- Deploy.

## Predisposizione per l'AI futura

- **Riassunti AI**: implementa la logica in
  `supabase/functions/fetch-rss/summary.ts` (`AiSummaryGenerator`) e cambia
  quale generatore viene istanziato in `index.ts` — nessuna migration,
  nessun'altra modifica.
- **Embeddings/ricerca semantica**: `articles.embedding` (colonna `vector`,
  pgvector) è già presente; basta popolarla e usare l'operatore di distanza
  di pgvector (`<->`) nelle query.
- **Q&A sugli articoli**: tabella `user_questions` già presente con RLS;
  basta aggiungere una Edge Function/RPC dedicata quando si implementa la
  logica.
- **Abbonamenti premium**: `profiles.is_premium` è già un campo boolean,
  pronto per una futura logica di pagamento (non implementata in questa fase).

## Sicurezza: RLS

Tutte le tabelle hanno Row Level Security abilitata:
- `sources`, `articles`, `tags`, `article_tag`: lettura pubblica (anon +
  authenticated), nessuna scrittura da client (solo la Edge Function, con la
  service role key, scrive articoli).
- `profiles`, `user_preferences`, `user_reading_history`, `user_questions`:
  ogni utente vede/modifica solo le proprie righe (`auth.uid()`).
