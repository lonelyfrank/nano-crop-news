import { createAdminClient } from '../_shared/supabase-admin.ts'
import { fetchFeed } from './feed-parser.ts'
import { findClusterIdFor } from './clusterer.ts'
import { RssExcerptSummaryGenerator, type SummaryGenerator } from './summary.ts'

// Per abilitare in futuro i riassunti generati via AI, sostituisci questa
// riga con `new AiSummaryGenerator()` (dopo averne implementato la logica in
// summary.ts): nessun'altra modifica è richiesta al resto della function.
const summaryGenerator: SummaryGenerator = new RssExcerptSummaryGenerator()

const USER_AGENT = Deno.env.get('RSS_USER_AGENT') ?? 'NanoCropNewsBot/1.0 (+https://example.com)'
const FETCH_TIMEOUT_MS = Number(Deno.env.get('RSS_FETCH_TIMEOUT_MS') ?? '15000')
const CLUSTER_WINDOW_HOURS = Number(Deno.env.get('RSS_CLUSTER_WINDOW_HOURS') ?? '72')
const CLUSTER_SIMILARITY_THRESHOLD = Number(Deno.env.get('RSS_CLUSTER_SIMILARITY_THRESHOLD') ?? '80')

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

  let totalCreated = 0
  const report: Record<string, string> = {}

  for (const source of sources ?? []) {
    try {
      const items = await fetchFeed(source.rss_url, USER_AGENT, FETCH_TIMEOUT_MS)
      let createdForSource = 0

      for (const item of items) {
        if (!item.title || !item.link) continue

        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('original_url', item.link)
          .maybeSingle()

        if (existing) continue

        const { data: inserted, error: insertError } = await supabase
          .from('articles')
          .insert({
            source_id: source.id,
            title: item.title,
            original_url: item.link,
            excerpt: item.description,
            summary_type: 'rss_excerpt',
            summary_text: summaryGenerator.generate(item.description),
            author: item.author,
            image_url: item.imageUrl,
            published_at: item.publishedAt,
          })
          .select('id, title')
          .single()

        if (insertError || !inserted) {
          continue
        }

        const clusterId = await findClusterIdFor(inserted.title, source.id, {
          windowHours: CLUSTER_WINDOW_HOURS,
          similarityThreshold: CLUSTER_SIMILARITY_THRESHOLD,
          findCandidates: async (excludeSourceId, sinceIso) => {
            const { data } = await supabase
              .from('articles')
              .select('id, title, cluster_id')
              .neq('source_id', excludeSourceId)
              .gte('published_at', sinceIso)
              .order('published_at', { ascending: false })
              .limit(500)
            return data ?? []
          },
          createCluster: async (mainArticleId) => {
            const { data: cluster, error: clusterError } = await supabase
              .from('article_clusters')
              .insert({ main_article_id: mainArticleId })
              .select('id')
              .single()

            if (clusterError || !cluster) {
              throw new Error(clusterError?.message ?? 'Impossibile creare il cluster')
            }

            await supabase.from('articles').update({ cluster_id: cluster.id }).eq('id', mainArticleId)

            return cluster.id
          },
        })

        if (clusterId !== null) {
          await supabase.from('articles').update({ cluster_id: clusterId }).eq('id', inserted.id)
        }

        createdForSource++
        totalCreated++
      }

      report[source.name] = `${createdForSource} nuovi articoli (${items.length} nel feed)`
    } catch (error) {
      // Una fonte rotta non blocca le altre.
      report[source.name] = `errore: ${(error as Error).message}`
    }
  }

  return new Response(JSON.stringify({ created: totalCreated, report }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
