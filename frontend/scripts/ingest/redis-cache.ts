import { getCached, setCached } from '@/lib/redis'

const CACHE_PREFIX = 'nano-crop:feed-cache:'

/**
 * Cache del contenuto grezzo di un feed RSS, chiave = URL del feed.
 */
export async function getCachedFeed(feedUrl: string): Promise<string | null> {
  return getCached<string>(CACHE_PREFIX + feedUrl)
}

export async function setCachedFeed(feedUrl: string, body: string, ttlSeconds: number): Promise<void> {
  return setCached(CACHE_PREFIX + feedUrl, body, ttlSeconds)
}
