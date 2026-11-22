import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { eatNear, explorePlaces, findPlaceId, lodgingNearby, parseEat, parseRestaurant, restaurantDetails, lookupPlace, parseExplore, parseNearby, parsePhoto, parseQuery, parseSpot, parseSuggest, photoUrl, placeSpot, suggestPlaces } from './server/places'

/**
 * /api/place, /api/lodging, /api/photo, /api/suggest, /api/spot, /api/explore, /api/eat and /api/restaurant on the dev and preview servers, like the Netlify functions in production.
 * GOOGLE_PLACES_KEY is read here, on the server; it has no VITE_ prefix, so it is never bundled into the app.
 */
function placesApi(key: string | undefined): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname
    if (!['/api/place', '/api/lodging', '/api/photo', '/api/suggest', '/api/spot', '/api/explore', '/api/eat', '/api/restaurant', '/api/findid'].includes(route)) return next()
    const send = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }
    if (!key) return send(503, { disabled: true })
    try {
      if (route === '/api/place') {
        const q = parseQuery(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, await lookupPlace(key, q.name, q.lat, q.lng))
      }
      if (route === '/api/findid') {
        const q = parseQuery(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, { id: await findPlaceId(key, q.name, q.lat, q.lng) })
      }
      if (route === '/api/eat') {
        const q = parseEat(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, await eatNear(key, q))
      }
      if (route === '/api/restaurant') {
        const q = parseRestaurant(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, await restaurantDetails(key, q.id))
      }
      if (route === '/api/explore') {
        const q = parseExplore(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, await explorePlaces(key, q))
      }
      if (route === '/api/suggest') {
        const q = parseSuggest(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, await suggestPlaces(key, q.q, q.lat, q.lng, q.session))
      }
      if (route === '/api/spot') {
        const q = parseSpot(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, await placeSpot(key, q.id, q.session))
      }
      if (route === '/api/lodging') {
        const q = parseNearby(url.searchParams)
        if (!q) return send(400, { error: 'bad request' })
        return send(200, await lodgingNearby(key, q.lat, q.lng, q.radius))
      }
      const q = parsePhoto(url.searchParams)
      if (!q) return send(400, { error: 'bad request' })
      const to = await photoUrl(key, q.name, q.width)
      if (!to) return send(404, { error: 'no photo' })
      res.statusCode = 302
      res.setHeader('Location', to)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.end()
    } catch (e) {
      const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : ''
      console.warn('[places-api]', e instanceof Error ? e.message + cause : e)
      send(502, { error: 'lookup failed' })
    }
  }
  return {
    name: 'places-api',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // '' loads every variable, not only VITE_*; used server-side only
  return {
    plugins: [react(), tailwindcss(), placesApi(env.GOOGLE_PLACES_KEY)],
    // MapLibre's worker is bundled separately (see src/maplibreSetup.ts) and is an ES module.
    optimizeDeps: { exclude: ['maplibre-gl'] },
    worker: { format: 'es' },
    build: { chunkSizeWarningLimit: 1600 },
  }
})
