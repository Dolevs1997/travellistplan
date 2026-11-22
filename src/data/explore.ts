import { distanceKm } from './helpers'
import { googlePhoto } from './lodging'
import type { Day, PlaceInfo, Stop, StopKind } from './types'

/**
 * Places to add to a day: Google Places recommendations by category around the day's stops, and search.
 * Everything goes through our server (/api/explore), which holds the key.
 */

export type ExploreCat = 'top' | 'sights' | 'museums' | 'views' | 'food' | 'cafes' | 'kosher' | 'markets' | 'nature'

export const exploreCategories = (kosher: boolean): { id: ExploreCat; label: string }[] => [
  { id: 'top', label: 'מומלץ' },
  { id: 'sights', label: 'אטרקציות' },
  { id: 'museums', label: 'מוזיאונים' },
  { id: 'views', label: 'תצפיות' },
  kosher ? { id: 'kosher', label: 'אוכל כשר' } : { id: 'food', label: 'אוכל' },
  { id: 'markets', label: 'שווקים' },
  { id: 'nature', label: 'טבע' },
]

export interface ExplorePlace {
  id: string
  name: string
  lat: number
  lng: number
  types: string[]
  typeLabel?: string
  rating?: number
  ratingCount?: number
  address?: string
  summary?: string
  hours?: string[]
  website?: string
  mapsUrl?: string
  photo?: string
  photoAuthor?: string
  photoAuthorUrl?: string
}

let off = false
/** False once the server says Google isn't set up (no key, or a host without the server routes) */
export const exploreAvailable = () => !off

const cache = new Map<string, Promise<ExplorePlace[]>>()

export function explore(
  what: { cat: ExploreCat } | { q: string },
  area: { center: { lat: number; lng: number }; radius: number },
): Promise<ExplorePlace[]> {
  if (off) return Promise.resolve([])
  const params = new URLSearchParams({
    ...('cat' in what ? { cat: what.cat } : { q: what.q }),
    lat: area.center.lat.toFixed(4),
    lng: area.center.lng.toFixed(4),
    radius: String(Math.round(area.radius)),
  })
  const key = params.toString()
  let hit = cache.get(key)
  if (!hit) {
    // Not cancelled with the screen: the answer is cached and shared, so it should finish
    hit = fetch(`/api/explore?${params}`).then(async (r) => {
      if (r.status === 503 || r.status === 404) {
        off = true
        return []
      }
      if (!r.ok) throw new Error(`explore ${r.status}`)
      return (await r.json()) as ExplorePlace[]
    })
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}

/** Where to look for a day: around its stops (in its city), else the day's destination */
export function dayArea(day: Day, fallback: { lat: number; lng: number }) {
  const city = day.destination ?? fallback
  const stops = day.stops.filter((s) => distanceKm(s, city) <= 20)
  if (!stops.length) return { center: { lat: city.lat, lng: city.lng }, radius: 3000 }
  const center = { lat: stops.reduce((a, s) => a + s.lat, 0) / stops.length, lng: stops.reduce((a, s) => a + s.lng, 0) / stops.length }
  const spread = Math.max(...stops.map((s) => distanceKm(s, center))) * 1000
  return { center, radius: Math.min(5000, Math.max(1500, spread + 1000)) }
}

/** The day's stop closest to a place, and the walk to it (13 min per km, like elsewhere in the app) */
export function nearestStop(p: { lat: number; lng: number }, stops: Stop[]) {
  let best: { stop: Stop; km: number } | null = null
  for (const s of stops) {
    const km = distanceKm(p, s)
    if (!best || km < best.km) best = { stop: s, km }
  }
  return best ? { name: best.stop.name, minutes: Math.max(1, Math.round(best.km * 13)), km: best.km } : null
}

const KIND_BY_TYPE: [string, StopKind][] = [
  ['museum', 'museum'],
  ['art_gallery', 'museum'],
  ['restaurant', 'food'],
  ['cafe', 'food'],
  ['bakery', 'food'],
  ['bar', 'food'],
  ['food', 'food'],
  ['beach', 'beach'],
  ['park', 'nature'],
  ['national_park', 'nature'],
  ['hiking_area', 'nature'],
  ['garden', 'nature'],
  ['market', 'market'],
  ['shopping_mall', 'shopping'],
  ['store', 'shopping'],
  ['church', 'heritage'],
  ['historical_landmark', 'heritage'],
]

export function kindOf(p: ExplorePlace, cat?: ExploreCat): StopKind {
  if (cat === 'views') return 'view'
  if (cat === 'markets') return 'market'
  for (const [t, k] of KIND_BY_TYPE) if (p.types.includes(t)) return k
  return cat === 'food' || cat === 'cafes' || cat === 'kosher' ? 'food' : cat === 'nature' ? 'nature' : 'heritage'
}

/** As a trip place (what the schedule stores) */
export function toPlaceInfo(p: ExplorePlace, cat?: ExploreCat): PlaceInfo {
  return {
    source: 'google',
    ref: p.id,
    name: p.name,
    kind: kindOf(p, cat),
    lat: p.lat,
    lng: p.lng,
    description: p.summary ?? p.typeLabel,
    image: p.photo ? googlePhoto(p.photo, 960) : undefined,
    address: p.address,
    website: p.website,
    rating: p.rating,
    ratingCount: p.ratingCount,
    hoursText: p.hours,
    mapsUrl: p.mapsUrl,
  }
}

/** That date's opening hours ("10:00–18:00"), from Google's Monday-first list */
export function hoursOn(hours: string[] | undefined, isoDate: string) {
  if (!hours?.length) return undefined
  const day = new Date(`${isoDate}T12:00:00`).getDay() // Sunday = 0
  const line = hours[(day + 6) % 7]
  return line?.slice(line.indexOf(':') + 1).trim() || undefined
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Edit distance, for names spelled a little differently ("מגדל בלם" / "מגדל בלן") */
function edits(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

const hebrew = (x: string) => /[\u0590-\u05FF]/.test(x)

/** The same place under another spelling: close by, and a similar name (or the same distinctive first word) */
function samePlace(p: ExplorePlace, s: Stop) {
  if (s.info?.ref === p.id) return true
  if (distanceKm(p, s) > 0.3) return false
  const a = plain(p.name)
  const b = plain(s.name)
  if (hebrew(a) !== hebrew(b)) return false // compared by place instead, below
  if (a === b || a.includes(b) || b.includes(a)) return true
  if (edits(a, b) <= Math.max(1, Math.round(Math.min(a.length, b.length) * 0.2))) return true
  const first = (x: string) => x.split(' ')[0]
  return first(a).length >= 4 && first(a) === first(b)
}

/**
 * Which of the places are already in the trip (picked from Google before, or the same place under another
 * spelling). Names in different alphabets ("כיכר הקומרסיו" / "Praça do Comércio") can't be compared, so each
 * such stop matches only the closest place within 120 m: two viewpoints 25 m apart stay two places.
 */
export function matchTrip(places: ExplorePlace[], days: Day[]) {
  const found = new Map<string, { dayIndex: number; stop: Stop }>()
  const matchedStops = new Set<string>()
  days.forEach((d, dayIndex) =>
    d.stops.forEach((stop) => {
      const p = places.find((x) => !found.has(x.id) && samePlace(x, stop))
      if (p) {
        found.set(p.id, { dayIndex, stop })
        matchedStops.add(stop.id)
      }
    }),
  )
  days.forEach((d, dayIndex) =>
    d.stops.forEach((stop) => {
      if (matchedStops.has(stop.id)) return
      let best: { p: ExplorePlace; km: number } | null = null
      for (const p of places) {
        if (found.has(p.id) || hebrew(plain(p.name)) === hebrew(plain(stop.name))) continue
        const km = distanceKm(p, stop)
        if (km <= 0.12 && (!best || km < best.km)) best = { p, km }
      }
      if (best) found.set(best.p.id, { dayIndex, stop })
    }),
  )
  return found
}
