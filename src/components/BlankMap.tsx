import { useEffect, useRef } from 'react'
import { Map as MLMap } from 'maplibre-gl'
import { applyMapTheme, currentStyleUrl } from '../maplibreSetup'
import { useTheme } from '../theme'

/**
 * Zoomed-out world map with every label hidden, for a trip that has no
 * destination yet: no city is named or centred until the user picks one.
 */
export default function BlankMap() {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()

  useEffect(() => {
    if (!ref.current) return
    let map: MLMap
    try {
      map = new MLMap({
        container: ref.current,
        style: currentStyleUrl(),
        center: [12, 28],
        zoom: 1.2,
        interactive: false,
        attributionControl: { compact: true },
      })
    } catch {
      return
    }
    map.once('style.load', () => applyMapTheme(map, 'none'))
    return () => map.remove()
  }, [theme])

  // maplibre-gl.css forces position:relative on the container, so size it explicitly
  return <div ref={ref} className="h-full w-full bg-map-bg" aria-hidden="true" />
}
