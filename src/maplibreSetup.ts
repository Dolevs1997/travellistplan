import { setWorkerUrl, type Map as MLMap } from 'maplibre-gl'
// MapLibre 6 resolves its worker next to its own module URL, which doesn't exist after
// bundling. Let Vite bundle the worker and hand MapLibre the resulting URL instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { getTheme, mapColors, mapStyleUrl } from './theme'

setWorkerUrl(workerUrl)

/** Base map style for the current theme (light or dark) */
export const currentStyleUrl = () => mapStyleUrl(getTheme())

/**
 * Bring the base map in line with the app's color tokens.
 * labels: 'all' keeps the style's labels, 'countries' keeps only country/continent names, 'none' hides all.
 */
export function applyMapTheme(map: MLMap, labels: 'all' | 'countries' | 'none' = 'all') {
  const c = mapColors()
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id.toLowerCase()
    try {
      if (layer.type === 'symbol') {
        const country = id.startsWith('place_country') || id.startsWith('place_continent')
        if (labels === 'none' || (labels === 'countries' && !country)) map.setLayoutProperty(layer.id, 'visibility', 'none')
        else if (labels === 'countries') map.setPaintProperty(layer.id, 'text-color', c.label)
      } else if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', c.bg)
      else if (layer.type === 'fill') {
        if (id.includes('water')) map.setPaintProperty(layer.id, 'fill-color', c.water)
        else if (/park|wood|grass|forest|landcover|nature|cemetery/.test(id)) map.setPaintProperty(layer.id, 'fill-color', c.park)
        else if (id.includes('building')) map.setPaintProperty(layer.id, 'fill-color', c.building)
      } else if (layer.type === 'line') {
        if (id.includes('water')) map.setPaintProperty(layer.id, 'line-color', c.water)
        else if (labels !== 'all' && id.startsWith('boundary_country')) map.setPaintProperty(layer.id, 'line-color', c.boundary)
      }
    } catch {
      /* some layers use expressions we don't need to override */
    }
  }
}
