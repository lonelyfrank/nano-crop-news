import gazetteerAliases from '@/data/gazetteer.json'
import type { RegionMatch, RegionRow, RegionSourceType } from './types'

const CONFIDENCE = 0.65

interface GazetteerEntry {
  regex: RegExp
  regionId: number
}

export interface GazetteerIndex {
  entries: GazetteerEntry[]
}

/**
 * Costruisce una volta per esecuzione la mappa termine→region_id: il nome
 * canonico di ogni regione (dalla tabella `regions`, caricata una volta) più
 * le alias extra curate in data/gazetteer.json (es. "Stati Uniti" → anche
 * "USA", "America"). Non duplica l'elenco delle regioni nel file JSON.
 */
export function buildGazetteerIndex(regions: RegionRow[]): GazetteerIndex {
  const idByName = new Map(regions.map((r) => [r.name, r.id]))
  const entries: GazetteerEntry[] = regions.map((region) => ({
    regionId: region.id,
    regex: buildWordBoundaryRegex(region.name),
  }))

  for (const [canonicalName, aliases] of Object.entries(gazetteerAliases as Record<string, string[]>)) {
    const regionId = idByName.get(canonicalName)
    if (!regionId) continue // nome canonico non trovato in regions: seed disallineato, da correggere a monte

    for (const alias of aliases) {
      entries.push({ regionId, regex: buildWordBoundaryRegex(alias) })
    }
  }

  // Termini più lunghi prima, così un nome più specifico (es. "Corea del
  // Sud") ha priorità su un'eventuale sotto-stringa più corta e generica.
  entries.sort((a, b) => b.regex.source.length - a.regex.source.length)

  return { entries }
}

/**
 * Scansiona un testo libero (titolo+excerpt) contro l'indice, con confine di
 * parola per ridurre i falsi positivi su nomi corti (non li elimina del
 * tutto: vedi limite noto in README).
 */
export function matchGazetteer(title: string, excerpt: string, index: GazetteerIndex): RegionMatch[] {
  return matchTextAgainstIndex(`${title} ${excerpt}`, index, 'gazetteer_match', CONFIDENCE)
}

/**
 * Stessa logica di matching, riusata da rss-category.ts per confrontare
 * singoli tag di categoria (match più precisi perché su testo strutturato
 * dall'editore, non su prosa libera).
 */
export function matchTextAgainstIndex(
  text: string,
  index: GazetteerIndex,
  sourceType: RegionSourceType,
  confidence: number,
): RegionMatch[] {
  const normalized = normalize(text)
  const matchedRegionIds = new Set<number>()
  const matches: RegionMatch[] = []

  for (const entry of index.entries) {
    if (matchedRegionIds.has(entry.regionId)) continue
    if (entry.regex.test(normalized)) {
      matchedRegionIds.add(entry.regionId)
      matches.push({ regionId: entry.regionId, sourceType, confidence })
    }
  }

  return matches
}

function buildWordBoundaryRegex(term: string): RegExp {
  const normalized = normalize(term)
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u')
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove diacritici (é→e, à→a, ...)
    .trim()
}
