import { NextResponse, type NextRequest } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { getCached, setCached } from '@/lib/redis'

const CACHE_TTL_SECONDS = 5 * 60

export async function GET(request: NextRequest) {
  const regionId = request.nextUrl.searchParams.get('region')
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')

  if (!regionId || Number.isNaN(Number(regionId))) {
    return NextResponse.json({ error: 'Parametro "region" mancante o non valido' }, { status: 400 })
  }

  const cacheKey = `nano-crop:map:news:${regionId}:${from ?? 'all'}:${to ?? 'all'}`
  const cached = await getCached<{ article: unknown }[]>(cacheKey)
  if (cached) {
    return NextResponse.json(cached.map((row) => row.article))
  }

  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('get_articles_for_region', {
    p_region_id: Number(regionId),
    p_limit: 30,
    p_from: from,
    p_to: to,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await setCached(cacheKey, data, CACHE_TTL_SECONDS)

  return NextResponse.json((data as { article: unknown }[]).map((row) => row.article))
}
