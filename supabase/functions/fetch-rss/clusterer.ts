export interface ClusterCandidate {
  id: number
  title: string
  cluster_id: number | null
}

export interface ClustererDeps {
  windowHours: number
  similarityThreshold: number
  findCandidates: (excludeSourceId: number, sinceIso: string) => Promise<ClusterCandidate[]>
  createCluster: (mainArticleId: number) => Promise<number>
}

/**
 * Deduplica/clusterizza la stessa notizia raccontata da fonti diverse,
 * confrontando i titoli con un coefficiente di similarity a bigrammi
 * (equivalente allo scopo di similar_text() di PHP usato nella prima
 * versione Laravel di questo progetto). Un cluster nasce solo quando viene
 * trovato un secondo articolo abbastanza simile: un articolo isolato resta
 * senza cluster_id finché non arriva un match.
 */
export async function findClusterIdFor(
  title: string,
  excludeSourceId: number,
  deps: ClustererDeps,
): Promise<number | null> {
  const normalizedTitle = normalize(title)
  if (!normalizedTitle) return null

  const since = new Date(Date.now() - deps.windowHours * 60 * 60 * 1000).toISOString()
  const candidates = await deps.findCandidates(excludeSourceId, since)

  for (const candidate of candidates) {
    const score = diceCoefficient(normalizedTitle, normalize(candidate.title))

    if (score >= deps.similarityThreshold) {
      if (candidate.cluster_id !== null) {
        return candidate.cluster_id
      }
      return await deps.createCluster(candidate.id)
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

  const totalBigrams = (a.length - 1) + (b.length - 1)
  return totalBigrams === 0 ? 0 : (2 * intersection / totalBigrams) * 100
}
