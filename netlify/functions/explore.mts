import { explorePlaces, parseExplore } from '../../server/places'

/** GET /api/explore?cat=|q=&lat=&lng=&radius= – places to visit near a point (the key stays on the server) */
export default async (req: Request) => {
  const key = process.env.GOOGLE_PLACES_KEY
  if (!key) return Response.json({ disabled: true }, { status: 503 })
  const q = parseExplore(new URL(req.url).searchParams)
  if (!q) return Response.json({ error: 'bad request' }, { status: 400 })
  try {
    return Response.json(await explorePlaces(key, q), { headers: { 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return Response.json({ error: 'lookup failed' }, { status: 502 })
  }
}

export const config = { path: '/api/explore' }
