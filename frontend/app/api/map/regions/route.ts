import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { getCached, setCached } from '@/lib/redis'

const CACHE_KEY = 'nano-crop:map:region-counts'
const CACHE_TTL_SECONDS = 5 * 60 // i conteggi cambiano solo ogni 20 min (cadenza dell'ingestion)

export async function GET() {
  const cached = await getCached(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached)
  }

  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('get_region_article_counts')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await setCached(CACHE_KEY, data, CACHE_TTL_SECONDS)

  return NextResponse.json(data)
}
