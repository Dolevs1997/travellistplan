import { distanceKm } from './helpers'
import type { Stop } from './types'

/**
 * Places to stay around a point. Google Places (through our server, which holds the key) is the main
 * source: it covers areas OpenStreetMap hasn't mapped and comes with ratings and photos. OpenStreetMap
 * (via Photon and Overpass: free, no key) adds the smaller places Google's 20-result answer leaves out.
 * Neither has prices or availability; those live on Booking and Airbnb, which the screens link to.
 */

export type LodgingKind = 'hotel' | 'guest' | 'hostel' | 'apartment'

export const LODGING_LABEL: Record<LodgingKind, string> = {
  hotel: 'מלון',
  guest: 'גסטהאוס',
  hostel: 'הוסטל',
  apartment: 'דירה',
}

export interface LodgingPlace {
  id: string
  name: string
  kind: LodgingKind
  lat: number
  lng: number
  stars?: number
  website?: string
  street?: string
  /** The OpenStreetMap element, for fetching its details (photo, stars, contact) */
  osm?: { type: 'node' | 'way' | 'relation'; id: number }
  /** Found through Google Places: its details came with it */
  google?: GoogleLodging
}

/** What /api/lodging returns for one place */
interface GoogleLodging {
  id: string
  name: string
  lat: number
  lng: number
  type?: string
  rating?: number
  ratingCount?: number
  address?: string
  phone?: string
  website?: string
  mapsUrl?: string
  photo?: string
  photoAuthor?: string
  photoAuthorUrl?: string
}

const KIND: Record<string, LodgingKind> = { hotel: 'hotel', motel: 'hotel', guest_house: 'guest', hostel: 'hostel', apartment: 'apartment' }
const cache = new Map<string, LodgingPlace[]>()

/** Names that are just the type ("Apartments", "guest house") say nothing about the place */
const GENERIC = /^(hotel|hostel|motel|guest ?house|apartments?|apartamentos?|alojamento local|b&b)$/i

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * 111

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: { osm_id: number; osm_type: string; osm_value: string; name?: string; street?: string }
}

/** Photon (komoot) search, one request per type, biased to the point: fast, and the main source */
async function fromPhoton(center: { lat: number; lng: number }, signal?: AbortSignal): Promise<LodgingPlace[]> {
  const types = ['hotel', 'guest_house', 'hostel', 'apartment', 'motel']
  const lists = await Promise.all(
    types.map(async (t) => {
      const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(t.replace('_', ' '))}&lat=${center.lat}&lon=${center.lng}&limit=50&osm_tag=tourism:${t}`
      const r = await fetch(u, { signal })
      if (!r.ok) throw new Error(`photon ${r.status}`)
      return ((await r.json()) as { features: PhotonFeature[] }).features
    }),
  )
  return lists.flat().flatMap((f) => {
    const kind = KIND[f.properties.osm_value]
    const [lng, lat] = f.geometry.coordinates
    const name = f.properties.name?.trim()
    if (!kind || !name || GENERIC.test(name)) return []
    const type = ({ N: 'node', W: 'way', R: 'relation' } as const)[f.properties.osm_type as 'N' | 'W' | 'R']
    return [{ id: `${f.properties.osm_type}-${f.properties.osm_id}`, name, kind, lat, lng, street: f.properties.street, osm: type ? { type, id: f.properties.osm_id } : undefined }]
  })
}

/** Once the server says Google isn't set up (no key), stop asking for this visit */
let googleOff = false

const GOOGLE_KIND: Record<string, LodgingKind> = {
  hostel: 'hostel',
  guest_house: 'guest',
  bed_and_breakfast: 'guest',
  private_guest_room: 'guest',
  inn: 'guest',
  farmstay: 'guest',
  cottage: 'apartment',
  extended_stay_hotel: 'apartment',
}

/** A Google photo, loaded through our server (which redirects to Google's public image URL) */
export const googlePhoto = (name: string, width = 480) => `/api/photo?${new URLSearchParams({ name, w: String(width) })}`

/** Google Places: up to 20 places, most popular first. null when the server has no key (or no route) */
async function fromGoogle(center: { lat: number; lng: number }, radiusM: number, signal?: AbortSignal): Promise<LodgingPlace[] | null> {
  if (googleOff) return null
  const r = await fetch(`/api/lodging?${new URLSearchParams({ lat: center.lat.toFixed(5), lng: center.lng.toFixed(5), radius: String(Math.round(radiusM)) })}`, { signal })
  if (r.status === 503 || r.status === 404) {
    googleOff = true
    return null
  }
  if (!r.ok) throw new Error(`google lodging ${r.status}`)
  const list = (await r.json()) as GoogleLodging[]
  return list.map((g) => ({ id: `g-${g.id}`, name: g.name, kind: GOOGLE_KIND[g.type ?? ''] ?? 'hotel', lat: g.lat, lng: g.lng, website: g.website, street: g.address, google: g }))
}

const plain = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Several partial lists as one: Google's places win over the same place from OpenStreetMap, each place once */
export function combine(lists: LodgingPlace[][]) {
  const seen = new Set<string>()
  const all = lists.flat().filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
  return merge(
    all.filter((p) => p.google),
    all.filter((p) => !p.google),
  )
}

/** Google's places, then the OpenStreetMap ones that aren't the same place under a slightly different name */
function merge(google: LodgingPlace[], osm: LodgingPlace[]) {
  const names = new Set(google.map((g) => plain(g.name)))
  return [...google, ...osm.filter((o) => !names.has(plain(o.name)) && !google.some((g) => kmBetween(g, o) < 0.04))]
}

interface OsmElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Overpass: the complete list (with stars and websites), but public servers are often slow or busy */
async function fromOverpass(endpoint: string, center: { lat: number; lng: number }, radiusM: number, signal?: AbortSignal): Promise<LodgingPlace[]> {
  const query = `[out:json][timeout:20];nwr["tourism"~"^(hotel|motel|guest_house|hostel|apartment)$"]["name"](around:${Math.round(radiusM)},${center.lat},${center.lng});out center tags 120;`
  const res = await fetch(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }), signal })
  if (!res.ok) throw new Error(`overpass ${res.status}`)
  const json = (await res.json()) as { elements: OsmElement[] }
  return json.elements.flatMap((e) => {
    const t = e.tags ?? {}
    const lat = e.lat ?? e.center?.lat
    const lng = e.lon ?? e.center?.lon
    const kind = KIND[t.tourism]
    const name = t['name:he'] || t.name
    if (lat === undefined || lng === undefined || !kind || !name || GENERIC.test(name)) return []
    const stars = Number.parseInt(t.stars ?? '', 10)
    return [{ id: `${e.type}-${e.id}`, name, kind, lat, lng, stars: stars >= 1 && stars <= 5 ? stars : undefined, website: t.website || undefined, street: t['addr:street'] || undefined, osm: { type: e.type as 'node' | 'way' | 'relation', id: e.id } }]
  })
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

/** Ask every Overpass server at once; the first good answer wins, the rest are cancelled. Gives up after `ms`. */
async function raceOverpass(center: { lat: number; lng: number }, radiusM: number, ms: number, signal?: AbortSignal) {
  const ctrls = OVERPASS.map(() => new AbortController())
  const stop = () => ctrls.forEach((c) => c.abort())
  signal?.addEventListener('abort', stop)
  const timer = window.setTimeout(stop, ms)
  try {
    // First success wins (like Promise.any, which this project's ES2020 target doesn't include)
    return await new Promise<LodgingPlace[]>((resolve, reject) => {
      let failures = 0
      OVERPASS.forEach((url, i) =>
        fromOverpass(url, center, radiusM, ctrls[i].signal).then(resolve, (e) => {
          if (++failures === OVERPASS.length) reject(e)
        }),
      )
    })
  } finally {
    window.clearTimeout(timer)
    stop()
    signal?.removeEventListener('abort', stop)
  }
}

/** Within the radius, nearest first, one per name */
function tidy(raw: LodgingPlace[], center: { lat: number; lng: number }, radiusM: number) {
  const seen = new Set<string>()
  return raw
    .filter((p) => kmBetween(p, center) * 1000 <= radiusM)
    .sort((a, b) => kmBetween(a, center) - kmBetween(b, center))
    .filter((p) => {
      const k = p.name.toLowerCase()
      return seen.has(k) ? false : (seen.add(k), true)
    })
}

/**
 * Places to stay within `radiusM` of a point. Google, Photon and Overpass are asked at once; every
 * time one answers, the merged list so far goes to `onProgress`. Throws only when all of them fail.
 */
export async function lodgingNear(
  center: { lat: number; lng: number },
  radiusM: number,
  signal?: AbortSignal,
  onProgress?: (places: LodgingPlace[]) => void,
  /** false: Google only (for the extra circles along a street, where OpenStreetMap would mean many slow requests) */
  osm = true,
): Promise<LodgingPlace[]> {
  const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)},${Math.round(radiusM / 100)}${osm ? '' : ',g'}`
  const hit = cache.get(key)
  if (hit) return hit
  // Filled in as each source answers (null: it failed or isn't set up)
  const got: { g: LodgingPlace[] | null; o: LodgingPlace[] | null; p: LodgingPlace[] | null } = { g: null, o: null, p: null }
  const current = () => tidy(merge(got.g ?? [], [...(got.o ?? []), ...(got.p ?? [])]), center, radiusM)
  const report = () => {
    if (!signal?.aborted) onProgress?.(current())
  }
  await Promise.all([
    fromGoogle(center, radiusM, signal).then((r) => ((got.g = r), report()), () => {}),
    osm && raceOverpass(center, radiusM, 15000, signal).then((r) => ((got.o = r), report()), () => {}),
    osm && fromPhoton(center, signal).then((r) => ((got.p = r), report()), () => {}),
  ])
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  if (!got.g && !got.o && !got.p) throw new Error('no lodging source answered')
  const places = current()
  if (got.g?.length || got.o) cache.set(key, places) // only a complete answer is worth keeping
  return places
}

export function nearStops(p: { lat: number; lng: number }, stops: Stop[]) {
  if (!stops.length) return { minutes: 0, count: 0 }
  const km = stops.map((s) => distanceKm(p, s))
  return { minutes: Math.max(1, Math.round(Math.min(...km) * 13)), count: km.filter((d) => d <= 0.8).length }
}

/**
 * Where most of the city's stops are: the middle of the densest group (stops within 1.5 km of one another),
 * so one far-off stop (a museum across town) doesn't pull the search area into an empty district.
 */
export function stopsCenter(stops: Stop[]) {
  if (!stops.length) return null
  const groups = stops.map((s) => stops.filter((o) => distanceKm(s, o) <= 1.5))
  const best = groups.reduce((a, g) => (g.length > a.length ? g : a))
  return { lat: best.reduce((n, s) => n + s.lat, 0) / best.length, lng: best.reduce((n, s) => n + s.lng, 0) / best.length }
}

/** Booking search for one place, with the dates and guests filled in */
export function bookingFor(name: string, city: string, checkIn: string, checkOut: string, adults: number, rooms: number) {
  const u = new URL('https://www.booking.com/searchresults.html')
  u.searchParams.set('ss', `${name}, ${city}`)
  if (checkIn && checkOut) {
    u.searchParams.set('checkin', checkIn)
    u.searchParams.set('checkout', checkOut)
  }
  u.searchParams.set('group_adults', String(adults))
  u.searchParams.set('no_rooms', String(rooms))
  return u.toString()
}

/* ---------- details of one place ---------- */

export interface LodgingDetails {
  stars?: number
  website?: string
  phone?: string
  address?: string
  rooms?: number
  wifi?: boolean
  wheelchair?: boolean
  /** A large photo (Wikidata, Wikimedia Commons or the place's own image tag); none for most small places */
  photo?: string
  /** Where the photo comes from (for credit) */
  photoPage?: string
  /** Google: average rating (1–5), number of reviews, the place's own Maps page, and who took the photo */
  rating?: number
  ratingCount?: number
  mapsUrl?: string
  photoAuthor?: string
  photoAuthorUrl?: string
}

const details = new Map<string, Promise<LodgingDetails>>()
const filePath = (file: string, width = 960) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/^File:/, ''))}?width=${width}`

/** Wikidata item → its main image (P18) */
async function wikidataImage(qid: string): Promise<string | undefined> {
  const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P18&format=json&origin=*`)
  if (!r.ok) return undefined
  const json = (await r.json()) as { claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } }
  return json.claims?.P18?.[0]?.mainsnak?.datavalue?.value
}

/** Commons category → its first photo */
async function commonsCategoryImage(category: string): Promise<string | undefined> {
  const title = category.startsWith('Category:') ? category : `Category:${category}`
  const r = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(title)}&cmtype=file&cmlimit=5&format=json&origin=*`,
  )
  if (!r.ok) return undefined
  const json = (await r.json()) as { query?: { categorymembers?: { title: string }[] } }
  return json.query?.categorymembers?.find((m) => /\.(jpe?g|png|webp)$/i.test(m.title))?.title
}

async function loadDetails(p: LodgingPlace): Promise<LodgingDetails> {
  if (!p.osm) return { stars: p.stars, website: p.website, address: p.street }
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/${p.osm.type}/${p.osm.id}.json`)
  if (!r.ok) return { stars: p.stars, website: p.website, address: p.street }
  const json = (await r.json()) as { elements?: { tags?: Record<string, string> }[] }
  const t = json.elements?.[0]?.tags ?? {}
  const stars = Number.parseInt(t.stars ?? '', 10)
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
  const out: LodgingDetails = {
    stars: stars >= 1 && stars <= 5 ? stars : p.stars,
    website: t.website || t['contact:website'] || p.website,
    phone: t.phone || t['contact:phone'] || undefined,
    address: street || p.street,
    rooms: Number.parseInt(t.rooms ?? '', 10) || undefined,
    wifi: t.internet_access ? t.internet_access !== 'no' : undefined,
    wheelchair: t.wheelchair ? t.wheelchair === 'yes' : undefined,
  }
  try {
    let file: string | undefined
    if (t.wikidata) file = await wikidataImage(t.wikidata)
    if (!file && t.wikimedia_commons) file = t.wikimedia_commons.startsWith('Category:') ? await commonsCategoryImage(t.wikimedia_commons) : t.wikimedia_commons
    if (file) {
      out.photo = filePath(file)
      out.photoPage = `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.startsWith('File:') ? file : `File:${file}`)}`
    } else if (t.image && /^https:\/\/.+\.(jpe?g|png|webp)$/i.test(t.image)) out.photo = t.image
  } catch {
    /* no photo: the card shows the type icon */
  }
  return out
}

/** Details for one place, fetched once (the promise is shared by every card that asks) */
/* ---------- Google Places (through our server, which holds the key) ---------- */

interface GoogleResult {
  found: boolean
  rating?: number
  ratingCount?: number
  address?: string
  phone?: string
  website?: string
  mapsUrl?: string
  photo?: string
  photoAuthor?: string
  photoAuthorUrl?: string
}

const GOOGLE_CACHE = 'trip-planner:google-places'

function readGoogleCache(): Record<string, GoogleResult> {
  try {
    return JSON.parse(localStorage.getItem(GOOGLE_CACHE) ?? '{}')
  } catch {
    return {}
  }
}

/** Google details for one place; answers are kept on the device so each place is looked up once */
async function googleDetails(p: LodgingPlace): Promise<GoogleResult | null> {
  const cached = readGoogleCache()[p.id]
  if (cached) return cached
  if (googleOff) return null
  const res = await fetch(`/api/place?${new URLSearchParams({ name: p.name, lat: String(p.lat), lng: String(p.lng) })}`)
  if (res.status === 503 || res.status === 404) {
    googleOff = true // no key, or no server route (a static host)
    return null
  }
  if (!res.ok) return null
  const result = (await res.json()) as GoogleResult
  try {
    const all = readGoogleCache()
    all[p.id] = result
    localStorage.setItem(GOOGLE_CACHE, JSON.stringify(all))
  } catch {
    /* storage full or blocked: it just isn't cached */
  }
  return result
}

/** Google's details win where it has them (fresher photo, rating); OpenStreetMap fills the rest */
async function loadAll(p: LodgingPlace): Promise<LodgingDetails> {
  const g0 = p.google
  if (g0)
    return {
      address: g0.address,
      phone: g0.phone,
      website: g0.website,
      rating: g0.rating,
      ratingCount: g0.ratingCount,
      mapsUrl: g0.mapsUrl,
      ...(g0.photo ? { photo: googlePhoto(g0.photo, 960), photoAuthor: g0.photoAuthor, photoAuthorUrl: g0.photoAuthorUrl } : {}),
    }
  const [osm, g] = await Promise.all([
    loadDetails(p).catch((): LodgingDetails => ({ stars: p.stars, website: p.website, address: p.street })),
    googleDetails(p).catch(() => null),
  ])
  if (!g?.found) return osm
  return {
    ...osm,
    address: g.address ?? osm.address,
    phone: g.phone ?? osm.phone,
    website: g.website ?? osm.website,
    rating: g.rating,
    ratingCount: g.ratingCount,
    mapsUrl: g.mapsUrl,
    ...(g.photo ? { photo: g.photo, photoPage: undefined, photoAuthor: g.photoAuthor, photoAuthorUrl: g.photoAuthorUrl } : {}),
  }
}

/** Details for one place, fetched once (the promise is shared by every card that asks) */
export function lodgingDetails(p: LodgingPlace): Promise<LodgingDetails> {
  let hit = details.get(p.id)
  if (!hit) {
    hit = loadAll(p)
    details.set(p.id, hit)
  }
  return hit
}

/** The place's page on Google Maps: its reviews, photos and opening hours */
export const googlePlaceUrl = (p: { name: string }, city: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${city}`)}`
