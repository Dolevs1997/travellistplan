import { setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 resolves its worker next to its own module URL, which doesn't exist after
// bundling. Let Vite bundle the worker and hand MapLibre the resulting URL instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)

export const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
