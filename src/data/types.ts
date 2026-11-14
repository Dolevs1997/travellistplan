export type StopKind = 'food' | 'heritage' | 'museum' | 'view' | 'nature' | 'market'
export type TransitMode = 'walk' | 'tram' | 'bus' | 'metro' | 'train'
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
}

export interface BudgetCategory {
  id: string
  label: string
  spent: number
  planned: number
}

export interface Destination {
  id: string
  name: string
  country: string
  lat: number
  lng: number
  zoom: number
}

export type ActivityKind = 'museum' | 'shopping' | 'extreme' | 'cruise' | 'tour' | 'nature' | 'show' | 'other'

export interface Lodging {
  id: string
  name: string
  area?: string
  /** ISO dates */
  checkIn: string
  checkOut: string
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
  budget: { currency: 'EUR'; categories: BudgetCategory[] }
}

export interface TripSummary {
  id: string
  name: string
  meta: string
  status: string
  tile: 'water' | 'park'
}
