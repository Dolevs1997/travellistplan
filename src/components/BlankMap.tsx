import { useEffect, useRef } from 'react'
import { Map as MLMap } from 'maplibre-gl'
import { STYLE_URL } from '../maplibreSetup'

/**
 * Zoomed-out world map with every label hidden, for a trip that has no
 * destination yet: no city is named or centred until the user picks one.
 */
export default function BlankMap() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    let map: MLMap
    try {
      map = new MLMap({
        container: ref.current,
        style: STYLE_URL,
        center: [12, 28],
        zoom: 1.2,
        interactive: false,
        attributionControl: { compact: true },
      })
    } catch {
      return
    }
    map.once('style.load', () => {
      for (const layer of map.getStyle().layers ?? []) {
        try {
          if (layer.type === 'symbol') map.setLayoutProperty(layer.id, 'visibility', 'none')
          else if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#11151C')
          else if (layer.type === 'fill' && layer.id.toLowerCase().includes('water')) map.setPaintProperty(layer.id, 'fill-color', '#0E2633')
        } catch {
          /* ignore layers we can't restyle */
        }
      }
    })
    return () => map.remove()
  }, [])

  // maplibre-gl.css forces position:relative on the container, so size it explicitly
  return <div ref={ref} className="h-full w-full bg-map-bg" aria-hidden="true" />
}
