# Nano Crop News

Aggregatore di notizie personale, gratuito e open-source, ispirato a
[Column.news](https://column.news). Live su
[nano-crop-news.vercel.app](https://nano-crop-news.vercel.app/).

## Principi guida

- Completamente gratuito, nessuna monetizzazione, nessun ricavo.
- Costi di gestione quasi zero: priorità a free tier, RSS nativi, caching aggressivo.
- Nessuna barriera di accesso: fruibile da tutti senza login obbligatorio.
  Login opzionale, serve solo per persistere preferenze/cronologia.
- Solo excerpt brevi + link all'originale (mai contenuto completo), per
  restare nell'eccezione "very short extracts" del diritto connesso editori.
- Nessuno scraping: qualunque classificazione (geografica, tematica) usa solo
  dati già presenti nell'item RSS (titolo, excerpt, URL, categoria) — mai
  aprendo/scaricando l'articolo completo.
- Backend rule-based, deterministico e ispezionabile prima di qualsiasi
  introduzione di AI/ML.

## Stack

- **Frontend + API**: Next.js 16 (App Router, TypeScript, React 19), deploy su Vercel
- **Database/Auth**: [Supabase](https://supabase.com) — Postgres managed con
  `pgvector` abilitato fin da subito, Auth, RLS, API REST auto-generate (PostgREST)
- **Ingestion RSS**: script Node (`frontend/scripts/ingest`), schedulato da
  **GitHub Actions** (non Vercel Cron: sul piano Hobby/free gira al minimo
  una volta al giorno, non ogni 15-30 minuti)
- **Cache**: [Upstash Redis](https://upstash.com) (free tier) per i feed grezzi

## Struttura del repository

```
frontend/                Next.js — UI + script di ingestion, deploy su Vercel
  app/                    Pagine (App Router)
  components/             Componenti condivisi (ArticleCard, CheckboxGroup, Header)
  lib/supabase/           Client Supabase (browser/server/proxy — pattern @supabase/ssr)
  scripts/ingest/         Script di ingestion RSS, eseguito da GitHub Actions
  proxy.ts                Rinfresca la sessione Supabase su ogni richiesta
supabase/
  migrations/             Schema SQL, RLS, funzione RPC
  seed.sql                Fonti RSS + tag di esempio
.github/workflows/        Scheduling dell'ingestion (cron GitHub Actions)
```

## Setup

### 1. Progetto Supabase

```bash
npx supabase login
npx supabase link --project-ref <il-tuo-project-ref>   # chiede la password del DB
npx supabase db push                                    # applica tutte le migrations
npx supabase db query --linked -f supabase/seed.sql     # popola sources + tags
```

Se `db push` si ferma su `type "vector" does not exist`, il search_path del
progetto non include lo schema `extensions`: le migrations usano già
`extensions.vector(1536)` esplicito per questo motivo.

### 2. Ingestion in locale

```bash
cd frontend
cp .env.example .env
```

Compila `.env`: `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
(Settings → API → Project URL / anon o publishable key) e
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (stesso URL, ma la **service
role** key — segreta, serve perché l'ingestion scrive su `articles`
bypassando la RLS). `UPSTASH_REDIS_REST_URL`/`TOKEN` sono opzionali: senza,
l'ingestion funziona comunque, solo senza cache dei feed grezzi.

```bash
npm install
npm run ingest
```

Output atteso: `{"created": N, "report": {"Nome fonte": "X nuovi articoli (Y nel feed)", ...}}`.
Se una fonte dà errore HTTP, il suo feed potrebbe aver cambiato URL o
bloccare richieste automatizzate. Controlla anche la **freschezza** dei
dati, non solo l'HTTP status: un feed può rispondere 200 con XML valido ma
contenere solo articoli vecchi di anni (già successo con due fonti, rimosse
dal seed — vedi commenti in `supabase/seed.sql`).

### 3. Scheduling (GitHub Actions)

`.github/workflows/ingest.yml` gira ogni 20 minuti (`npm run ingest` dentro
`frontend/`). Nel repository GitHub, Settings → Secrets and variables →
Actions, imposta:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secrets)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (secrets, opzionali)
- `RSS_USER_AGENT` (variable, opzionale)

Per testare senza aspettare il cron: tab Actions → "RSS ingestion" → *Run workflow*.

### 4. Frontend in locale

```bash
cd frontend
npm run dev
```

Apri `http://localhost:3000`. `/settings` richiede login (redirect
automatico a `/login`, gestito da `proxy.ts`).

### 5. Deploy

- **Frontend**: repo collegato a Vercel, **Root Directory** = `frontend`.
  Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (mai la service role key).
- **Ingestion**: gira solo su GitHub Actions, non su Vercel (nessuna funzione
  serverless coinvolta, evita i limiti di durata del piano Hobby).

## Architettura dell'ingestion

Lo script (`frontend/scripts/ingest/`) itera le `sources` attive e, per ognuna:

1. Controlla la cache Redis del feed grezzo (chiave = URL del feed, TTL 20
   min); se assente, scarica il feed con **retry a backoff esponenziale**
   (3 tentativi, 1s/2s/4s) e lo mette in cache.
2. Fa il parsing (RSS 2.0/Atom, nessuno scraping oltre i campi già nel feed:
   titolo, `description`, autore, immagine da `enclosure`/`media:content`,
   `category`).
3. **Dedup**: normalizza gli URL (rimuove query param di tracking come
   `utm_*`, `fbclid`, `gclid`, ...) prima del confronto su `original_url`
   (`normalize-url.ts`), poi una singola query batch per fonte invece di una
   select per articolo.
4. Salva `summary_type = rss_excerpt` con `summary_text` = excerpt, e
   `rss_category` con la categoria nativa del feed (se presente) — pronta
   per la futura pipeline di geo-tagging.
5. **Clustering cross-fonte**: `clusterer.ts` confronta il titolo con un pool
   di articoli recenti (finestra `RSS_CLUSTER_WINDOW_HOURS`, default 72h)
   usando un coefficiente di similarity a bigrammi; se supera
   `RSS_CLUSTER_SIMILARITY_THRESHOLD` (default 80), l'articolo entra nello
   stesso `article_clusters.id`.

**Riassunto disaccoppiato dal resto del codice**: `scripts/ingest/summary.ts`
definisce l'interfaccia `SummaryGenerator`; `RssExcerptSummaryGenerator` è
l'implementazione di default. `AiSummaryGenerator` è già presente ma vuota
(TODO): per attivare in futuro i riassunti AI basta implementarne la logica e
cambiare una riga in `index.ts`.

### Scalabilità

Con ~20 fonti attive, fare una query DB per ogni singolo articolo (dedup e
clustering) esaurisce rapidamente le risorse disponibili — bug reale trovato
e corretto durante lo sviluppo (prima nella Edge Function Supabase, poi
riconfermato nel porting a Node). Lo script quindi:

- fa **una query di dedup per fonte** (batch, non per articolo) e **un solo
  insert batch per fonte**;
- carica il pool di candidati per il clustering **una volta per intera
  esecuzione** (`CANDIDATE_POOL_LIMIT`, default 300 articoli recenti),
  aggiornandolo in memoria;
- limita gli item processati per fonte (`MAX_ITEMS_PER_SOURCE`, default 30):
  alcuni feed possono restituire centinaia di item in un colpo solo, e non
  serve backfill storico profondo per un aggregatore di notizie correnti.

Il costo del matching di similarity è O(nuovi articoli × dimensione pool):
tienilo a mente se in futuro aumenti molto il numero di fonti.

### Fonti attualmente seedate (19)

Mix italiano/internazionale per categoria (`supabase/seed.sql`): attualità
generalista (Il Post, ANSA Homepage, Il Fatto Quotidiano, BBC News), Politica
(ANSA), Economia (ANSA, BBC Business), Sport (ANSA, Rai News, BBC Sport),
Cultura (ANSA), Mondo (ANSA, Rai News, BBC World), Tecnologia (Wired Italia,
TechCrunch, The Verge, BBC Technology), Scienza (BBC Science). Ogni URL è
stato verificato live (HTTP 200 + XML valido + date recenti) prima
dell'inserimento.

### Limite noto: assegnazione tag

`tags`/`article_tag` esistono e sono usati dalla pagina impostazioni e da "i
miei interessi", ma **nessuna logica automatica assegna i tag agli articoli
ingested**. Sono seedati come lista di esempio ma vanno associati a mano
finché non si aggiunge un classificatore dedicato. Il filtro sempre popolato
dall'ingestion è quello per **fonte**.

## Frontend: layout e filtri

- **Header** (`components/Header.tsx`, globale, minimale): logo, link
  Impostazioni, email/logout o link login. Sticky in cima.
- **Home** (`app/page.tsx`): layout a due colonne, feed a sinistra e sidebar
  filtri a destra (checkbox multi-selezione su fonti e tag, toggle "I miei
  interessi"). Sotto i 768px la sidebar diventa un drawer a comparsa da
  destra, aperto da un bottone "Filtri" sopra il feed — solo CSS (media
  query + transizione) e uno state booleano, nessuna libreria UI.
- I filtri della sidebar sono **manuali/di sessione** (non salvati): "I miei
  interessi" usa invece le preferenze salvate in Impostazioni (RPC
  `get_my_feed`), e per questo i filtri manuali vengono nascosti quando è attivo.
- `components/CheckboxGroup.tsx` è condiviso tra la sidebar della home e la
  pagina Impostazioni.
- Autenticazione: pattern ufficiale `@supabase/ssr` per Next.js App Router
  (`lib/supabase/client.ts` per i Client Component, `server.ts` per Server
  Component/Route Handler, `proxy.ts` + `lib/supabase/middleware.ts` per il
  refresh della sessione e la protezione di `/settings`).

## Roadmap (Macro Step 2-6, non ancora implementati)

Pianificati ma non costruiti in questo giro — si parte da qui dopo aver
verificato lo Step 1 in produzione:

- **Step 2 — Geo-tagging rule-based**: tabelle `regions` e `article_regions`
  (molti-a-molti, con `source_type` e `confidence` per misurare l'affidabilità
  di ogni tecnica), modulo isolato `lib/geo-tagging/` con 4 tecniche (source
  default, URL pattern, RSS category — usa `articles.rss_category` già
  raccolto dallo Step 1 —, gazetteer), eseguite una volta per articolo
  all'ingestion.
- **Step 3 — Mappa interattiva**: dataset statico geografico,
  `/api/map/regions` e `/api/map/news`, `react-leaflet` con tile CartoDB,
  Nominatim solo per il click su area libera (mai per gli articoli), cache
  Redis dei risultati.
- **Step 4 — Tendenze/timeline**: aggregazioni su `article_regions` e sui
  cluster di duplicati (già esistenti, `article_clusters`), filtri `?from=&to=`.
- **Step 5 — UX**: tre viste (Feed, Tendenze, Mappa), ricerca full-text, dark
  mode, PWA, skeleton loader, "salva per dopo".
- **Step 6 — Architettura/privacy**: rate limiting (Upstash), informativa
  privacy, documentazione dei limiti noti della pipeline di geo-tagging.

## Predisposizione per l'AI futura

- **Riassunti AI**: implementa la logica in `scripts/ingest/summary.ts`
  (`AiSummaryGenerator`) e cambia quale generatore viene istanziato in
  `index.ts` — nessuna migration, nessun'altra modifica.
- **Embeddings/ricerca semantica**: `articles.embedding` (colonna `vector`,
  pgvector) è già presente; basta popolarla e usare l'operatore di distanza
  di pgvector (`<->`) nelle query.
- **Q&A sugli articoli**: tabella `user_questions` già presente con RLS;
  basta aggiungere una route/RPC dedicata quando si implementa la logica.
- **Abbonamenti premium**: `profiles.is_premium` è già un campo boolean,
  pronto per una futura logica di pagamento (non implementata in questa fase).

## Sicurezza: RLS

Tutte le tabelle hanno Row Level Security abilitata:
- `sources`, `articles`, `tags`, `article_tag`: lettura pubblica (anon +
  authenticated), nessuna scrittura da client (solo lo script di ingestion,
  con la service role key, scrive articoli).
- `profiles`, `user_preferences`, `user_reading_history`, `user_questions`:
  ogni utente vede/modifica solo le proprie righe (`auth.uid()`).
