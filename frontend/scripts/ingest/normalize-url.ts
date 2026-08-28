const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gclsrc$/i,
  /^mc_[a-z]+$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^ref_url$/i,
  /^igshid$/i,
  /^spm$/i,
  /^cmpid$/i,
  /^wt_[a-z]+$/i,
]

/**
 * Rimuove i query param di tracking più comuni prima di usare l'URL come
 * chiave di dedup (`articles.original_url`): due link alla stessa notizia
 * che differiscono solo per `?utm_source=...` non devono generare due righe.
 * Se l'URL non è parsabile (raro, feed malformato), ritorna l'input invariato.
 */
export function normalizeUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return rawUrl.trim()
  }

  const toDelete: string[] = []
  url.searchParams.forEach((_value, key) => {
    if (TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))) {
      toDelete.push(key)
    }
  })
  toDelete.forEach((key) => url.searchParams.delete(key))

  // Niente "/" finale ridondante (oltre la root) e niente fragment, che non
  // identificano contenuto diverso ai fini della dedup.
  url.hash = ''
  let normalized = url.toString()
  if (normalized.endsWith('/') && url.pathname !== '/') {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}
