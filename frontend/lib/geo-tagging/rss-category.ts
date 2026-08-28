import { matchTextAgainstIndex, type GazetteerIndex } from './gazetteer'
import type { RegionMatch } from './types'

const CONFIDENCE = 0.55

/**
 * `rss_category` è una lista di tag separati da " | " (vedi
 * scripts/ingest/feed-parser.ts): ogni tag viene confrontato singolarmente
 * con l'indice del gazetteer (match esatto/alias su testo strutturato
 * dall'editore, non scansione di prosa libera come in gazetteer.ts).
 */
export function matchRssCategory(rssCategory: string | null, index: GazetteerIndex): RegionMatch[] {
  if (!rssCategory) return []

  const tags = rssCategory.split('|').map((tag) => tag.trim()).filter(Boolean)
  if (tags.length === 0) return []

  return matchTextAgainstIndex(tags.join(' '), index, 'rss_category', CONFIDENCE)
}
