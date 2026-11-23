import { distanceKm } from './helpers'
import { combine, lodgingNear, type LodgingPlace } from './lodging'

/**
 * "Stay near…": a street, an area, a station or a landmark, picked from Google suggestions (through our
 * server, which holds the key). A street's line comes from OpenStreetMap, so distances are measured from
 * the whole street, not only its middle.
 */

/** Meters walked in a minute (the same pace as the "minutes from your stops" elsewhere: 13 min per km) */
export const WALK_M_PER_MIN = 1000 / 13
/** "On the street itself": this close to its line */
export const ON_STREET_M = 60

export interface Suggestion {
  id: string
  main: string
  secondary?: string
  types: string[]
  distanceMeters?: number
}

export interface Target {
  label: string
  /** "שדרה · ליסבון" */
  sub?: string
  kind: 'line' | 'area' | 'point'
  /** A street's line(s), [lng, lat] like GeoJSON */
  lines: [number, number][][]
  center: { lat: number; lng: number }
  /** An area's size: distances are counted from its edge */
  radiusM: number
}

export type PlaceKindLabel = { label: string; icon: 'street' | 'station' | 'area' | 'landmark' | 'pin' }

/** What kind of place a suggestion is, for its icon and the small line under its name */
export function kindOf(types: string[]): PlaceKindLabel {
  const has = (t: string) => types.includes(t)
  if (has('route') || has('street_address')) return { label: 'רחוב', icon: 'street' }
  if (has('subway_station')) return { label: 'תחנת מטרו', icon: 'station' }
  if (has('train_station')) return { label: 'תחנת רכבת', icon: 'station' }
  if (has('transit_station') || has('bus_station') || has('light_rail_station')) return { label: 'תחנה', icon: 'station' }
  if (has('neighborhood') || has('sublocality') || has('sublocality_level_1') || has('administrative_area_level_3')) return { label: 'שכונה', icon: 'area' }
  if (has('locality')) return { label: 'עיר', icon: 'area' }
  if (has('tourist_attraction') || has('museum') || has('park') || has('church') || has('historical_landmark')) return { label: 'אטרקציה', icon: 'landmark' }
  if (has('lodging')) return { label: 'מקום לינה', icon: 'pin' }
  return { label: 'מקום', icon: 'pin' }
}

/** Once the server says Google isn't set up, stop asking */
let off = false
export const searchAvailable = () => !off

export function newSession() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function suggest(q: string, near: { lat: number; lng: number }, session: string, signal?: AbortSignal): Promise<Suggestion[]> {
  if (off) return []
  const r = await fetch(`/api/suggest?${new URLSearchParams({ q, lat: near.lat.toFixed(4), lng: near.lng.toFixed(4), session })}`, { signal })
  if (r.status === 503 || r.status === 404) {
    off = true
    return []
  }
  if (!r.ok) throw new Error(`suggest ${r.status}`)
  return (await r.json()) as Suggestion[]
}

interface Spot {
  name: string
  lat: number
  lng: number
  types: string[]
  viewport?: { low: { lat: number; lng: number }; high: { lat: number; lng: number } }
}

const kmBox = (v: NonNullable<Spot['viewport']>) => distanceKm(v.low, v.high)

/** A street's segments from OpenStreetMap, inside the box Google gave for it */
async function streetLines(name: string, v: NonNullable<Spot['viewport']>, signal?: AbortSignal): Promise<[number, number][][]> {
  const pad = 0.0015
  const box = [v.low.lng - pad, v.high.lat + pad, v.high.lng + pad, v.low.lat - pad].join(',')
  const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: name, format: 'jsonv2', polygon_geojson: '1', dedupe: '0', limit: '40', bounded: '1', viewbox: box })}`
  const r = await fetch(u, { signal })
  if (!r.ok) return []
  type Hit = { name?: string; category?: string; geojson?: { type: string; coordinates: unknown } }
  const plain = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const want = plain(name)
  const lines: [number, number][][] = []
  for (const h of (await r.json()) as Hit[]) {
    if (h.category !== 'highway' || !h.geojson || plain(h.name ?? '') !== want) continue
    if (h.geojson.type === 'LineString') lines.push(h.geojson.coordinates as [number, number][])
    else if (h.geojson.type === 'MultiLineString') lines.push(...(h.geojson.coordinates as [number, number][][]))
  }
  return lines
}

/** Where a picked suggestion is (for an address typed by hand) */
export async function spotOf(s: Suggestion, session: string) {
  const r = await fetch(`/api/spot?${new URLSearchParams({ id: s.id, session })}`)
  if (!r.ok) throw new Error(`spot ${r.status}`)
  const spot = (await r.json()) as Spot
  return { lat: spot.lat, lng: spot.lng }
}

/** Turn a picked suggestion into something to measure distances from */
export async function resolveTarget(s: Suggestion, session: string, signal?: AbortSignal): Promise<Target> {
  const r = await fetch(`/api/spot?${new URLSearchParams({ id: s.id, session })}`, { signal })
  if (!r.ok) throw new Error(`spot ${r.status}`)
  const spot = (await r.json()) as Spot
  const kind = kindOf(s.types.length ? s.types : spot.types)
  const sub = [kind.label, s.secondary?.split(',')[0]].filter(Boolean).join(' · ')
  const center = { lat: spot.lat, lng: spot.lng }
  if (kind.icon === 'street' && spot.viewport) {
    const lines = await streetLines(spot.name || s.main, spot.viewport, signal).catch(() => [])
    if (lines.length) {
      const all = lines.flat()
      const mid = all[Math.floor(all.length / 2)]
      return { label: s.main, sub, kind: 'line', lines, center: mid ? { lat: mid[1], lng: mid[0] } : center, radiusM: 0 }
    }
    // No line: the street's box stands in for it
    return { label: s.main, sub, kind: 'area', lines: [], center, radiusM: Math.min(800, (kmBox(spot.viewport) * 1000) / 2) }
  }
  if (kind.icon === 'area' && spot.viewport) return { label: s.main, sub, kind: 'area', lines: [], center, radiusM: Math.min(1200, (kmBox(spot.viewport) * 1000) / 3) }
  return { label: s.main, sub, kind: 'point', lines: [], center, radiusM: 0 }
}

/** A target made from the trip itself: a stop, or the middle of one day's stops */
export function pointTarget(label: string, sub: string, center: { lat: number; lng: number }, radiusM = 0): Target {
  return { label, sub, kind: radiusM ? 'area' : 'point', lines: [], center, radiusM }
}

/* ---------- distances ---------- */

/** Meters from p to the segment a–b (flat-earth math is fine at street scale) */
function toSegment(p: { lat: number; lng: number }, a: [number, number], b: [number, number]) {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111320
  const ax = (a[0] - p.lng) * k
  const ay = (a[1] - p.lat) * 111320
  const bx = (b[0] - p.lng) * k
  const by = (b[1] - p.lat) * 111320
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/** Meters from a place to the target: to the nearest point of a street, or to an area's edge */
export function metersTo(p: { lat: number; lng: number }, t: Target) {
  if (t.kind === 'line') {
    let best = Infinity
    for (const line of t.lines) {
      if (line.length === 1) best = Math.min(best, distanceKm(p, { lat: line[0][1], lng: line[0][0] }) * 1000)
      for (let i = 1; i < line.length; i++) best = Math.min(best, toSegment(p, line[i - 1], line[i]))
    }
    return best
  }
  return Math.max(0, distanceKm(p, t.center) * 1000 - t.radiusM)
}

export const walkMinutes = (m: number) => Math.max(1, Math.round(m / WALK_M_PER_MIN))

/** Points every `step` meters along the street, for covering it with search circles */
function alongLine(lines: [number, number][][], step: number) {
  // Order doesn't matter for coverage: walk every segment and drop a point each `step` meters
  const out: { lat: number; lng: number }[] = []
  let carry = step // meters since the last point; a full step means "drop one right away"
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = { lat: line[i - 1][1], lng: line[i - 1][0] }
      const b = { lat: line[i][1], lng: line[i][0] }
      const len = distanceKm(a, b) * 1000
      let pos = Math.max(0, step - carry)
      while (pos <= len) {
        const f = len ? pos / len : 0
        const pt = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
        // A point close to one already taken (another segment of the same street) adds nothing
        if (!out.some((o) => distanceKm(o, pt) * 1000 < step * 0.6)) out.push(pt)
        pos += step
      }
      carry = len - (pos - step)
    }
  }
  return out
}

/**
 * Places to stay within `walkM` of the target. A street is covered with several search circles along it
 * (Google answers at most 20 places per circle); OpenStreetMap is asked only for the middle one.
 */
export async function lodgingAround(t: Target, walkM: number, signal?: AbortSignal, onProgress?: (places: LodgingPlace[]) => void): Promise<LodgingPlace[]> {
  const reach = Math.max(walkM, ON_STREET_M) + 150
  let circles: { center: { lat: number; lng: number }; radius: number }[]
  if (t.kind === 'line') {
    let pts = alongLine(t.lines, reach)
    if (pts.length > 6) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 6) === 0)
    if (!pts.length) pts = [t.center]
    circles = pts.map((c) => ({ center: c, radius: Math.min(5000, Math.round(reach)) }))
  } else {
    circles = [{ center: t.center, radius: Math.min(5000, Math.round(t.radiusM + reach)) }]
  }
  const mid = Math.floor(circles.length / 2)
  // Each circle's latest list (a later answer replaces an earlier, partial one)
  const lists: LodgingPlace[][] = circles.map(() => [])
  const set = (i: number) => (list: LodgingPlace[]) => {
    lists[i] = list
    if (!signal?.aborted) onProgress?.(combine(lists))
  }
  const results = await Promise.allSettled(circles.map((c, i) => lodgingNear(c.center, c.radius, signal, set(i), i === mid).then(set(i))))
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  if (results.every((r) => r.status === 'rejected')) throw new Error('no lodging source answered')
  return combine(lists)
}
