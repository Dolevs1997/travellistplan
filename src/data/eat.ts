import { dayStart, distanceKm, estimateTransit, fromMin, insertStop, toMin } from './helpers'
import { googlePhoto } from './lodging'
import type { Day, PlaceInfo, Stop } from './types'

/**
 * Where to eat on a day: meals, where you'll be at each one, restaurants near there (Google Places,
 * through our server), and one restaurant's full page.
 */

export type Meal = 'breakfast' | 'lunch' | 'dinner'
export type FoodKind = 'any' | 'kosher' | 'vegetarian' | 'seafood'

export const MEALS: Record<Meal, { label: string; to: string; target: number; from: number; until: number; minutes: number }> = {
  breakfast: { label: 'בוקר', to: 'לארוחת בוקר', target: toMin('08:30'), from: toMin('06:00'), until: toMin('11:00'), minutes: 45 },
  lunch: { label: 'צהריים', to: 'לצהריים', target: toMin('12:30'), from: toMin('11:30'), until: toMin('15:30'), minutes: 75 },
  dinner: { label: 'ערב', to: 'לארוחת ערב', target: toMin('19:30'), from: toMin('17:30'), until: toMin('23:30'), minutes: 90 },
}
export const MEAL_IDS: Meal[] = ['breakfast', 'lunch', 'dinner']

const roundTo5 = (m: number) => Math.round(m / 5) * 5

/** A food stop already planned in the meal's hours */
export function plannedMeal(day: Day, meal: Meal) {
  const m = MEALS[meal]
  return day.stops.find((s) => s.kind === 'food' && toMin(s.start) >= m.from && toMin(s.start) < m.until)
}

export interface MealPlan {
  /** Position in the day's stops */
  index: number
  /** Suggested start, in minutes */
  start: number
  /** Where you'll be then: the restaurants are searched around it */
  near: { lat: number; lng: number }
  /** The stop you'll be at or coming from, for "ליד…" */
  nearName?: string
}

/** Where and when a meal fits in the day */
export function mealPlan(day: Day, meal: Meal, cityCenter: { lat: number; lng: number }): MealPlan {
  const m = MEALS[meal]
  const stops = day.stops
  if (!stops.length) return { index: 0, start: meal === 'breakfast' ? Math.min(m.target, toMin(dayStart(day))) : m.target, near: cityCenter }
  if (meal === 'breakfast') {
    // Before the first stop, ending in time to get there
    const first = stops[0]
    const start = Math.max(toMin('07:00'), roundTo5(toMin(first.start) - m.minutes - 10))
    return { index: 0, start, near: first, nearName: first.name }
  }
  // After the stop you're at when the meal time comes (or the last one before it)
  let i = -1
  for (const [j, s] of stops.entries()) if (toMin(s.start) <= m.target) i = j
  if (i === -1) return { index: 0, start: m.target, near: stops[0], nearName: stops[0].name }
  const at = stops[i]
  const start = Math.max(m.target, roundTo5(toMin(at.end) + 10))
  return { index: i + 1, start, near: at, nearName: at.name }
}

/** What adding a restaurant there would do: its start/end and how far later stops move */
export function previewMeal(day: Day, plan: MealPlan, place: { lat: number; lng: number }, minutes: number) {
  const prev = day.stops[plan.index - 1]
  // Arrive after walking there from the previous stop
  const start = prev ? Math.max(plan.start, Math.ceil((toMin(prev.end) + estimateTransit(prev, place).minutes) / 5) * 5) : plan.start
  const probe: Stop = { id: 'probe', name: '', area: '', lat: place.lat, lng: place.lng, kind: 'food', start: fromMin(start), end: fromMin(start + minutes) }
  return { start, end: start + minutes, shift: insertStop(day.stops, plan.index, probe).shift }
}

/* ---------- data ---------- */

export type Periods = { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[]

export interface EatPlace {
  id: string
  name: string
  lat: number
  lng: number
  typeLabel?: string
  rating?: number
  ratingCount?: number
  price?: number
  priceRange?: string
  vegetarian?: boolean
  periods?: Periods
  hours?: string[]
  photos: string[]
}

export interface RestaurantDetails extends EatPlace {
  /** Google place types (museum, tourist_attraction…) */
  types: string[]
  address?: string
  summary?: string
  phone?: string
  website?: string
  mapsUrl?: string
  facts: Record<string, boolean>
  gallery: { name: string; author?: string; authorUrl?: string }[]
  reviews: { author: string; authorUrl?: string; photo?: string; rating?: number; when?: string; text: string; translatedFrom?: string }[]
}

let off = false
export const eatAvailable = () => !off

const listCache = new Map<string, Promise<EatPlace[]>>()

export function restaurantsNear(kind: Meal | Exclude<FoodKind, 'any'>, center: { lat: number; lng: number }, radius: number) {
  if (off) return Promise.resolve([] as EatPlace[])
  const params = new URLSearchParams({ kind, lat: center.lat.toFixed(4), lng: center.lng.toFixed(4), radius: String(Math.round(radius)) })
  const key = params.toString()
  let hit = listCache.get(key)
  if (!hit) {
    // Not cancelled with the screen: the answer is cached and shared, so it should finish
    hit = fetch(`/api/eat?${params}`).then(async (r) => {
      if (r.status === 503 || r.status === 404) {
        off = true
        return []
      }
      if (!r.ok) throw new Error(`eat ${r.status}`)
      return (await r.json()) as EatPlace[]
    })
    hit.catch(() => listCache.delete(key))
    listCache.set(key, hit)
  }
  return hit
}

const detailCache = new Map<string, Promise<RestaurantDetails>>()

export function restaurant(id: string) {
  let hit = detailCache.get(id)
  if (!hit) {
    hit = fetch(`/api/restaurant?${new URLSearchParams({ id })}`).then(async (r) => {
      if (!r.ok) throw new Error(`restaurant ${r.status}`)
      return (await r.json()) as RestaurantDetails
    })
    hit.catch(() => detailCache.delete(id))
    detailCache.set(id, hit)
  }
  return hit
}

/* ---------- display helpers ---------- */

/** Open at that date and time for at least `minutes`? undefined when the hours aren't known */
export function openAt(periods: Periods | undefined, isoDate: string, at: number, minutes = 45): boolean | undefined {
  if (!periods?.length) return undefined
  // A period without a close is open around the clock
  if (periods.length === 1 && !periods[0].close) return true
  const wd = new Date(`${isoDate}T12:00:00`).getDay()
  const week = 7 * 1440
  const t = wd * 1440 + at
  return periods.some((p) => {
    if (!p.close) return false
    const o = p.open.day * 1440 + p.open.hour * 60 + p.open.minute
    let c = p.close.day * 1440 + p.close.hour * 60 + p.close.minute
    if (c <= o) c += week // past Saturday night into Sunday
    return [t, t + week].some((x) => x >= o && x + minutes <= c)
  })
}

/** That date's hours ("12:00–15:00, 19:00–23:00"), from Google's Monday-first list */
export function hoursOn(hours: string[] | undefined, isoDate: string) {
  if (!hours?.length) return undefined
  const line = hours[(new Date(`${isoDate}T12:00:00`).getDay() + 6) % 7]
  return line?.slice(line.indexOf(':') + 1).trim() || undefined
}

export const priceSigns = (level?: number) => (level ? '€'.repeat(level) : undefined)

/** As a trip place (what the schedule stores) */
export function restaurantInfo(p: EatPlace | RestaurantDetails): PlaceInfo {
  const d = p as Partial<RestaurantDetails>
  return {
    source: 'google',
    ref: p.id,
    name: p.name,
    kind: 'food',
    lat: p.lat,
    lng: p.lng,
    description: p.typeLabel,
    image: p.photos[0] ? googlePhoto(p.photos[0], 960) : undefined,
    address: d.address,
    website: d.website,
    phone: d.phone,
    rating: p.rating,
    ratingCount: p.ratingCount,
    hoursText: p.hours,
    mapsUrl: d.mapsUrl,
  }
}

/** The day's stop nearest a place, as "5 דק׳ הליכה מ…" */
export function nearestStopText(p: { lat: number; lng: number }, stops: Stop[]) {
  let best: { s: Stop; km: number } | null = null
  for (const s of stops) {
    const km = distanceKm(p, s)
    if (!best || km < best.km) best = { s, km }
  }
  if (!best) return undefined
  const name = best.s.name.split(/ [–-] /)[0]
  const from = /^[\u0590-\u05FF]/.test(name) ? `מ${name}` : `מ-${name}`
  return best.km > 2 ? `${Math.round(best.km * 10) / 10} ק״מ ${from}` : `${Math.max(1, Math.round(best.km * 13))} דק׳ הליכה ${from}`
}
