import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchFeedRaw, parseFeedXml } from './feed-parser'
import { findMatchingCandidate, type ClusterCandidate } from './clusterer'
import { RssExcerptSummaryGenerator, type SummaryGenerator } from './summary'
import { normalizeUrl } from './normalize-url'
import { getCachedFeed, setCachedFeed } from './redis-cache'
import { retryWithBackoff } from './retry'
import { loadGeoTaggingContext, resolveRegionsForArticle } from '@/lib/geo-tagging'

// Per abilitare in futuro i riassunti generati via AI, sostituisci questa
// riga con `new AiSummaryGenerator()` (dopo averne implementato la logica in
// summary.ts): nessun'altra modifica è richiesta al resto dello script.
const summaryGenerator: SummaryGenerator = new RssExcerptSummaryGenerator()

const USER_AGENT = process.env.RSS_USER_AGENT ?? 'NanoCropNewsBot/1.0 (+https://example.com)'
const FETCH_TIMEOUT_MS = Number(process.env.RSS_FETCH_TIMEOUT_MS ?? '15000')
const CLUSTER_WINDOW_HOURS = Number(process.env.RSS_CLUSTER_WINDOW_HOURS ?? '72')
const CLUSTER_SIMILARITY_THRESHOLD = Number(process.env.RSS_CLUSTER_SIMILARITY_THRESHOLD ?? '80')

// Stesso ordine di grandezza già validato in produzione con ~20 fonti attive
// (vedi README): tiene sotto controllo il costo O(nuovi_articoli × pool) del
// matching di similarity.
const CANDIDATE_POOL_LIMIT = 300
const MAX_ITEMS_PER_SOURCE = 30

// TTL della cache Redis dei feed grezzi, coerente con la cadenza dello
// scheduler GitHub Actions (vedi .github/workflows/ingest.yml).
const FEED_CACHE_TTL_SECONDS = 20 * 60

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono richieste (vedi .env.example).')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: sources, error: sourcesError } = await supabase
    .from('sources')
    .select('id, name, rss_url')
    .eq('active', true)

  if (sourcesError) {
    throw new Error(`Impossibile leggere le fonti: ${sourcesError.message}`)
  }

  // Pool di candidati per il clustering, caricato UNA sola volta per l'intera
  // esecuzione (non per ogni articolo): con molte fonti/articoli, una query
  // di similarity per ogni singolo articolo esaurisce rapidamente le
  // risorse disponibili (bug reale già visto e corretto in questo progetto).
  const since = new Date(Date.now() - CLUSTER_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data: initialPool } = await supabase
    .from('articles')
    .select('id, title, source_id, cluster_id')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT)

  const candidatePool: ClusterCandidate[] = initialPool ?? []
  const geoContext = await loadGeoTaggingContext(supabase)

  // Accumulate le righe di article_regions di tutte le fonti per un unico
  // insert batch a fine esecuzione, non uno per articolo (stessa disciplina
  // già applicata a dedup/insert articoli e clustering).
  const articleRegionRows: {
    article_id: number
    region_id: number
    source_type: string
    confidence: number
  }[] = []

  let totalCreated = 0
  const report: Record<string, string> = {}

  for (const source of sources ?? []) {
    try {
      const body = await getOrFetchFeedBody(source.rss_url)
      const items = parseFeedXml(body)
        .filter((item) => item.title && item.link)
        .slice(0, MAX_ITEMS_PER_SOURCE)

      if (items.length === 0) {
        report[source.name] = '0 nuovi articoli (0 nel feed)'
        continue
      }

      const normalizedItems = items.map((item) => ({ ...item, link: normalizeUrl(item.link) }))

      // Dedup in un'unica query invece che una select per item.
      const links = [...new Set(normalizedItems.map((item) => item.link))]
      const { data: existingRows } = await supabase.from('articles').select('original_url').in('original_url', links)

      const existingLinks = new Set((existingRows ?? []).map((row) => row.original_url))
      const newItemsByLink = new Map(
        normalizedItems.filter((item) => !existingLinks.has(item.link)).map((item) => [item.link, item]),
      )

      if (newItemsByLink.size === 0) {
        report[source.name] = `0 nuovi articoli (${items.length} nel feed)`
        continue
      }

      // Insert in un'unica chiamata per tutti i nuovi articoli della fonte.
      const { data: inserted, error: insertError } = await supabase
        .from('articles')
        .insert(
          [...newItemsByLink.values()].map((item) => ({
            source_id: source.id,
            title: item.title,
            original_url: item.link,
            excerpt: item.description,
            summary_type: 'rss_excerpt' as const,
            summary_text: summaryGenerator.generate(item.description),
            author: item.author,
            image_url: item.imageUrl,
            published_at: item.publishedAt,
            rss_category: item.category,
          })),
        )
        .select('id, title, source_id, original_url, excerpt, rss_category')

      if (insertError || !inserted) {
        report[source.name] = `errore insert: ${insertError?.message ?? 'sconosciuto'}`
        continue
      }

      for (const article of inserted) {
        const clusterId = await resolveClusterId(supabase, article, candidatePool)

        if (clusterId !== null) {
          await supabase.from('articles').update({ cluster_id: clusterId }).eq('id', article.id)
        }

        // push, non unshift: unshift è O(n) per chiamata, qui l'ordine non è
        // rilevante perché il matching scansiona comunque tutto il pool.
        candidatePool.push({
          id: article.id,
          title: article.title,
          source_id: article.source_id,
          cluster_id: clusterId,
        })

        const regionMatches = resolveRegionsForArticle(
          {
            id: article.id,
            title: article.title,
            excerpt: article.excerpt ?? '',
            originalUrl: article.original_url,
            rssCategory: article.rss_category,
            sourceId: article.source_id,
            sourceName: source.name,
          },
          geoContext,
        )

        for (const match of regionMatches) {
          articleRegionRows.push({
            article_id: article.id,
            region_id: match.regionId,
            source_type: match.sourceType,
            confidence: match.confidence,
          })
        }
      }

      totalCreated += inserted.length
      report[source.name] = `${inserted.length} nuovi articoli (${items.length} nel feed)`
    } catch (error) {
      // Una fonte rotta non blocca le altre.
      report[source.name] = `errore: ${(error as Error).message}`
    }
  }

  let regionRowsInserted = 0
  for (let i = 0; i < articleRegionRows.length; i += 500) {
    const chunk = articleRegionRows.slice(i, i + 500)
    const { error } = await supabase.from('article_regions').insert(chunk)
    if (!error) regionRowsInserted += chunk.length
  }

  console.log(JSON.stringify({ created: totalCreated, regionRowsInserted, report }, null, 2))
}

async function getOrFetchFeedBody(rssUrl: string): Promise<string> {
  const cached = await getCachedFeed(rssUrl)
  if (cached) return cached

  const body = await retryWithBackoff(() => fetchFeedRaw(rssUrl, USER_AGENT, FETCH_TIMEOUT_MS))
  await setCachedFeed(rssUrl, body, FEED_CACHE_TTL_SECONDS)
  return body
}

/**
 * Trova (o crea) il cluster per un articolo appena inserito, usando il pool
 * di candidati già in memoria. Scrive sul database solo quando serve
 * davvero creare un nuovo cluster (caso raro), non per ogni articolo.
 */
async function resolveClusterId(
  supabase: SupabaseClient,
  article: { id: number; title: string; source_id: number },
  candidatePool: ClusterCandidate[],
): Promise<number | null> {
  const match = findMatchingCandidate(article.title, article.source_id, candidatePool, CLUSTER_SIMILARITY_THRESHOLD)

  if (!match) return null

  if (match.cluster_id !== null) {
    return match.cluster_id
  }

  const { data: cluster, error } = await supabase
    .from('article_clusters')
    .insert({ main_article_id: match.id })
    .select('id')
    .single()

  if (error || !cluster) return null

  await supabase.from('articles').update({ cluster_id: cluster.id }).eq('id', match.id)
  match.cluster_id = cluster.id // aggiorna il pool in memoria per i prossimi confronti

  return cluster.id
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
