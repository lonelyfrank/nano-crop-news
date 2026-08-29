'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AttributionControl,
  CircleMarker,
  MapContainer,
  TileLayer,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import ArticleCard from './ArticleCard'
import TimeRangeFilter, { rangeForPreset } from './TimeRangeFilter'
import type { Article } from '@/types'
import styles from './MapView.module.css'

interface RegionCount {
  id: number
  name: string
  level: string
  parent_id: number | null
  lat: number
  lng: number
  article_count: number
}

interface Selection {
  id: number | null // null = click su un'area senza un region_id noto (geocode non risolto)
  label: string
  articles: Article[] | null // null = in caricamento
}

// server.arcgisonline.com invece di CartoDB (che oggi richiede una API key
// e mostra un watermark "API KEY REQUIRED" in produzione) o di
// tile.openstreetmap.org (la usage policy blocca richieste senza referer
// valido). Attenzione all'ordine {z}/{y}/{x}, diverso da {z}/{x}/{y}.
const LIGHT_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const DARK_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors'

const ACCENT = { light: '#1d4ed8', dark: '#60a5fa' }
const OUTLINE = { light: '#1a1a1a', dark: '#f2f2f2' }

function pathOptionsFor(isDark: boolean, isSelected: boolean, isHovered: boolean) {
  const accent = isDark ? ACCENT.dark : ACCENT.light
  if (isHovered) return { color: isDark ? OUTLINE.dark : OUTLINE.light, fillColor: accent, fillOpacity: 0.85, weight: 4 }
  if (isSelected) return { color: isDark ? OUTLINE.dark : OUTLINE.light, fillColor: accent, fillOpacity: 0.8, weight: 3 }
  return { color: accent, fillColor: accent, fillOpacity: 0.42, weight: 1 }
}

// Risale parent_id nell'elenco già caricato (solo regioni con almeno un
// articolo nell'intervallo scelto). Se un antenato non è nell'elenco — es.
// "Italia" è esclusa apposta dalla RPC, i macro_region non sono mai
// inclusi — quell'anello sparisce dal breadcrumb invece di rompersi.
function buildBreadcrumb(regionId: number | null, regions: RegionCount[], fallbackLabel: string): string[] {
  const byId = new Map(regions.map((r) => [r.id, r]))
  let current = regionId != null ? byId.get(regionId) : undefined
  if (!current) return ['Mondo', fallbackLabel]

  const chain: string[] = []
  while (current) {
    chain.unshift(current.name)
    current = current.parent_id != null ? byId.get(current.parent_id) : undefined
  }
  return ['Mondo', ...chain]
}

export default function MapView() {
  const searchParams = useSearchParams()
  const [regions, setRegions] = useState<RegionCount[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [timeRangeKey, setTimeRangeKey] = useState('all')
  const [hoveredRegionId, setHoveredRegionId] = useState<number | null>(null)
  const [showAllChips, setShowAllChips] = useState(false)
  const [zoneQuery, setZoneQuery] = useState('')
  // Inizializzato durante il render (non in un effetto): questo componente
  // viene caricato solo lato client (next/dynamic con ssr:false), quindi
  // `window` è sempre disponibile qui. Una scelta esplicita nel menu
  // "Aspetto" (data-theme sul <html>) vince su prefers-color-scheme.
  const [isDark, setIsDark] = useState(() => {
    const explicitTheme = document.documentElement.getAttribute('data-theme')
    if (explicitTheme === 'dark') return true
    if (explicitTheme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const selectRegion = useCallback(
    async (region: { id: number; name: string }) => {
      setZoneQuery('')
      setSelection({ id: region.id, label: region.name, articles: null })

      const { from, to } = rangeForPreset(timeRangeKey)
      const params = new URLSearchParams({ region: String(region.id) })
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const articles = await fetch(`/api/map/news?${params.toString()}`).then((res) => res.json())
      setSelection({ id: region.id, label: region.name, articles })
    },
    [timeRangeKey],
  )

  useEffect(() => {
    const { from, to } = rangeForPreset(timeRangeKey)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)

    fetch(`/api/map/regions?${params.toString()}`)
      .then((res) => res.json())
      .then((data: RegionCount[]) => {
        setRegions(data)

        // Se si arriva da /trends con una zona già scelta, selezionala
        // subito invece di lasciare la mappa vuota in attesa di un click.
        const preselectedId = searchParams.get('region')
        if (preselectedId) {
          const match = data.find((r) => String(r.id) === preselectedId)
          if (match) selectRegion(match)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRangeKey])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => setIsDark(event.matches)
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [])

  // Il valore iniziale di isDark tiene già conto di data-theme (sopra);
  // qui si osservano solo i cambi successivi, mentre si è già su /map
  // (l'utente apre il menu "Aspetto" e cambia tema senza ricaricare).
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      const explicitTheme = root.getAttribute('data-theme')
      if (explicitTheme === 'dark') setIsDark(true)
      else if (explicitTheme === 'light') setIsDark(false)
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const selectFreeArea = useCallback(
    async (lat: number, lng: number) => {
      setSelection({ id: null, label: 'Ricerca in corso…', articles: null })
      const geo = await fetch(`/api/map/geocode?lat=${lat}&lng=${lng}`).then((res) => res.json())

      if (!geo.regionId) {
        setSelection({ id: null, label: geo.displayName ?? 'Zona sconosciuta', articles: [] })
        return
      }

      const { from, to } = rangeForPreset(timeRangeKey)
      const params = new URLSearchParams({ region: String(geo.regionId) })
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const articles = await fetch(`/api/map/news?${params.toString()}`).then((res) => res.json())
      setSelection({ id: geo.regionId, label: geo.displayName ?? 'Zona', articles })
    },
    [timeRangeKey],
  )

  const breadcrumb = useMemo(
    () => (selection ? buildBreadcrumb(selection.id, regions, selection.label) : []),
    [selection, regions],
  )

  const sourceCount = useMemo(() => {
    if (!selection?.articles?.length) return null
    return new Set(selection.articles.map((a) => a.source.id)).size
  }, [selection])

  const chipRegions = showAllChips ? regions : regions.slice(0, 5)
  const zoneMatches = zoneQuery.trim()
    ? regions.filter((r) => r.name.toLowerCase().includes(zoneQuery.trim().toLowerCase())).slice(0, 8)
    : []

  return (
    <div className={styles.layout}>
      <div className={styles.mapWrapper}>
        <MapContainer
          center={[41.9, 12.5]}
          zoom={4}
          className={styles.map}
          worldCopyJump
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url={isDark ? DARK_TILES : LIGHT_TILES} attribution={ATTRIBUTION} />
          <ZoomControl position="bottomright" />
          <AttributionControl position="bottomright" prefix={false} />
          {regions.map((region) => (
            <CircleMarker
              key={`${region.level}-${region.id}`}
              center={[region.lat, region.lng]}
              radius={Math.min(30, 6 + Math.sqrt(region.article_count) * 3)}
              // bubblingMouseEvents=false: senza, il click su un marker
              // farebbe scattare ANCHE l'handler di click "area libera"
              // sulla mappa sottostante (i layer Path, a differenza dei
              // Marker, propagano il click di default in Leaflet).
              bubblingMouseEvents={false}
              pathOptions={pathOptionsFor(
                isDark,
                selection?.id === region.id,
                hoveredRegionId === region.id,
              )}
              eventHandlers={{ click: () => selectRegion(region) }}
            />
          ))}
          <FreeAreaClickHandler onSelect={selectFreeArea} />
        </MapContainer>

        <div className={styles.searchOverlay}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Cerca una zona…"
            value={zoneQuery}
            onChange={(e) => setZoneQuery(e.target.value)}
          />
          {zoneMatches.length > 0 && (
            <ul className={styles.searchResults}>
              {zoneMatches.map((region) => (
                <li key={region.id}>
                  <button type="button" onClick={() => selectRegion(region)}>
                    {region.name} <span>{region.article_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.legend}>
          <span className={styles.legendDot} style={{ width: 9, height: 9 }} />
          <span className={styles.legendDot} style={{ width: 20, height: 20 }} />
          <span>numero di articoli · clicca una zona o un punto qualsiasi</span>
        </div>
      </div>

      <aside className={styles.panel}>
        <div className={styles.panelSticky}>
          {regions.length > 0 && (
            <div className={styles.zoneChips}>
              {chipRegions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className={`${styles.chip} ${selection?.id === region.id ? styles.chipActive : ''}`}
                  onClick={() => selectRegion(region)}
                >
                  {region.name} <span className={styles.chipCount}>{region.article_count}</span>
                </button>
              ))}
              {!showAllChips && regions.length > 5 && (
                <button type="button" className={styles.chip} onClick={() => setShowAllChips(true)}>
                  Tutte →
                </button>
              )}
            </div>
          )}

          <div className={styles.zoneHeader}>
            {selection ? (
              <div className={styles.breadcrumb}>{breadcrumb.join(' › ')}</div>
            ) : (
              <div className={styles.breadcrumb}>Mondo</div>
            )}
            <div className={styles.titleRow}>
              <h1 className={styles.panelTitle}>{selection?.label ?? 'Mappa'}</h1>
              <TimeRangeFilter value={timeRangeKey} onChange={setTimeRangeKey} className={styles.timeRangeInline} />
            </div>
            {selection?.articles && selection.articles.length > 0 && (
              <p className={styles.counts}>
                {selection.articles.length} articoli
                {sourceCount ? ` da ${sourceCount} fonti` : ''}
              </p>
            )}
          </div>
        </div>

        <div className={styles.results}>
          {!selection && <p className={styles.hint}>Clicca un punto sulla mappa per vedere le notizie locali.</p>}
          {selection && (
            <>
              {selection.articles === null && <p className={styles.hint}>Caricamento…</p>}
              {selection.articles?.length === 0 && (
                <p className={styles.hint}>Nessuna notizia locale per quest&apos;area.</p>
              )}
              {selection.articles?.map((article) => (
                <div
                  key={article.id}
                  onMouseEnter={() => selection.id != null && setHoveredRegionId(selection.id)}
                  onMouseLeave={() => setHoveredRegionId(null)}
                >
                  <ArticleCard article={article} />
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function FreeAreaClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}
