import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

const redis = url && token ? new Redis({ url, token }) : null

if (!redis) {
  console.warn(
    '[redis-cache] UPSTASH_REDIS_REST_URL/TOKEN non impostate: cache dei feed disattivata (non bloccante).',
  )
}

const CACHE_PREFIX = 'nano-crop:feed-cache:'

/**
 * Cache del contenuto grezzo di un feed RSS, chiave = URL del feed. Se
 * Upstash non è configurato, si comporta da no-op (l'ingestion funziona
 * comunque, semplicemente senza cache).
 */
export async function getCachedFeed(feedUrl: string): Promise<string | null> {
  if (!redis) return null
  try {
    return await redis.get<string>(CACHE_PREFIX + feedUrl)
  } catch (error) {
    console.warn(`[redis-cache] lettura fallita per ${feedUrl}: ${(error as Error).message}`)
    return null
  }
}

export async function setCachedFeed(feedUrl: string, body: string, ttlSeconds: number): Promise<void> {
  if (!redis) return
  try {
    await redis.set(CACHE_PREFIX + feedUrl, body, { ex: ttlSeconds })
  } catch (error) {
    console.warn(`[redis-cache] scrittura fallita per ${feedUrl}: ${(error as Error).message}`)
  }
}
