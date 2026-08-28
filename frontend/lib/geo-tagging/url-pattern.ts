import type { RegionMatch, RegionRow } from './types'

const CONFIDENCE = 0.6

// Solo ANSA ha nel path dell'URL un segnale geografico strutturato
// (/sito/notizie/mondo/{macro-regione}/...), verificato ispezionando gli URL
// reali degli articoli già in DB. Le altre fonti (BBC: ID opachi; Il Post,
// Il Fatto Quotidiano, TechCrunch, The Verge: slug basati sul titolo) non
// hanno un pattern affidabile: non compaiono qui, quindi non producono
// nessun match — non è un caso dimenticato, è la realtà dei dati.
const ANSA_MONDO_PATTERN = /\/mondo\/(europa|americalatina|nordamerica|asia|africa|mediooriente)\//

const ANSA_SLUG_TO_MACRO_REGION: Record<string, string> = {
  europa: 'Europa',
  americalatina: 'America Latina',
  nordamerica: 'Nord America',
  asia: 'Asia',
  africa: 'Africa',
  mediooriente: 'Medio Oriente',
}

export function matchUrlPattern(url: string, sourceName: string, regionsByNameAndLevel: Map<string, RegionRow>): RegionMatch[] {
  if (!sourceName.startsWith('ANSA')) return []

  const match = url.match(ANSA_MONDO_PATTERN)
  if (!match) return []

  const macroRegionName = ANSA_SLUG_TO_MACRO_REGION[match[1]]
  const region = regionsByNameAndLevel.get(`${macroRegionName}::macro_region`)
  if (!region) return []

  return [{ regionId: region.id, sourceType: 'url_pattern', confidence: CONFIDENCE }]
}
