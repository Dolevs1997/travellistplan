import { lookupPlace, parseQuery } from '../../server/places'

/** GET /api/place?name=&lat=&lng= – Google Places details for one place (the key stays on the server) */
export default async (req: Request) => {
  const key = process.env.GOOGLE_PLACES_KEY
  if (!key) return Response.json({ disabled: true }, { status: 503 })
  const q = parseQuery(new URL(req.url).searchParams)
  if (!q) return Response.json({ error: 'bad request' }, { status: 400 })
  try {
    const result = await lookupPlace(key, q.name, q.lat, q.lng)
    return Response.json(result, { headers: { 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return Response.json({ error: 'lookup failed' }, { status: 502 })
  }
}

export const config = { path: '/api/place' }
