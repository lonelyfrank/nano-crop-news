'use client'

import { useCallback, useEffect, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import ArticleCard from './ArticleCard'
import type { Article } from '@/types'
import styles from './MapView.module.css'

interface RegionCount {
  id: number
  name: string
  level: string
  lat: number
  lng: number
  article_count: number
}

interface Selection {
  label: string
  articles: Article[] | null // null = in caricamento
}

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export default function MapView() {
  const [regions, setRegions] = useState<RegionCount[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  // Inizializzato durante il render (non in un effetto): questo componente
  // viene caricato solo lato client (next/dynamic con ssr:false), quindi
  // `window` è sempre disponibile qui.
  const [isDark, setIsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    fetch('/api/map/regions')
      .then((res) => res.json())
      .then(setRegions)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => setIsDark(event.matches)
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [])

  const selectRegion = useCallback(async (region: RegionCount) => {
    setSelection({ label: region.name, articles: null })
    const articles = await fetch(`/api/map/news?region=${region.id}`).then((res) => res.json())
    setSelection({ label: region.name, articles })
  }, [])

  const selectFreeArea = useCallback(async (lat: number, lng: number) => {
    setSelection({ label: 'Ricerca in corso…', articles: null })
    const geo = await fetch(`/api/map/geocode?lat=${lat}&lng=${lng}`).then((res) => res.json())

    if (!geo.regionId) {
      setSelection({ label: geo.displayName ?? 'Zona sconosciuta', articles: [] })
      return
    }

    const articles = await fetch(`/api/map/news?region=${geo.regionId}`).then((res) => res.json())
    setSelection({ label: geo.displayName ?? 'Zona', articles })
  }, [])

  return (
    <div className={styles.layout}>
      <div className={styles.mapWrapper}>
        <MapContainer center={[41.9, 12.5]} zoom={4} className={styles.map} worldCopyJump>
          <TileLayer url={isDark ? DARK_TILES : LIGHT_TILES} attribution={ATTRIBUTION} />
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
              pathOptions={{ color: '#1d4ed8', fillColor: '#1d4ed8', fillOpacity: 0.5, weight: 1 }}
              eventHandlers={{ click: () => selectRegion(region) }}
            />
          ))}
          <FreeAreaClickHandler onSelect={selectFreeArea} />
        </MapContainer>
      </div>

      <aside className={styles.panel}>
        {!selection && <p className={styles.hint}>Clicca un punto sulla mappa per vedere le notizie locali.</p>}
        {selection && (
          <>
            <h2 className={styles.panelTitle}>{selection.label}</h2>
            {selection.articles === null && <p className={styles.hint}>Caricamento…</p>}
            {selection.articles?.length === 0 && (
              <p className={styles.hint}>Nessuna notizia locale per quest&apos;area.</p>
            )}
            {selection.articles?.map((article) => <ArticleCard key={article.id} article={article} />)}
          </>
        )}
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
