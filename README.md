# Nano Crop News

Aggregatore di notizie personale, gratuito e open-source, ispirato a
[Column.news](https://column.news). Live su
[lonelyfrank-nano-crop-news.vercel.app](https://lonelyfrank-nano-crop-news.vercel.app/).

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
  app/                    Pagine (App Router): map, trends, api/map/*
  components/             Componenti condivisi (ArticleCard, CheckboxGroup, Header, MapView, TimeRangeFilter)
  lib/supabase/           Client Supabase (browser/server/proxy — pattern @supabase/ssr)
  lib/geo-tagging/        Pipeline di geo-tagging rule-based (Macro Step 2), riusata anche dalla mappa
  lib/redis.ts            Cache Redis generica (ingestion + Route Handler mappa)
  data/                   Dati statici: mapping fonte→regione, alias gazetteer
  scripts/ingest/         Script di ingestion RSS, eseguito da GitHub Actions
  scripts/backfill-*.ts   Backfill una tantum (geo-tagging, pulizia excerpt)
  proxy.ts                Rinfresca la sessione Supabase su ogni richiesta
supabase/
  migrations/             Schema SQL, RLS, funzione RPC
  seed.sql                Fonti RSS, tag, regioni/province/paesi di esempio
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

### Pulizia excerpt (HTML/footer di sindacazione)

Alcune fonti WordPress (es. Il Fatto Quotidiano) mettono markup HTML dentro
`<description>` (`<p>`, `<a href="...">`) e un paragrafo di attribuzione
automatico in coda ("L'articolo X proviene da Y."). `cleanDescription()` in
`scripts/ingest/feed-parser.ts` rimuove entrambi prima di salvare
excerpt/summary_text (l'estrazione immagine da `<img>` avviene comunque
prima, sulla versione HTML). `scripts/backfill-clean-excerpts.ts` ha
ripulito una tantum i 250 articoli già in DB che ne erano affetti.

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

## Geo-tagging rule-based (Macro Step 2)

Ogni articolo viene classificato geograficamente — "di cosa/dove parla", non
"da dove è pubblicato" — usando solo dati già presenti nell'item RSS
(titolo, excerpt, URL, categoria), senza scraping né AI. Un articolo può
riguardare più zone: 486 dei 1218 articoli in DB al momento della scrittura
ne hanno più di una.

### Schema

`regions` (paesi/macro-regioni/regioni/province italiane, con `parent_id`
per la gerarchia) e `article_regions`, pivot molti-a-molti con
`source_type` e `confidence` — tracciati **per misurare quanto funziona bene
ogni tecnica sui dati reali**, non solo per completezza. Lo unique è su
`(article_id, region_id, source_type)`, non solo `(article_id, region_id)`:
se due tecniche diverse trovano indipendentemente la stessa regione,
restano due righe distinte — è il segnale utile, non rumore da deduplicare.

### Le 4 tecniche (`frontend/lib/geo-tagging/`)

Una funzione pura per tecnica, nessun accesso DB al loro interno (i dati
sono caricati una volta per esecuzione, stessa disciplina di scalabilità
già adottata nel resto dell'ingestion):

1. **`source-default.ts`** (confidence 0.3): mapping statico fonte→regione
   di default da `data/sources-geo.json`. Applicato sempre — è la base
   minima, ma è un segnale debole (dice dove è pubblicato, non di cosa parla).
2. **`url-pattern.ts`** (confidence 0.6): regex sul path dell'URL, per fonte.
   **Copertura reale solo su ANSA** (`/mondo/europa/`, `/mondo/americalatina/`,
   ...) — verificato ispezionando gli URL reali delle 19 fonti: BBC usa ID
   opachi nel path, Il Post/Il Fatto/TechCrunch/The Verge usano slug basati
   sul titolo, nessuna geografia strutturata. Non è un pattern dimenticato
   per queste fonti, è la realtà dei dati.
3. **`rss-category.ts`** (confidence 0.55): divide `rss_category` (già
   raccolto dallo Step 1) sui suoi tag e li confronta con l'indice del
   gazetteer. **Copertura reale solo su Il Fatto Quotidiano** (unica fonte
   con `<category>` valorizzata nel feed, 129/1218 articoli).
4. **`gazetteer.ts`** (confidence 0.65): scansiona titolo+excerpt con regex
   a confine di parola contro un indice costruito dai nomi delle regioni
   (caricate dal DB) + le alias extra curate in `data/gazetteer.json` (es.
   "Stati Uniti" → anche "USA", "America"). **La tecnica con la copertura
   più ampia e uniforme** su tutte le fonti (644 match su 1218 articoli).
   Limite noto: nomi corti/ambigui (es. "Chad" paese vs nome proprio) possono
   dare falsi positivi — accettabile per un MVP rule-based, motivo stesso
   per cui si traccia `confidence` invece di considerare ogni match certo.

`resolveRegionsForArticle()` (`lib/geo-tagging/index.ts`) orchestra le 4
tecniche per un articolo; l'ingestion (`scripts/ingest/index.ts`) lo chiama
per ogni nuovo articolo e fa un insert batch su `article_regions` a fine
esecuzione (non uno per articolo). `scripts/backfill-geo-tagging.ts` applica
la stessa pipeline agli articoli già esistenti (eseguito una tantum dopo il
deploy della migration, non schedulato: `npm run backfill-geo`).

### Dati di riferimento

20 regioni italiane (complete), ~50 città/province italiane più citate nelle
notizie (non le 107 province formali — molte non compaiono mai per nome
nelle notizie), ~130 paesi del mondo più rilevanti per le notizie
internazionali (non tutti i ~195 stati membri ONU). `lat`/`lng` sono
centroidi approssimativi (capoluogo/capitale), pensati per un click-area
sulla mappa dello Step 3, non per precisione cartografica. L'elenco è
estendibile aggiungendo righe al seed (idempotente).

## Mappa interattiva (Macro Step 3)

`/map`: click su un marker (o su un'area libera) mostra le notizie locali di
quella zona. Scope mondiale con la granularità della spec: Italia a livello
regione/provincia (il marker "Italia" a livello paese è escluso apposta, le
notizie italiane compaiono già sulle sue regioni/province), resto del mondo
a livello paese.

- **`app/api/map/regions`**: RPC `get_region_article_counts()` (conteggio
  articoli per regione, solo quelle con almeno un articolo), cache Redis
  5 minuti (i dati cambiano solo ad ogni ingestion, ogni 20 min).
- **`app/api/map/news?region={id}`**: RPC `get_articles_for_region()`, stesso
  pattern jsonb annidato di `get_my_feed` (Step 1), stessa cache 5 minuti.
- **`app/api/map/geocode?lat=&lng=`**: reverse geocoding Nominatim **solo
  per interpretare il click su un'area libera** (mai per classificare gli
  articoli — quello resta il gazetteer rule-based dello Step 2). Coordinate
  arrotondate a 2 decimali, cache Redis **30 giorni**. Risolve un `region_id`
  **riusando il matcher del gazetteer dello Step 2**
  (`lib/geo-tagging/gazetteer.ts`) sui campi città/provincia/regione/paese
  restituiti da Nominatim, dal più specifico al meno specifico — nessuna
  logica di matching duplicata. Se non trova corrispondenza ritorna
  `regionId: null`: il frontend mostra "nessuna notizia locale per
  quest'area", non un errore.
- **`components/MapView.tsx`**: `react-leaflet`, caricato con
  `next/dynamic({ ssr: false })` (Leaflet richiede `window`, non supporta
  SSR). Marker `CircleMarker` (nessuna dipendenza da immagini icona, a
  differenza del `Marker` di default di Leaflet — evita un problema noto di
  bundling), raggio/opacità proporzionali al numero di articoli. Tile
  CartoDB Positron/Dark Matter, seguono il tema attivo (automatico da
  `prefers-color-scheme`, oppure la scelta esplicita del menu "Aspetto" —
  vedi Step 5a). Layout desktop a due
  colonne (mappa + pannello risultati), sotto i 768px si impila verticalmente
  — stesso breakpoint del resto del sito.
- **Non incluso**: 3.7 della spec originale (arricchimento con API geo
  esterne tipo NewsData.io/GNews come fallback) — la spec stessa lo marca
  "opzionale, per ultimo", e contraddice il principio "nessuna dipendenza
  critica da API esterne a pagamento o con free tier limitato". Da valutare
  solo se emerge un bisogno reale.

## Tendenze e timeline (Macro Step 4)

Nessuna nuova pipeline dati: solo aggregazioni su ciò che esiste già
(`article_clusters` dello Step 1, `article_regions` dello Step 2,
`published_at`), più un filtro temporale condiviso da feed/mappa/tendenze.

- **`get_trending_clusters(p_from, p_to, p_limit)`** (nuova RPC): "storia di
  tendenza" = cluster con **almeno 2 fonti distinte** nella finestra scelta,
  ordinato per numero di fonti poi di articoli. Ritorna l'articolo più
  recente del cluster (stesso pattern jsonb annidato di `get_my_feed`).
- **`get_region_article_counts`, `get_articles_for_region`, `get_my_feed`**:
  estese con `p_from`/`p_to` opzionali (default `null` = comportamento
  identico a prima — la mappa continua a funzionare invariata quando non li
  passa). Nota tecnica: cambiare la lista dei parametri di una funzione
  Postgres richiede **droppare la vecchia firma esplicitamente** prima del
  `create or replace`, altrimenti Postgres la tratta come un overload
  distinto invece che sostituirla, e PostgREST fallisce con "funzione
  ambigua" chiamandola con meno argomenti.
- **`components/TimeRangeFilter.tsx`**: bottoni preset (Ultime 24h / Ultimi
  3 giorni / Ultima settimana / Sempre) invece di un vero slider
  trascinabile — stesso risultato funzionale (filtrare per intervallo),
  senza introdurre una libreria di slider. Riusato in `/`, `/map`, `/trends`
  in modo indipendente (nessuno stato condiviso tra pagine).
- **`app/trends`** (nuova pagina "Tendenze", default "Ultimi 3 giorni"):
  storie di tendenza (`ArticleCard` con la nuova prop opzionale `badge`, es.
  "3 fonti") e zone di tendenza (lista classificata, ogni riga linka
  `/map?region={id}` — `MapView` legge il parametro e seleziona
  automaticamente quella zona al caricamento).
- Sulla mappa, `from`/`to` sono passati a `/api/map/regions` e
  `/api/map/news`; **la chiave di cache Redis li include**, altrimenti
  richieste con range diversi si sovrascriverebbero a vicenda in cache.

## Ricerca, card, aspetto, skeleton loader (Macro Step 5a)

Prima metà dello Step 5 "UX e interfaccia" della spec — la parte più
contenuta (ricerca, card, dark mode/densità, skeleton). PWA offline e
"salva per dopo"/cronologia restano per un giro successivo (Step 5b, vedi
Roadmap): richiedono un service worker e/o una nuova tabella, paragonabili
a uno step a sé.

- **Ricerca full-text sul feed principale**: colonna generata
  `articles.search_vector` (`tsvector`, config `simple` — il feed è misto
  IT/EN, uno stemmer per una sola lingua penalizzerebbe l'altra) + indice
  GIN. Query diretta via `.textSearch()` di `supabase-js`
  (`websearch_to_tsquery`, nessuna query testuale costruita a mano); RPC
  `get_my_feed` estesa con `p_search` opzionale per restare coerente tra
  feed pubblico e "I miei interessi". Si combina con i filtri
  fonte/tag/tempo esistenti. Non estesa a Tendenze/Mappa: lì il filtro
  naturale resta temporale/geografico.
- **Card articolo**: nuova riga con data (relativa entro 48h via
  `Intl.RelativeTimeFormat`, assoluta oltre) e tempo di lettura stimato
  (`lib/format.ts`). La stima è dichiaratamente sull'anteprima disponibile,
  non sull'articolo completo — coerente col principio "solo excerpt,
  niente scraping" — e lo dice esplicitamente in un tooltip.
- **Dark mode con toggle manuale + densità layout**: menu "Aspetto"
  nell'header (`components/AppearanceMenu.tsx`). Preferenza in
  `localStorage` (`lib/appearance.ts`), applicata via attributi
  `data-theme`/`data-density` su `<html>`, scritti **prima
  dell'idratazione** da uno script inline in `app/layout.tsx` (evita un
  flash del tema/spaziatura sbagliati al reload). Se l'utente non sceglie
  esplicitamente, il tema resta automatico da `prefers-color-scheme`
  (comportamento invariato) — il toggle *sovrascrive*, non sostituisce.
- **Skeleton loader**: `components/SkeletonCard.tsx` riusa la stessa
  struttura (immagine + blocchi di testo) di `ArticleCard`, mostrato solo
  al primo caricamento di feed e tendenze — l'infinite scroll resta col
  testo "Caricamento…" già presente, adeguato a fondo pagina.

## Roadmap (Macro Step 5b-6, non ancora implementati)

- **Step 5b — UX (parte restante)**: tre viste (Feed, Tendenze, Mappa) con
  navigazione unificata (oggi sono link indipendenti nell'header), PWA
  installabile con cache offline degli articoli già visti, "salva per
  dopo" e cronologia persistente (nuova tabella, richiede login),
  passaggio di accessibilità.
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
- `sources`, `articles`, `tags`, `article_tag`, `regions`, `article_regions`:
  lettura pubblica (anon + authenticated), nessuna scrittura da client (solo
  lo script di ingestion, con la service role key, scrive articoli e
  geo-tag).
- `profiles`, `user_preferences`, `user_reading_history`, `user_questions`:
  ogni utente vede/modifica solo le proprie righe (`auth.uid()`).
