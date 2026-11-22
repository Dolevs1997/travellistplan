import { restaurant, type RestaurantDetails } from './eat'
import { googlePhoto } from './lodging'
import type { PlaceDetails } from './places'
import type { PlaceInfo, Stop } from './types'

/**
 * Everything about one stop for its page: Google's photos, rating, reviews and hours (found by the stop's
 * name near its spot when it didn't come from Google), and links for tickets.
 */

const ID_CACHE = 'trip-planner:google-ids'

function readIds(): Record<string, string | null> {
  try {
    return JSON.parse(localStorage.getItem(ID_CACHE) ?? '{}')
  } catch {
    return {}
  }
}

/** The stop's Google place id: its own when picked from Google, else looked up once and remembered */
export async function googleIdFor(stop: Stop): Promise<string | null> {
  if (stop.info?.source === 'google') return stop.info.ref
  const key = `${stop.name}|${stop.lat.toFixed(4)}|${stop.lng.toFixed(4)}`
  const cached = readIds()
  if (key in cached) return cached[key]
  const r = await fetch(`/api/findid?${new URLSearchParams({ name: stop.name, lat: String(stop.lat), lng: String(stop.lng) })}`)
  if (r.status === 503 || r.status === 404) return null // Google isn't set up here
  if (!r.ok) throw new Error(`findid ${r.status}`)
  const { id } = (await r.json()) as { id: string | null }
  try {
    localStorage.setItem(ID_CACHE, JSON.stringify({ ...readIds(), [key]: id }))
  } catch {
    /* storage full or blocked: it's looked up again next time */
  }
  return id
}

export async function stopDetails(stop: Stop): Promise<RestaurantDetails | null> {
  const id = await googleIdFor(stop)
  return id ? restaurant(id) : null
}

/** For the Wikipedia summary, facts and "what to do": the stop's place, or one made from its name */
export const infoFor = (stop: Stop): PlaceInfo => stop.info ?? { source: 'ai', ref: stop.id, name: stop.name, kind: stop.kind, lat: stop.lat, lng: stop.lng }

/** Places that usually sell tickets (some are free: the page says to check). "Tourist attraction" alone is too broad: viewpoints have it too */
const TICKET_TYPES = ['museum', 'art_gallery', 'amusement_park', 'zoo', 'aquarium', 'castle', 'historical_landmark', 'monument', 'palace', 'planetarium', 'water_park']
/** Kinds of stop that are free to walk into */
const FREE_KINDS = ['view', 'nature', 'street', 'market', 'food', 'beach', 'shopping']
export const sellsTickets = (stop: Stop, types: string[] = []) =>
  !!stop.needsBooking || stop.kind === 'museum' || (!FREE_KINDS.includes(stop.kind) && types.some((t) => TICKET_TYPES.includes(t)))

/** Ticket sellers' searches for the place, plus its own site first */
export function ticketLinks(name: string, city: string, website?: string) {
  const q = encodeURIComponent(`${name} ${city}`)
  return [
    ...(website ? [{ id: 'site', label: 'באתר הרשמי', url: website }] : []),
    { id: 'gyg', label: 'GetYourGuide', url: `https://www.getyourguide.com/s/?q=${q}` },
    { id: 'tiqets', label: 'Tiqets', url: `https://www.tiqets.com/en/search?q=${q}` },
  ]
}

export type Photo = { src: string; thumb?: string; credit?: string; creditUrl?: string }

/** Google's photos, else the Wikipedia/Commons gallery, else the given picture */
export function photosFor(google: RestaurantDetails | null | undefined, wiki: PlaceDetails | null | undefined, image?: string): Photo[] {
  if (google?.gallery.length) return google.gallery.map((g) => ({ src: googlePhoto(g.name, 960), thumb: googlePhoto(g.name, 160), credit: g.author, creditUrl: g.authorUrl }))
  if (wiki?.gallery.length) return wiki.gallery.map((g) => ({ src: g.url, credit: 'Wikimedia Commons', creditUrl: g.page }))
  return image ? [{ src: image }] : []
}
