import type { Destination, Trip, TripBrief } from './types'
import { DESTINATIONS } from './destinations'
import { isoRange, shortDate } from './helpers'
import type { PlanOp } from './aiPlan'

/** The answers of the new-trip wizard (where, who, when, how, how much), also kept on the trip */

export const PACE_LABEL = { relaxed: 'רגוע', balanced: 'מאוזן', packed: 'אינטנסיבי' } as const
export const PACE_HINT = {
  relaxed: '2 עצירות ביום',
  balanced: '3–4 עצירות',
  packed: '5+ עצירות',
} as const
export const TIER_LABEL = { budget: 'חסכוני', comfort: 'נוח', premium: 'מפנק' } as const
export const TIER_HINT = { budget: 'מלון 3★ · פשוט', comfort: 'מלון 4★ · מרכזי', premium: 'מלון 5★' } as const

export const INTERESTS = ['היסטוריה ותרבות', 'אוכל', 'טבע', 'תצפיות', 'חיי לילה', 'שופינג']
export const LOCAL_TRANSPORT = ['תחבורה ציבורית', 'רכב שכור', 'מוניות']
export const INTERCITY_TRANSPORT = ['רכבת', 'טיסה פנימית', 'רכב שכור', 'אוטובוס']

export const emptyBrief = (): TripBrief => ({
  legs: [],
  multi: false,
  adults: 2,
  children: [],
  rooms: 1,
  start: '',
  end: '',
  monthOnly: false,
  flightsBooked: false,
  pace: 'balanced',
  kosher: false,
  mustSee: [],
  interests: [],
  localTransport: ['תחבורה ציבורית'],
  shortWalks: true,
  intercity: [],
  tier: 'comfort',
})

/** Adds days to an ISO date */
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export const roomsText = (n: number) => (n === 1 ? 'חדר אחד' : `${n} חדרים`)

export const totalNights = (b: TripBrief) => b.legs.reduce((n, l) => n + l.nights, 0)
export const travelers = (b: TripBrief) => b.adults + b.children.length

/** Return date: derived from the route's nights when there are several destinations */
export function endDateOf(b: TripBrief) {
  return b.multi && b.legs.length > 0 && b.start ? addDays(b.start, totalNights(b)) : b.end
}

/** Nights in each destination; a single destination takes them from the dates */
export function legsWithNights(b: TripBrief) {
  if (b.multi && b.legs.length > 0) return b.legs
  const end = endDateOf(b)
  const nights = b.start && end ? Math.max(1, isoRange(b.start, end).length - 1) : 1
  return b.legs.slice(0, 1).map((l) => ({ ...l, nights }))
}

/** Check-in and check-out of each destination (the next one starts on the day the previous one ends) */
export function legDates(b: TripBrief) {
  let cursor = b.start
  return legsWithNights(b).map((leg) => {
    const checkIn = cursor
    const checkOut = cursor ? addDays(cursor, leg.nights) : ''
    cursor = checkOut
    return { leg, checkIn, checkOut }
  })
}

/* ---------- budget estimate (rough, not live prices) ---------- */

/** Price level by country, 1 = Southern Europe. Cities use their country's level. */
const COUNTRY_FACTOR: Record<string, number> = {
  TH: 0.55, VN: 0.5, ID: 0.5, IN: 0.45, JP: 0.9, KR: 0.8, MX: 0.7, BR: 0.7, AR: 0.6, PE: 0.55, MA: 0.6, EG: 0.5, TZ: 0.75, ZA: 0.65, TR: 0.65,
  GE: 0.55, PT: 0.85, ES: 0.9, GR: 0.85, HR: 0.85, ME: 0.75, PL: 0.6, RO: 0.55, HU: 0.6, CZ: 0.7, IS: 1.6, NO: 1.6, CH: 1.7, DK: 1.4, SE: 1.2,
  GB: 1.3, IE: 1.2, NL: 1.2, BE: 1.1, DE: 1.1, AT: 1.1, FR: 1.15, IT: 1, CY: 0.9, US: 1.4, AU: 1.3, AE: 1.3,
}

const codeByCountryName = new Map(DESTINATIONS.filter((d) => d.kind === 'country' && d.countryCode).map((d) => [d.name, d.countryCode!]))

export function priceLevel(d: Destination) {
  const code = d.countryCode ?? codeByCountryName.get(d.country)
  return (code && COUNTRY_FACTOR[code]) || 1
}

const NIGHT = { budget: 380, comfort: 620, premium: 1100 } // ILS per room
const FOOD = { budget: 130, comfort: 220, premium: 380 } // per person per day
const MOVE = { budget: 120, comfort: 180, premium: 300 } // per person per transfer between destinations
const THINGS = { budget: 60, comfort: 110, premium: 190 } // tickets, per person per day

export interface Estimate {
  lodging: number
  food: number
  intercity: number
  attractions: number
  flights: number
  total: number
  nightly: number
}

const round50 = (n: number) => Math.round(n / 50) * 50

export function estimate(b: TripBrief, tier: 'budget' | 'comfort' | 'premium'): Estimate {
  const legs = legsWithNights(b)
  const nights = legs.reduce((n, l) => n + l.nights, 0)
  const days = nights + 1
  const people = travelers(b)
  const lodging = legs.reduce((n, l) => n + l.nights * b.rooms * NIGHT[tier] * priceLevel(l.destination), 0)
  const level = legs.length ? legs.reduce((n, l) => n + priceLevel(l.destination), 0) / legs.length : 1
  const food = days * people * FOOD[tier] * level
  // A visit on the way adds one more short move; it has no lodging
  const intercity = (Math.max(0, legs.length - 1) + (b.visits?.length ?? 0)) * people * MOVE[tier]
  const attractions = days * people * THINGS[tier] * level
  const flights = (b.flightPerPerson ?? 0) * people
  const parts = { lodging: round50(lodging), food: round50(food), intercity: round50(intercity), attractions: round50(attractions), flights }
  return { ...parts, total: Object.values(parts).reduce((a, c) => a + c, 0), nightly: nights ? round50(lodging / nights / b.rooms) : 0 }
}

export const money = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`

/* ---------- lodging search links ---------- */

/** Opens each site's search with the destination, dates and guests already filled in */
export function lodgingLinks(b: TripBrief, name: string, checkIn: string, checkOut: string) {
  const kids = b.children.length
  const booking = new URL('https://www.booking.com/searchresults.html')
  booking.searchParams.set('ss', name)
  if (checkIn && checkOut) {
    booking.searchParams.set('checkin', checkIn)
    booking.searchParams.set('checkout', checkOut)
  }
  booking.searchParams.set('group_adults', String(b.adults))
  booking.searchParams.set('group_children', String(kids))
  booking.searchParams.set('no_rooms', String(b.rooms))
  b.children.forEach((age) => booking.searchParams.append('age', String(age)))

  const airbnb = new URL(`https://www.airbnb.com/s/${encodeURIComponent(name)}/homes`)
  if (checkIn && checkOut) {
    airbnb.searchParams.set('checkin', checkIn)
    airbnb.searchParams.set('checkout', checkOut)
  }
  airbnb.searchParams.set('adults', String(b.adults))
  if (kids) airbnb.searchParams.set('children', String(kids))

  const google = new URL('https://www.google.com/travel/search')
  google.searchParams.set('q', `Hotels in ${name}`)

  return [
    { id: 'booking', label: 'Booking.com', url: booking.toString() },
    { id: 'airbnb', label: 'Airbnb', url: airbnb.toString() },
    { id: 'google', label: 'Google מלונות', url: google.toString() },
  ]
}

/* ---------- hand-off to the trip ---------- */

/** Operations that create the trip skeleton (destinations and dates) without the assistant */
export function skeletonOps(b: TripBrief): PlanOp[] {
  const legs = legsWithNights(b)
  const first = legs[0]?.destination
  if (!first || !b.start) return []
  const end = endDateOf(b)
  const ops: PlanOp[] = [
    {
      op: 'setup_trip',
      start_date: b.start,
      end_date: end || b.start,
      name: first.name,
      country: first.country,
      lat: first.lat,
      lng: first.lng,
      is_country: first.kind === 'country',
    },
  ]
  let cursor = 0
  legs.forEach((leg, i) => {
    const from = cursor + 1
    const to = cursor + leg.nights + (i === legs.length - 1 ? 1 : 0)
    cursor += leg.nights
    if (i > 0)
      ops.push({
        op: 'set_destination',
        day: from,
        to_day: to,
        name: leg.destination.name,
        country: leg.destination.country,
        lat: leg.destination.lat,
        lng: leg.destination.lng,
        is_country: leg.destination.kind === 'country',
      })
  })
  return ops
}

/** Short summary chips shown above each step */
export function summaryChips(b: TripBrief, upTo: number) {
  const chips: string[] = []
  if (upTo > 0 && b.legs.length) chips.push(b.legs.length > 1 ? `${b.legs.map((l) => l.destination.name).join(' · ')}` : b.legs[0].destination.name)
  if (upTo > 1) chips.push(`${b.adults} מבוגרים${b.children.length ? ` + ${b.children.length} ילדים` : ''} · ${roomsText(b.rooms)}`)
  if (upTo > 2 && b.start) chips.push(b.monthOnly ? `מתחילים ${shortDate(b.start)}` : `⁦${shortDate(b.start)} – ${shortDate(endDateOf(b))}⁩`)
  return chips
}

export const hasBrief = (t: Trip) => !!t.brief
