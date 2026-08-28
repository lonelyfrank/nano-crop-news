export interface ClusterCandidate {
  id: number
  title: string
  source_id: number
  cluster_id: number | null
}

/**
 * Deduplica/clusterizza la stessa notizia raccontata da fonti diverse,
 * confrontando i titoli con un coefficiente di similarity a bigrammi.
 *
 * Pura (nessun accesso DB): riceve un pool di articoli candidati già
 * caricato una volta sola per l'intera invocazione (vedi index.ts), invece
 * di interrogare il database per ogni singolo articolo — con molte fonti
 * quest'ultimo approccio esauriva le risorse dell'ingestion (visto con la
 * Edge Function Deno originaria, stesso bug evitato qui fin da subito).
 */
export function findMatchingCandidate(
  title: string,
  excludeSourceId: number,
  candidates: ClusterCandidate[],
  similarityThreshold: number,
): ClusterCandidate | null {
  const normalizedTitle = normalize(title)
  if (!normalizedTitle) return null

  for (const candidate of candidates) {
    if (candidate.source_id === excludeSourceId) continue

    const score = diceCoefficient(normalizedTitle, normalize(candidate.title))
    if (score >= similarityThreshold) {
      return candidate
    }
  }

  return null
}

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Percentuale di similarity 0-100 tra due stringhe, basata su bigrammi (coefficiente di Dice). */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 100
  if (a.length < 2 || b.length < 2) return 0

  const bigramCounts = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const gram = s.slice(i, i + 2)
      map.set(gram, (map.get(gram) ?? 0) + 1)
    }
    return map
  }

  const bigramsA = bigramCounts(a)
  const bigramsB = bigramCounts(b)

  let intersection = 0
  for (const [gram, count] of bigramsA) {
    const countB = bigramsB.get(gram)
    if (countB) {
      intersection += Math.min(count, countB)
    }
  }

  const totalBigrams = a.length - 1 + (b.length - 1)
  return totalBigrams === 0 ? 0 : (2 * intersection / totalBigrams) * 100
}
