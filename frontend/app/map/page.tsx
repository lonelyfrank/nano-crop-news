'use client'

import dynamic from 'next/dynamic'

// Leaflet richiede `window`: niente SSR per questo componente (pattern
// standard react-leaflet + Next.js App Router).
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <p style={{ padding: '1.5rem' }}>Caricamento mappa…</p>,
})

export default function MapPage() {
  return <MapView />
}
