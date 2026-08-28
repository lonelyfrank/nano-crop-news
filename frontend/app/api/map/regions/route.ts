import { NextResponse, type NextRequest } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { getCached, setCached } from '@/lib/redis'

const CACHE_TTL_SECONDS = 5 * 60 // i conteggi cambiano solo ogni 20 min (cadenza dell'ingestion)

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')

  // from/to nella chiave di cache: altrimenti richieste con range diversi
  // (feed "sempre" vs "ultime 24h") si sovrascriverebbero a vicenda.
  const cacheKey = `nano-crop:map:region-counts:${from ?? 'all'}:${to ?? 'all'}`

  const cached = await getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('get_region_article_counts', { p_from: from, p_to: to })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await setCached(cacheKey, data, CACHE_TTL_SECONDS)

  return NextResponse.json(data)
}
