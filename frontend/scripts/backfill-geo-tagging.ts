import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { loadGeoTaggingContext, resolveRegionsForArticle } from '@/lib/geo-tagging'

/**
 * Una tantum: applica il geo-tagging agli articoli già in DB da prima
 * dell'introduzione di questa pipeline (Macro Step 2). Va lanciato a mano
 * una sola volta dopo il deploy della migration — non è schedulato.
 */
const BATCH_SIZE = 200

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono richieste (vedi .env.example).')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const geoContext = await loadGeoTaggingContext(supabase)

  const { data: sources, error: sourcesError } = await supabase.from('sources').select('id, name')
  if (sourcesError || !sources) {
    throw new Error(`Impossibile leggere le fonti: ${sourcesError?.message ?? 'sconosciuto'}`)
  }
  const sourceNameById = new Map(sources.map((s) => [s.id, s.name]))

  let processed = 0
  let regionRowsInserted = 0
  let cursor = 0

  for (;;) {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, title, excerpt, original_url, rss_category, source_id')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`Impossibile leggere gli articoli: ${error.message}`)
    if (!articles || articles.length === 0) break

    const rows = articles.flatMap((article) => {
      const sourceName = sourceNameById.get(article.source_id)
      if (!sourceName) return []

      const matches = resolveRegionsForArticle(
        {
          id: article.id,
          title: article.title,
          excerpt: article.excerpt ?? '',
          originalUrl: article.original_url,
          rssCategory: article.rss_category,
          sourceId: article.source_id,
          sourceName,
        },
        geoContext,
      )

      return matches.map((match) => ({
        article_id: article.id,
        region_id: match.regionId,
        source_type: match.sourceType,
        confidence: match.confidence,
      }))
    })

    if (rows.length > 0) {
      // on conflict: se rilanciato più volte non duplica (stesso vincolo
      // unique di article_regions).
      const { error: insertError } = await supabase
        .from('article_regions')
        .upsert(rows, { onConflict: 'article_id,region_id,source_type', ignoreDuplicates: true })

      if (insertError) {
        console.error(`Errore insert batch (cursor ${cursor}): ${insertError.message}`)
      } else {
        regionRowsInserted += rows.length
      }
    }

    processed += articles.length
    cursor = articles[articles.length - 1].id
    console.log(`Elaborati ${processed} articoli (fino a id ${cursor})...`)
  }

  console.log(JSON.stringify({ processed, regionRowsInserted }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
