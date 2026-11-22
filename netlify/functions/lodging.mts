import { lodgingNearby, parseNearby } from '../../server/places'

/** GET /api/lodging?lat=&lng=&radius= – places to stay near a point, from Google Places (the key stays on the server) */
export default async (req: Request) => {
  const key = process.env.GOOGLE_PLACES_KEY
  if (!key) return Response.json({ disabled: true }, { status: 503 })
  const q = parseNearby(new URL(req.url).searchParams)
  if (!q) return Response.json({ error: 'bad request' }, { status: 400 })
  try {
    const places = await lodgingNearby(key, q.lat, q.lng, q.radius)
    return Response.json(places, { headers: { 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return Response.json({ error: 'lookup failed' }, { status: 502 })
  }
}

export const config = { path: '/api/lodging' }
