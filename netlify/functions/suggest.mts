import { parseSuggest, suggestPlaces } from '../../server/places'

/** GET /api/suggest?q=&lat=&lng=&session= – streets, areas and places matching what was typed (the key stays on the server) */
export default async (req: Request) => {
  const key = process.env.GOOGLE_PLACES_KEY
  if (!key) return Response.json({ disabled: true }, { status: 503 })
  const q = parseSuggest(new URL(req.url).searchParams)
  if (!q) return Response.json({ error: 'bad request' }, { status: 400 })
  try {
    return Response.json(await suggestPlaces(key, q.q, q.lat, q.lng, q.session))
  } catch {
    return Response.json({ error: 'lookup failed' }, { status: 502 })
  }
}

export const config = { path: '/api/suggest' }
