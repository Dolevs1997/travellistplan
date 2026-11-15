import { useEffect, useRef } from 'react'
import { Map as MLMap, Marker } from 'maplibre-gl'
import type { StopStatus } from '../data/types'
import { applyMapTheme, currentStyleUrl } from '../maplibreSetup'
import { useTheme } from '../theme'

/** Small, non-interactive map focused on one place. */
export default function PlaceMap({ lat, lng, n, status }: { lat: number; lng: number; n: number; status: StopStatus }) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()

  useEffect(() => {
    if (!ref.current) return
    let map: MLMap
    try {
      map = new MLMap({
        container: ref.current,
        style: currentStyleUrl(),
        center: [lng, lat],
        zoom: 15,
        interactive: false,
        attributionControl: { compact: true },
      })
    } catch {
      return
    }
    map.on('load', () => applyMapTheme(map))
    const el = document.createElement('div')
    el.className = `pin pin--${status} pin--selected`
    el.textContent = String(n)
    el.setAttribute('aria-hidden', 'true')
    const wrap = document.createElement('div')
    wrap.className = 'pin-wrap'
    wrap.appendChild(el)
    new Marker({ element: wrap }).setLngLat([lng, lat]).addTo(map)
    return () => map.remove()
  }, [lat, lng, n, status, theme])

  // maplibre-gl.css forces position:relative on the container, so size it explicitly
  return <div ref={ref} className="h-full w-full bg-map-bg" aria-hidden="true" />
}
