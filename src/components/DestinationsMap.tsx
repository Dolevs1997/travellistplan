import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MLMap, Marker } from 'maplibre-gl'
import { Minus, Plus } from 'lucide-react'
import { prefersReducedMotion } from '../router'
import type { Trip } from '../data/types'
import { STYLE_URL } from '../maplibreSetup'

interface Place {
  name: string
  lat: number
  lng: number
}

/** The trip's destination cities in visiting order, each placed at the middle of its stops. */
export function tripDestinations(trip: Trip): Place[] {
  const byCity = new Map<string, { lat: number; lng: number; n: number }>()
  for (const day of trip.days) {
    for (const s of day.stops) {
      const c = byCity.get(day.city) ?? { lat: 0, lng: 0, n: 0 }
      byCity.set(day.city, { lat: c.lat + s.lat, lng: c.lng + s.lng, n: c.n + 1 })
    }
  }
  const places = [...byCity].map(([name, c]) => ({ name, lat: c.lat / c.n, lng: c.lng / c.n }))
  if (places.length === 0 && trip.destination) {
    const d = trip.destination
    return [{ name: d.name, lat: d.lat, lng: d.lng }]
  }
  return places
}

const PIN_SVG =
  '<svg width="22" height="28" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 37C15 37 28 23.5 28 14A13 13 0 0 0 2 14C2 23.5 15 37 15 37Z" fill="#2EE6C5" stroke="#0B0E13" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#06201B"/></svg>'

/** Pins closer than this on screen are shown as one pin carrying all their names. */
const MERGE_PX = 30

/** Greedy screen-space grouping of nearby places. */
function group(map: MLMap, places: Place[]) {
  const groups: { places: Place[]; x: number; y: number }[] = []
  for (const p of places) {
    const pt = map.project([p.lng, p.lat])
    const g = groups.find((gr) => Math.hypot(gr.x - pt.x, gr.y - pt.y) < MERGE_PX)
    if (g) g.places.push(p)
    else groups.push({ places: [p], x: pt.x, y: pt.y })
  }
  return groups.map((g) => ({
    names: g.places.map((p) => p.name),
    lng: g.places.reduce((n, p) => n + p.lng, 0) / g.places.length,
    lat: g.places.reduce((n, p) => n + p.lat, 0) / g.places.length,
  }))
}

/**
 * World map for the Home trip card: drag with a finger to pan, pinch to zoom.
 * One pin per destination city; pins that would overlap merge into one.
 */
export default function DestinationsMap({ trip }: { trip: Trip }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [zoom, setZoom] = useState({ atMin: true, atMax: false })
  const places = useMemo(() => tripDestinations(trip), [trip])
  const key = places.map((p) => `${p.name}:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|')

  useEffect(() => {
    const el = ref.current
    if (!el || places.length === 0) return
    // Fully zoomed out. Below zoom 0 MapLibre stops drawing the wrapped world copies and leaves
    // empty bands, so stay at 0: most of the world shows, and dragging wraps around seamlessly.
    const worldZoom = 0
    const centerLng = places.reduce((n, p) => n + p.lng, 0) / places.length
    const centerLat = places.reduce((n, p) => n + p.lat, 0) / places.length

    let map: MLMap
    try {
      map = new MLMap({
        container: el,
        style: STYLE_URL,
        center: [centerLng, Math.max(-50, Math.min(60, centerLat))],
        zoom: worldZoom,
        minZoom: worldZoom,
        maxZoom: 12,
        attributionControl: { compact: true },
        // Drag, pinch and mouse-wheel zoom; no rotation or tilt
        dragRotate: false,
        pitchWithRotate: false,
        scrollZoom: true,
        keyboard: false,
        renderWorldCopies: true,
      })
    } catch {
      return
    }
    map.touchZoomRotate.disableRotation()

    // Keep the credits collapsed to the ⓘ button so they don't cover the pins
    map.once('load', () => {
      el.querySelectorAll('.maplibregl-compact-show').forEach((n) => n.classList.remove('maplibregl-compact-show'))
    })

    map.once('style.load', () => {
      for (const layer of map.getStyle().layers ?? []) {
        const id = layer.id.toLowerCase()
        try {
          // Keep continent and country names for context; our pins carry the city names
          if (layer.type === 'symbol') {
            if (id.startsWith('place_country') || id.startsWith('place_continent')) map.setPaintProperty(layer.id, 'text-color', '#8C97A8')
            else map.setLayoutProperty(layer.id, 'visibility', 'none')
          } else if (layer.type === 'line' && id.startsWith('boundary_country')) {
            map.setPaintProperty(layer.id, 'line-color', '#4A5568')
          } else if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#11151C')
          else if (layer.type === 'fill' && id.includes('water')) map.setPaintProperty(layer.id, 'fill-color', '#0E2633')
          else if (layer.type === 'fill' && /park|wood|grass|forest|landcover/.test(id)) map.setPaintProperty(layer.id, 'fill-color', '#13261F')
        } catch {
          /* ignore */
        }
      }
      if (places.length > 1) {
        map.addSource('trip-line', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: places.map((p) => [p.lng, p.lat]) } },
        })
        map.addLayer({
          id: 'trip-line',
          type: 'line',
          source: 'trip-line',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#2EE6C5', 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [1, 2] },
        })
      }
    })

    // Pins: rebuilt after each zoom so nearby cities merge or split as needed
    let markers: Marker[] = []
    const drawPins = () => {
      markers.forEach((m) => m.remove())
      markers = group(map, places).map((g) => {
        const pin = document.createElement('div')
        pin.className = 'dest-pin'
        pin.innerHTML = PIN_SVG
        const label = document.createElement('span')
        label.className = 'dest-pin__label'
        label.textContent = g.names.join(' · ')
        pin.appendChild(label)
        return new Marker({ element: pin, anchor: 'bottom' }).setLngLat([g.lng, g.lat]).addTo(map)
      })
    }
    drawPins()
    const syncZoom = () => setZoom({ atMin: map.getZoom() <= map.getMinZoom() + 0.01, atMax: map.getZoom() >= map.getMaxZoom() - 0.01 })
    map.on('zoomend', () => {
      drawPins()
      syncZoom()
    })
    mapRef.current = map
    syncZoom()

    return () => {
      markers.forEach((m) => m.remove())
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const label = places.length ? `מפת העולם עם היעדים: ${places.map((p) => p.name).join(', ')}. אפשר לגרור ולהגדיל.` : 'מפת הטיול'
  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: map.getZoom() + delta, duration: prefersReducedMotion() ? 0 : 250 })
  }
  const btn =
    'flex size-11 items-center justify-center bg-surface/92 text-text transition-colors duration-200 ease-out hover:bg-raised disabled:text-muted/50'

  return (
    <div className="relative h-[168px] w-full touch-none bg-map-bg" role="region" aria-label={label}>
      {/* maplibre-gl.css forces position:relative on the container, so size it explicitly */}
      <div ref={ref} className="h-full w-full" />
      {places.length > 0 && (
        <div className="absolute top-3 left-3 z-10 flex flex-col overflow-hidden rounded-tile border border-border shadow-[0_6px_16px_rgba(0,0,0,0.4)]">
          <button type="button" aria-label="הגדלת המפה" disabled={zoom.atMax} onClick={() => zoomBy(1)} className={`${btn} border-b border-border`}>
            <Plus size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label="הקטנת המפה" disabled={zoom.atMin} onClick={() => zoomBy(-1)} className={btn}>
            <Minus size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
