export type StopKind = 'food' | 'heritage' | 'museum' | 'view' | 'nature' | 'beach' | 'market' | 'shopping' | 'street'
export type TransitMode = 'walk' | 'tram' | 'bus' | 'metro' | 'train' | 'car'

/**
 * A real-world place from a data source (Wikidata/Wikipedia or OpenStreetMap search today;
 * a Google Places id can be added later as another source).
 */
export interface PlaceInfo {
  /** 'ai': added by the chat assistant after the user approved it; 'google': from the add-places recommendations */
  source: 'wikidata' | 'osm' | 'ai' | 'google'
  /** Wikidata id (Q…), OSM id ("node/123") or Google place id */
  ref: string
  name: string
  kind: StopKind
  /** Every category the place fits (a market hall is a market and a mall); `kind` is the main one */
  kinds?: StopKind[]
  lat: number
  lng: number
  /** Short line like "מוזיאון לאמנות ברומא" */
  description?: string
  /** Image URL and its Wikimedia Commons page (for credit) */
  image?: string
  imagePage?: string
  /** Wikipedia article used for the summary and facts */
  article?: { lang: 'he' | 'en'; title: string }
  address?: string
  /** Popularity used for ranking (number of Wikipedia language editions) */
  popularity?: number
  /** From OpenStreetMap when known: raw opening_hours, website, phone, cuisine */
  openingHours?: string
  website?: string
  phone?: string
  cuisine?: string
  /** From Google: average rating, number of reviews, opening hours per weekday (Monday first) and its Maps page */
  rating?: number
  ratingCount?: number
  hoursText?: string[]
  mapsUrl?: string
}
export type StopStatus = 'done' | 'current' | 'upcoming'

export interface Transit {
  mode: TransitMode
  minutes: number
  line?: string
}

export interface Stop {
  id: string
  name: string
  area: string
  lat: number
  lng: number
  /** "HH:MM" */
  start: string
  end: string
  kind: StopKind
  heritage?: boolean
  needsBooking?: boolean
  booked?: boolean
  hours?: string
  note?: string
  /** How to get from this stop to the next one */
  transitToNext?: Transit
  /** Photo, summary source etc. for places picked from recommendations or search */
  info?: PlaceInfo
}

export interface Suggestion {
  id: string
  name: string
  lat: number
  lng: number
  kind: StopKind
  area: string
  travel: Transit
  durationMin: number
}

export interface Day {
  id: string
  /** ISO date "YYYY-MM-DD" */
  date: string
  city: string
  title: string
  stops: Stop[]
  suggestions: Suggestion[]
  /** Planned hours for the day, "HH:MM" (default 10:00–18:00) */
  startTime?: string
  endTime?: string
  /** Where this day takes place, when the trip has several destinations (else the trip's) */
  destination?: Destination
}

export interface BudgetCategory {
  id: string
  label: string
  spent: number
  planned: number
}

/** One expense. Amounts are kept in euros (the trip's budget currency); the screen can show shekels */
export interface Expense {
  id: string
  title: string
  categoryId: string
  amount: number
  /** How many (tickets ×2) */
  qty?: number
  /** ISO date and "HH:MM"; a prepaid expense (flights, a hotel) may have neither */
  date?: string
  time?: string
  /** The stop it was spent at */
  stopId?: string
  /** Paid before the trip */
  prepaid?: boolean
  /** A small photo of the receipt (JPEG data URL) */
  receipt?: string
  createdAt: number
}

export interface Destination {
  id: string
  name: string
  country: string
  lat: number
  lng: number
  zoom: number
  /** A whole country: recommendations then start by picking a city or region inside it */
  kind?: 'country'
  /** ISO 3166-1 alpha-2, for searching places inside the country */
  countryCode?: string
}

export type ActivityKind = 'museum' | 'shopping' | 'extreme' | 'cruise' | 'tour' | 'nature' | 'show' | 'other'

export interface Lodging {
  id: string
  name: string
  area?: string
  /** ISO dates */
  checkIn: string
  checkOut: string
  /** Where it is, when picked from the lodging map */
  lat?: number
  lng?: number
  kind?: 'hotel' | 'guest' | 'hostel' | 'apartment'
  /** The lodging-map place it was picked from (to mark it in the list) */
  placeId?: string
  /** Booking number, notes, check-in time… */
  note?: string
}

export interface SavedRestaurant {
  id: string
  name: string
  cuisine?: string
  /** Optional day of the trip it's planned for */
  dayId?: string
}

export interface Activity {
  id: string
  name: string
  kind: ActivityKind
  dayId?: string
}

export interface TripExtras {
  lodgings: Lodging[]
  restaurants: SavedRestaurant[]
  activities: Activity[]
}

export interface RentalChoice {
  company: string
  pickup: string
  dropoff: string
}

/** The answers of the new-trip wizard, kept on the trip (see src/data/brief.ts) */
export interface TripBrief {
  /** Destinations in order. With several, `nights` sets the length; with one, the dates do */
  legs: { destination: Destination; nights: number }[]
  multi: boolean
  adults: number
  /** Age of each child */
  children: number[]
  rooms: number
  start: string
  end: string
  /** Only the month is known: `start` is a placeholder inside that month */
  monthOnly: boolean
  flightsBooked: boolean
  pace: 'relaxed' | 'balanced' | 'packed'
  kosher: boolean
  mustSee: string[]
  interests: string[]
  localTransport: string[]
  /** Keep walks between stops short (about 15 minutes) */
  shortWalks?: boolean
  intercity: string[]
  tier: 'budget' | 'comfort' | 'premium' | 'custom'
  customBudget?: number
  /** Flight price per person (ILS), when the user knows it */
  flightPerPerson?: number
  /** How to get from each destination to the next: transfers[i] is leg i → leg i+1 */
  transfers?: string[]
  /** Ticket details the user already has for a transfer (same index as `transfers`) */
  transferTickets?: string[]
  /** How to get around inside each destination, by destination id (falls back to localTransport) */
  cityTransport?: Record<string, string>
  /** Chosen rental car per destination id */
  rentals?: Record<string, RentalChoice>
  /** "I already have a route": the user builds the days themselves after the wizard */
  selfBuild?: boolean
}

export interface Trip {
  id: string
  name: string
  /** Places to stay, saved restaurants and activities (older saved trips may lack them) */
  lodgings?: Lodging[]
  restaurants?: SavedRestaurant[]
  activities?: Activity[]
  /** Not set yet for a brand-new trip: the map then shows no city */
  destination: Destination | null
  days: Day[]
  /** Demo "now": which stop the traveller is currently at (none before the trip starts) */
  progress?: { dayId: string; stopId: string }
  /** What the user said in the new-trip wizard */
  brief?: TripBrief
  budget: { currency: 'EUR'; categories: BudgetCategory[] }
  /** Itemized expenses (older trips may only have per-category totals in `budget`) */
  expenses?: Expense[]
}

