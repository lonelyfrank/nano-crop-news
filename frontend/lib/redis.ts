import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

const redis = url && token ? new Redis({ url, token }) : null

if (!redis) {
  console.warn('[redis] UPSTASH_REDIS_REST_URL/TOKEN non impostate: cache disattivata (non bloccante).')
}

/**
 * Cache generica get/set con TTL, usata sia dallo script di ingestion
 * (feed RSS grezzi) sia dai Route Handler della mappa (conteggi regioni,
 * risultati Nominatim). Se Upstash non è configurato si comporta da no-op:
 * il chiamante deve sempre gestire un cache-miss come se fosse la prima
 * richiesta, mai come un errore.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null
  try {
    return await redis.get<T>(key)
  } catch (error) {
    console.warn(`[redis] lettura fallita per ${key}: ${(error as Error).message}`)
    return null
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (!redis) return
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch (error) {
    console.warn(`[redis] scrittura fallita per ${key}: ${(error as Error).message}`)
  }
}
