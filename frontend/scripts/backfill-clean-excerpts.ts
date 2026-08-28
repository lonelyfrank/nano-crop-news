import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { cleanDescription } from './ingest/feed-parser'

/**
 * Una tantum: ripulisce l'HTML grezzo rimasto in excerpt/summary_text degli
 * articoli ingested prima del fix in feed-parser.ts (alcune fonti WordPress
 * mettono <p>/<a href> dentro <description>, mostrati come testo letterale
 * dal frontend). Non è schedulato, va lanciato a mano una volta.
 */
const BATCH_SIZE = 200

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono richieste (vedi .env.example).')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  let cursor = 0
  let processed = 0
  let updated = 0

  for (;;) {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, excerpt, summary_text')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`Impossibile leggere gli articoli: ${error.message}`)
    if (!articles || articles.length === 0) break

    for (const article of articles) {
      const cleanedExcerpt = cleanDescription(article.excerpt ?? '')
      const cleanedSummary = article.summary_text ? cleanDescription(article.summary_text) : article.summary_text

      if (cleanedExcerpt !== article.excerpt || cleanedSummary !== article.summary_text) {
        const { error: updateError } = await supabase
          .from('articles')
          .update({ excerpt: cleanedExcerpt, summary_text: cleanedSummary })
          .eq('id', article.id)

        if (updateError) {
          console.error(`Errore update articolo ${article.id}: ${updateError.message}`)
        } else {
          updated++
        }
      }
    }

    processed += articles.length
    cursor = articles[articles.length - 1].id
    console.log(`Elaborati ${processed} articoli (fino a id ${cursor}), ${updated} aggiornati finora...`)
  }

  console.log(JSON.stringify({ processed, updated }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
