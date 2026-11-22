import { parsePhoto, photoUrl } from '../../server/places'

/** GET /api/photo?name=&w= – redirects to a Google Places photo (the key stays on the server) */
export default async (req: Request) => {
  const key = process.env.GOOGLE_PLACES_KEY
  if (!key) return Response.json({ disabled: true }, { status: 503 })
  const q = parsePhoto(new URL(req.url).searchParams)
  if (!q) return Response.json({ error: 'bad request' }, { status: 400 })
  try {
    const to = await photoUrl(key, q.name, q.width)
    if (!to) return Response.json({ error: 'no photo' }, { status: 404 })
    return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return Response.json({ error: 'lookup failed' }, { status: 502 })
  }
}

export const config = { path: '/api/photo' }
