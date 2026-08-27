import { createAdminClient } from '../_shared/supabase-admin.ts'
import { fetchFeed } from './feed-parser.ts'
import { findMatchingCandidate, type ClusterCandidate } from './clusterer.ts'
import { RssExcerptSummaryGenerator, type SummaryGenerator } from './summary.ts'

// Per abilitare in futuro i riassunti generati via AI, sostituisci questa
// riga con `new AiSummaryGenerator()` (dopo averne implementato la logica in
// summary.ts): nessun'altra modifica è richiesta al resto della function.
const summaryGenerator: SummaryGenerator = new RssExcerptSummaryGenerator()

const USER_AGENT = Deno.env.get('RSS_USER_AGENT') ?? 'NanoCropNewsBot/1.0 (+https://example.com)'
const FETCH_TIMEOUT_MS = Number(Deno.env.get('RSS_FETCH_TIMEOUT_MS') ?? '15000')
const CLUSTER_WINDOW_HOURS = Number(Deno.env.get('RSS_CLUSTER_WINDOW_HOURS') ?? '72')
const CLUSTER_SIMILARITY_THRESHOLD = Number(Deno.env.get('RSS_CLUSTER_SIMILARITY_THRESHOLD') ?? '80')

// Limite al pool di candidati per il clustering: il confronto di similarity
// è O(nuovi_articoli × pool), quindi un pool troppo grande fa esplodere il
// costo con molte fonti. 300 è ampio abbastanza per intercettare le notizie
// "duplicate" tra fonti diverse nella finestra di default (72h).
const CANDIDATE_POOL_LIMIT = 300

// Tetto di item processati per singola fonte a ogni invocazione. Alcuni feed
// (es. categorie ANSA, Gazzetta dello Sport) possono restituire centinaia di
// item in un colpo solo: non facciamo backfill storico profondo (non serve
// per un aggregatore di notizie correnti) e limitiamo così anche il costo,
// altrimenti O(nuovi_articoli × pool) esaurisce le risorse della function
// con molte fonti (visto in produzione con 21 fonti attive).
const MAX_ITEMS_PER_SOURCE = 30

Deno.serve(async () => {
  const supabase = createAdminClient()

  const { data: sources, error: sourcesError } = await supabase
    .from('sources')
    .select('id, name, rss_url')
    .eq('active', true)

  if (sourcesError) {
    return new Response(JSON.stringify({ error: sourcesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Pool di candidati per il clustering, caricato UNA sola volta per l'intera
  // invocazione (non per ogni articolo): con molte fonti/articoli, una query
  // di similarity per ogni singolo articolo esauriva le risorse della Edge
  // Function. Viene aggiornato in memoria mano a mano che si inseriscono
  // nuovi articoli, così il clustering funziona anche tra fonti diverse
  // elaborate nella stessa invocazione.
  const since = new Date(Date.now() - CLUSTER_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data: initialPool } = await supabase
    .from('articles')
    .select('id, title, source_id, cluster_id')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT)

  const candidatePool: ClusterCandidate[] = initialPool ?? []

  let totalCreated = 0
  const report: Record<string, string> = {}

  for (const source of sources ?? []) {
    try {
      const items = (await fetchFeed(source.rss_url, USER_AGENT, FETCH_TIMEOUT_MS))
        .filter((item) => item.title && item.link)
        .slice(0, MAX_ITEMS_PER_SOURCE)

      if (items.length === 0) {
        report[source.name] = `0 nuovi articoli (0 nel feed)`
        continue
      }

      // Dedup in un'unica query invece che una select per item.
      const links = [...new Set(items.map((item) => item.link))]
      const { data: existingRows } = await supabase
        .from('articles')
        .select('original_url')
        .in('original_url', links)

      const existingLinks = new Set((existingRows ?? []).map((row) => row.original_url))
      const newItemsByLink = new Map(
        items.filter((item) => !existingLinks.has(item.link)).map((item) => [item.link, item]),
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
          })),
        )
        .select('id, title, source_id')

      if (insertError || !inserted) {
        report[source.name] = `errore insert: ${insertError?.message ?? 'sconosciuto'}`
        continue
      }

      for (const article of inserted) {
        const clusterId = await resolveClusterId(supabase, article, candidatePool)

        if (clusterId !== null) {
          await supabase.from('articles').update({ cluster_id: clusterId }).eq('id', article.id)
        }

        // push, non unshift: unshift è O(n) per chiamata (ri-orderebbe
        // l'intero array a ogni articolo), qui l'ordine non è rilevante
        // perché il matching scansiona comunque tutto il pool.
        candidatePool.push({
          id: article.id,
          title: article.title,
          source_id: article.source_id,
          cluster_id: clusterId,
        })
      }

      totalCreated += inserted.length
      report[source.name] = `${inserted.length} nuovi articoli (${items.length} nel feed)`
    } catch (error) {
      // Una fonte rotta non blocca le altre.
      report[source.name] = `errore: ${(error as Error).message}`
    }
  }

  return new Response(JSON.stringify({ created: totalCreated, report }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

/**
 * Trova (o crea) il cluster per un articolo appena inserito, usando il pool
 * di candidati già in memoria. Scrive sul database solo quando serve
 * davvero creare un nuovo cluster (caso raro), non per ogni articolo.
 */
async function resolveClusterId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  article: { id: number; title: string; source_id: number },
  candidatePool: ClusterCandidate[],
): Promise<number | null> {
  const match = findMatchingCandidate(
    article.title,
    article.source_id,
    candidatePool,
    CLUSTER_SIMILARITY_THRESHOLD,
  )

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
