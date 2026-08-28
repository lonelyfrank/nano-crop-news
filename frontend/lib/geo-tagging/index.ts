import type { SupabaseClient } from '@supabase/supabase-js'
import { matchSourceDefault } from './source-default'
import { matchUrlPattern } from './url-pattern'
import { matchRssCategory } from './rss-category'
import { matchGazetteer, buildGazetteerIndex, type GazetteerIndex } from './gazetteer'
import type { ArticleForGeoTagging, RegionMatch, RegionRow } from './types'

export type { ArticleForGeoTagging, RegionMatch } from './types'

export interface GeoTaggingContext {
  regionsByNameAndLevel: Map<string, RegionRow>
  gazetteerIndex: GazetteerIndex
}

/**
 * Carica le regioni una sola volta per esecuzione (non per articolo): le
 * funzioni di matching sono pure e non fanno accesso DB, coerentemente con
 * la disciplina di batching già adottata nel resto dell'ingestion.
 */
export async function loadGeoTaggingContext(supabase: SupabaseClient): Promise<GeoTaggingContext> {
  const { data, error } = await supabase.from('regions').select('id, name, level')
  if (error || !data) {
    throw new Error(`Impossibile caricare le regioni: ${error?.message ?? 'sconosciuto'}`)
  }

  const regions = data as RegionRow[]
  const regionsByNameAndLevel = new Map(regions.map((r) => [`${r.name}::${r.level}`, r]))
  const gazetteerIndex = buildGazetteerIndex(regions)

  return { regionsByNameAndLevel, gazetteerIndex }
}

/**
 * Orchestratore: chiama le 4 tecniche e ritorna le righe da inserire in
 * article_regions (nessuna scrittura qui: il chiamante fa l'insert batch).
 */
export function resolveRegionsForArticle(article: ArticleForGeoTagging, context: GeoTaggingContext): RegionMatch[] {
  const matches: RegionMatch[] = [
    ...matchSourceDefault(article.sourceName, context.regionsByNameAndLevel),
    ...matchUrlPattern(article.originalUrl, article.sourceName, context.regionsByNameAndLevel),
    ...matchRssCategory(article.rssCategory, context.gazetteerIndex),
    ...matchGazetteer(article.title, article.excerpt, context.gazetteerIndex),
  ]

  // Ogni matcher deduplica già al suo interno; dedup finale su
  // (regionId, sourceType) per sicurezza (rispetta il vincolo unique).
  const seen = new Set<string>()
  return matches.filter((match) => {
    const key = `${match.regionId}::${match.sourceType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
