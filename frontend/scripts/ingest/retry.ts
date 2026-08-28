/**
 * Riprova una funzione asincrona con backoff esponenziale (1s, 2s, 4s, ...).
 * Usato per il fetch dei feed: un errore di rete transitorio su una fonte
 * non deve farla fallire al primo colpo.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt)
      }
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
