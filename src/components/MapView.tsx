import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MATI_CENTER } from '../lib/constants'
import { isLowData } from '../lib/offline'
import { cn } from './UI'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  label: string
  kind?: 'driver' | 'pickup' | 'dropoff' | 'sos'
}

const MARKER_COLOR: Record<NonNullable<MapMarker['kind']>, string> = {
  driver: '#0e7490',
  pickup: '#0891b2',
  dropoff: '#65a30d',
  sos: '#e11d48',
}

interface MapViewProps {
  markers: MapMarker[]
  center?: { lat: number; lng: number }
  zoom?: number
  className?: string
  /** When true (passenger side), low-data mode replaces the map with a text list. */
  respectLowData?: boolean
}

export function MapView({
  markers,
  center,
  zoom = 14,
  className,
  respectLowData = false,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const lowData = respectLowData && isLowData()

  useEffect(() => {
    if (lowData || !containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [center?.lat ?? MATI_CENTER.lat, center?.lng ?? MATI_CENTER.lng],
      zoom,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowData])

  useEffect(() => {
    if (lowData || !mapRef.current || !layerRef.current) return
    const layer = layerRef.current
    layer.clearLayers()

    for (const marker of markers) {
      const circle = L.circleMarker([marker.lat, marker.lng], {
        radius: marker.kind === 'sos' ? 12 : 9,
        color: '#ffffff',
        weight: 2,
        fillColor: MARKER_COLOR[marker.kind ?? 'driver'],
        fillOpacity: 0.95,
      })
      circle.bindPopup(marker.label)
      circle.addTo(layer)
    }

    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]))
      mapRef.current.fitBounds(bounds.pad(0.3), { maxZoom: 15 })
    } else if (markers.length === 1) {
      mapRef.current.setView([markers[0].lat, markers[0].lng], zoom)
    }
  }, [markers, zoom, lowData])

  if (lowData) {
    return (
      <div className={cn('rounded-2xl border border-slate-200 bg-white p-3', className)}>
        <p className="text-xs font-semibold text-slate-500 uppercase">Low data mode</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {markers.length === 0 && <li>No points to show.</li>}
          {markers.map((m) => (
            <li key={m.id}>
              {m.label} — {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('z-0 h-64 w-full rounded-2xl border border-slate-200', className)}
      role="img"
      aria-label={`Map with ${markers.length} point${markers.length === 1 ? '' : 's'}`}
    />
  )
}
