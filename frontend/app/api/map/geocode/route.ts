import { NextResponse, type NextRequest } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { getCached, setCached } from '@/lib/redis'
import { buildGazetteerIndex, matchTextAgainstIndex } from '@/lib/geo-tagging/gazetteer'
import type { RegionRow } from '@/lib/geo-tagging/types'

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 giorni: la geografia non cambia
const USER_AGENT = process.env.RSS_USER_AGENT ?? 'NanoCropNews/1.0 (+https://lonelyfrank-nano-crop-news.vercel.app)'

interface GeocodeResult {
  regionId: number | null
  displayName: string | null
}

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  county?: string
  state?: string
  country?: string
}

export async function GET(request: NextRequest) {
  const latParam = request.nextUrl.searchParams.get('lat')
  const lngParam = request.nextUrl.searchParams.get('lng')
  const lat = Number(latParam)
  const lng = Number(lngParam)

  if (!latParam || !lngParam || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'Parametri "lat"/"lng" mancanti o non validi' }, { status: 400 })
  }

  // Coordinate arrotondate a 2 decimali (~1km): aumenta l'hit-rate della
  // cache senza una perdita di precisione rilevante per un click sulla mappa.
  const roundedLat = Math.round(lat * 100) / 100
  const roundedLng = Math.round(lng * 100) / 100
  const cacheKey = `nano-crop:map:geocode:${roundedLat},${roundedLng}`

  const cached = await getCached<GeocodeResult>(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  let address: NominatimAddress
  let displayName: string | null
  try {
    const nominatimUrl = new URL('https://nominatim.openstreetmap.org/reverse')
    nominatimUrl.searchParams.set('format', 'jsonv2')
    nominatimUrl.searchParams.set('lat', String(roundedLat))
    nominatimUrl.searchParams.set('lon', String(roundedLng))
    nominatimUrl.searchParams.set('accept-language', 'it')
    nominatimUrl.searchParams.set('zoom', '10')

    const response = await fetch(nominatimUrl, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const body = await response.json()
    address = (body.address ?? {}) as NominatimAddress
    displayName = typeof body.display_name === 'string' ? body.display_name : null
  } catch (error) {
    return NextResponse.json({ error: `Reverse geocoding fallito: ${(error as Error).message}` }, { status: 502 })
  }

  const supabase = createPublicClient()
  const { data: regions, error: regionsError } = await supabase.from('regions').select('id, name, level')
  if (regionsError || !regions) {
    return NextResponse.json({ error: regionsError?.message ?? 'Impossibile leggere le regioni' }, { status: 500 })
  }

  const gazetteerIndex = buildGazetteerIndex(regions as RegionRow[])

  // Dal più specifico al meno specifico: il primo che matcha vince.
  const candidates = [address.city ?? address.town ?? address.village, address.county, address.state, address.country]

  let regionId: number | null = null
  for (const candidate of candidates) {
    if (!candidate) continue
    const matches = matchTextAgainstIndex(candidate, gazetteerIndex, 'gazetteer_match', 1)
    if (matches.length > 0) {
      regionId = matches[0].regionId
      break
    }
  }

  const result: GeocodeResult = { regionId, displayName }
  await setCached(cacheKey, result, CACHE_TTL_SECONDS)

  return NextResponse.json(result)
}
