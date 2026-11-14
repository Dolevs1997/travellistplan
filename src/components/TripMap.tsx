import { useEffect, useRef, useState } from 'react'
import { AttributionControl, LngLatBounds, Map as MLMap, Marker, type GeoJSONSource } from 'maplibre-gl'
import type { Day, Trip } from '../data/types'
import { freeSlot, isPastDay, stopStatus } from '../data/helpers'
import { prefersReducedMotion } from '../router'
import { STYLE_URL } from '../maplibreSetup'

const C = {
  mapBg: '#11151C',
  water: '#0E2633',
  park: '#13261F',
  building: '#161B23',
  accent: '#2EE6C5',
  accent2: '#FF9F43',
}

const PLUS_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'

/** Bring the base style in line with the app's color tokens. */
function recolor(map: MLMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id.toLowerCase()
    try {
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', C.mapBg)
      else if (layer.type === 'fill') {
        if (id.includes('water')) map.setPaintProperty(layer.id, 'fill-color', C.water)
        else if (/park|wood|grass|forest|landcover|nature|cemetery/.test(id)) map.setPaintProperty(layer.id, 'fill-color', C.park)
        else if (id.includes('building')) map.setPaintProperty(layer.id, 'fill-color', C.building)
      } else if (layer.type === 'line' && id.includes('water')) map.setPaintProperty(layer.id, 'line-color', C.water)
    } catch {
      /* some layers use expressions we don't need to override */
    }
  }
}

const emptyFC = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] })

function addOverlayLayers(map: MLMap) {
  map.addSource('route', { type: 'geojson', data: emptyFC() })
  map.addSource('detour', { type: 'geojson', data: emptyFC() })
  map.addLayer({
    id: 'detour-line',
    type: 'line',
    source: 'detour',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': C.accent2, 'line-width': 3, 'line-dasharray': [0.1, 2.2], 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'route-glow',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': C.accent, 'line-width': 16, 'line-opacity': 0.22, 'line-blur': 2 },
  })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': C.accent, 'line-width': 4 },
  })
}

interface Props {
  trip: Trip
  day: Day
  selectedStopId: string | null
  onSelectStop: (id: string | null) => void
  onSuggestion: (id: string) => void
  /** Height of whatever covers the bottom of the map (the sheet) */
  bottomPadding: number
  /** Increment to re-center on the traveller */
  recenterKey: number
}

export default function TripMap({ trip, day, selectedStopId, onSelectStop, onSuggestion, bottomPadding, recenterKey }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markers = useRef<Marker[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Keep latest callbacks without re-creating markers on every render
  const cb = useRef({ onSelectStop, onSuggestion })
  cb.current = { onSelectStop, onSuggestion }

  const padding = () => ({ top: 96, bottom: bottomPadding + 32, left: 48, right: 48 })
  const duration = () => (prefersReducedMotion() ? 0 : 250)

  // Create the map once
  useEffect(() => {
    if (!container.current) return
    let map: MLMap
    try {
      map = new MLMap({
        container: container.current,
        style: STYLE_URL,
        // Start on the trip's destination; never on a city the user hasn't chosen
        center: trip.destination ? [trip.destination.lng, trip.destination.lat] : [12, 28],
        zoom: trip.destination?.zoom ?? 1.2,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      })
    } catch {
      setFailed(true)
      return
    }
    map.touchZoomRotate.disableRotation()
    map.addControl(new AttributionControl({ compact: true }), 'top-left')
    map.on('load', () => {
      recolor(map)
      addOverlayLayers(map)
      setReady(true)
    })
    map.on('click', (e) => {
      const target = e.originalEvent.target as HTMLElement | null
      if (!target?.closest('.pin')) cb.current.onSelectStop(null)
    })
    mapRef.current = map
    return () => {
      markers.current.forEach((m) => m.remove())
      markers.current = []
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  const showSuggestions = !isPastDay(trip, day.id) && freeSlot(day) !== null

  // Route + detour lines
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const coords = day.stops.map((s) => [s.lng, s.lat])
    ;(map.getSource('route') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [],
    })
    const anchorStop =
      day.id === trip.progress?.dayId ? day.stops.find((s) => s.id === trip.progress?.stopId) : day.stops[day.stops.length - 1]
    ;(map.getSource('detour') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features:
        anchorStop && showSuggestions
          ? day.suggestions.map((g) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: [[anchorStop.lng, anchorStop.lat], [g.lng, g.lat]] },
            }))
          : [],
    })
  }, [ready, day, trip.progress, showSuggestions])

  // Pins
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.forEach((m) => m.remove())
    markers.current = []

    day.stops.forEach((s, i) => {
      const status = stopStatus(trip, day.id, s.id)
      const wrap = document.createElement('div')
      wrap.className = 'pin-wrap'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `pin pin--${status}${s.id === selectedStopId ? ' pin--selected' : ''}`
      btn.textContent = String(i + 1)
      const statusText = status === 'done' ? 'הושלם' : status === 'current' ? 'אתם כאן' : 'בהמשך'
      btn.setAttribute('aria-label', `${i + 1}. ${s.name} – ${statusText}`)
      btn.setAttribute('aria-pressed', String(s.id === selectedStopId))
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        cb.current.onSelectStop(s.id)
      })
      wrap.appendChild(btn)
      if (status === 'current') {
        const label = document.createElement('span')
        label.className = 'pin-label'
        label.textContent = 'אתם כאן'
        label.setAttribute('aria-hidden', 'true')
        wrap.appendChild(label)
      }
      markers.current.push(new Marker({ element: wrap, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map))
    })

    if (showSuggestions) {
      day.suggestions.forEach((g) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'pin pin--suggestion'
        btn.innerHTML = PLUS_SVG
        btn.setAttribute('aria-label', `הצעה: ${g.name}`)
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          cb.current.onSuggestion(g.id)
        })
        // MapLibre positions the marker element with `transform`, so the animated pin goes inside a wrapper
        const wrap = document.createElement('div')
        wrap.className = 'pin-wrap'
        wrap.appendChild(btn)
        markers.current.push(new Marker({ element: wrap, anchor: 'center' }).setLngLat([g.lng, g.lat]).addTo(map))
      })
    }
  }, [ready, day, trip, selectedStopId, showSuggestions])

  const fitDay = () => {
    const map = mapRef.current
    if (!map) return
    const pts = [...day.stops, ...(showSuggestions ? day.suggestions : [])].map((p) => [p.lng, p.lat] as [number, number])
    if (pts.length === 0) {
      // Nothing planned yet: show the destination itself
      if (trip.destination)
        map.easeTo({ center: [trip.destination.lng, trip.destination.lat], zoom: trip.destination.zoom, padding: padding(), duration: duration() })
      return
    }
    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: 14.5, padding: padding(), duration: duration() })
      return
    }
    const bounds = pts.reduce((b, p) => b.extend(p), new LngLatBounds(pts[0], pts[0]))
    map.fitBounds(bounds, { padding: padding(), maxZoom: 15.5, duration: duration() })
  }

  // Re-fit when the day (or the covered area) changes
  useEffect(() => {
    if (ready) fitDay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, day.id, bottomPadding])

  // Follow the selected stop
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !selectedStopId) return
    const s = day.stops.find((x) => x.id === selectedStopId)
    if (s) map.easeTo({ center: [s.lng, s.lat], padding: padding(), duration: duration() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedStopId])

  // "My location" → the traveller's current stop
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || recenterKey === 0) return
    const s = day.id === trip.progress?.dayId ? day.stops.find((x) => x.id === trip.progress?.stopId) : undefined
    if (s) map.easeTo({ center: [s.lng, s.lat], zoom: 15.5, padding: padding(), duration: duration() })
    else fitDay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey])

  return (
    <div className="absolute inset-0 bg-map-bg">
      <div ref={container} className="h-full w-full" role="region" aria-label={`מפת ${day.title}`} />
      {failed && (
        <p className="absolute inset-x-6 top-1/3 text-center text-sm text-muted">
          לא הצלחנו לטעון את המפה במכשיר הזה. הלו״ז זמין בחלונית למטה.
        </p>
      )}
    </div>
  )
}
