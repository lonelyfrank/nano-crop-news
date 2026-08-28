import sourcesGeo from '@/data/sources-geo.json'
import type { RegionMatch, RegionRow } from './types'

const CONFIDENCE = 0.3 // segnale debole: dice dove è pubblicato, non di cosa parla

type SourcesGeoMap = Record<string, { region: string; level: string }>

/**
 * Applicato sempre come base minima (vedi data/sources-geo.json): ogni
 * articolo riceve almeno la regione di default della propria fonte.
 */
export function matchSourceDefault(sourceName: string, regionsByNameAndLevel: Map<string, RegionRow>): RegionMatch[] {
  const entry = (sourcesGeo as SourcesGeoMap)[sourceName]
  if (!entry) return []

  const region = regionsByNameAndLevel.get(`${entry.region}::${entry.level}`)
  if (!region) return []

  return [{ regionId: region.id, sourceType: 'source_default', confidence: CONFIDENCE }]
}
