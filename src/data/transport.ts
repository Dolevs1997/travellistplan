import { priceLevel } from './brief'
import { distanceKm } from './helpers'
import type { Destination } from './types'

/**
 * Rough estimates for moving between destinations and renting a car. These are models from
 * distance and the country's price level, not live timetables or quotes: every screen that
 * shows them says so, and links to the operator's own site for the real price.
 */

export type TransferMode = 'רכבת' | 'אוטובוס' | 'טיסה' | 'רכב' | 'מעבורת'
export const TRANSFER_MODES: TransferMode[] = ['רכבת', 'אוטובוס', 'טיסה', 'רכב', 'מעבורת']

export interface TransferOption {
  mode: TransferMode
  hours: number
  /** Euros per person (per car for "רכב") */
  low: number
  high: number
  perCar?: boolean
  note: string
  /** Where to check times and book */
  url: string
}

const roundHalf = (h: number) => Math.max(0.5, Math.round(h * 2) / 2)
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

export const hoursLabel = (h: number) => (h < 1 ? `כ-${Math.round(h * 60)} דק׳` : h === 1 ? 'כשעה' : h === 2 ? 'כשעתיים' : `כ-${h} שעות`)

const mapsDir = (a: Destination, b: Destination, mode: 'transit' | 'driving') =>
  `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`

/** Popular islands as rough boxes [south, north, west, east], to tell when a trip has to cross the sea */
const ISLANDS: [number, number, number, number][] = [
  [38.8, 41.33, 8.0, 10.0], // Sardinia
  [41.34, 43.1, 8.5, 9.65], // Corsica
  [36.6, 38.4, 12.3, 15.6], // Sicily
  [35.75, 36.1, 14.1, 14.6], // Malta
  [34.8, 35.7, 23.4, 26.4], // Crete
  [34.5, 35.75, 32.2, 34.65], // Cyprus
  [35.85, 36.5, 27.6, 28.3], // Rhodes
  [39.2, 39.85, 19.6, 20.2], // Corfu
  [36.3, 36.5, 25.3, 25.5], // Santorini
  [37.4, 37.5, 25.3, 25.5], // Mykonos
  [39.2, 40.0, 2.3, 3.5], // Mallorca
  [39.8, 40.1, 3.7, 4.4], // Menorca
  [38.6, 39.15, 1.1, 1.7], // Ibiza and Formentera
  [27.5, 29.5, -18.2, -13.3], // Canary Islands
  [32.6, 32.9, -17.3, -16.6], // Madeira
  [63.2, 66.6, -24.6, -13.4], // Iceland
]
const islandOf = (d: { lat: number; lng: number }) => ISLANDS.findIndex(([s, n, w, e]) => d.lat >= s && d.lat <= n && d.lng >= w && d.lng <= e)
/** One end is on a known island and the other isn't on the same one */
export const crossesSea = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => islandOf(a) !== islandOf(b)

export function transferOptions(a: Destination, b: Destination): TransferOption[] {
  const km = distanceKm(a, b) * 1.2 // roads and rails aren't straight
  const level = (priceLevel(a) + priceLevel(b)) / 2
  const flightsUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(`flights from ${a.name} to ${b.name}`)}`
  const options: TransferOption[] = [
    {
      mode: 'רכבת',
      hours: roundHalf(km / 110 + 0.3),
      low: round5((0.06 * km + 6) * level),
      high: round5((0.1 * km + 10) * level),
      note: 'מתחנה מרכזית לתחנה מרכזית',
      url: mapsDir(a, b, 'transit'),
    },
    {
      mode: 'אוטובוס',
      hours: roundHalf(km / 75 + 0.3),
      low: round5((0.03 * km + 3) * level),
      high: round5((0.06 * km + 6) * level),
      note: 'בדרך כלל הכי זול',
      url: mapsDir(a, b, 'transit'),
    },
    {
      mode: 'טיסה',
      hours: roundHalf(km / 700 + 0.5),
      low: round5(40 + 0.04 * km),
      high: round5(80 + 0.08 * km),
      note: 'זמן באוויר, בלי הזמן בשדות',
      url: flightsUrl,
    },
    {
      mode: 'רכב',
      hours: roundHalf(km / 85),
      low: round5(0.1 * km * level),
      high: round5(0.16 * km * level),
      perCar: true,
      note: 'דלק ואגרות',
      url: mapsDir(a, b, 'driving'),
    },
    {
      mode: 'מעבורת',
      hours: roundHalf(km / 40 + 0.5),
      low: 0,
      high: 0,
      note: 'רק אם יש קו בקטע הזה – בדקו באתר',
      url: 'https://www.directferries.com/',
    },
  ]
  // Across the sea only a plane or a ferry gets you there
  const sea = crossesSea(a, b)
  // A short hop isn't worth flying; a very long one isn't worth a bus
  return options.filter((o) => (!sea || o.mode === 'טיסה' || o.mode === 'מעבורת') && !(o.mode === 'טיסה' && km < 250) && !(o.mode === 'אוטובוס' && km > 1500))
}

/** The suggested mode for a leg */
export function recommendedMode(a: Destination, b: Destination): TransferMode {
  const km = distanceKm(a, b) * 1.2
  if (crossesSea(a, b)) return km >= 250 ? 'טיסה' : 'מעבורת'
  return km > 700 ? 'טיסה' : 'רכבת'
}

export const compareUrl = (a: Destination, b: Destination) => `https://www.rome2rio.com/s/${encodeURIComponent(a.name)}/${encodeURIComponent(b.name)}`

/* ---------- car rental ---------- */

export interface RentalCompany {
  id: string
  name: string
  url: string
  factor: number
  car: { small: string; family: string }
}

export const RENTAL_COMPANIES: RentalCompany[] = [
  { id: 'sixt', name: 'Sixt', url: 'https://www.sixt.com/', factor: 1.08, car: { small: 'Peugeot 208 או דומה', family: 'VW Tiguan או דומה' } },
  { id: 'europcar', name: 'Europcar', url: 'https://www.europcar.com/', factor: 1, car: { small: 'Renault Clio או דומה', family: 'Peugeot 3008 או דומה' } },
  { id: 'hertz', name: 'Hertz', url: 'https://www.hertz.com/', factor: 1.15, car: { small: 'VW Polo או דומה', family: 'Toyota RAV4 או דומה' } },
  { id: 'avis', name: 'Avis', url: 'https://www.avis.com/', factor: 1.12, car: { small: 'Opel Corsa או דומה', family: 'Skoda Kodiaq או דומה' } },
]

export const RENTAL_COMPARE_URL = 'https://www.rentalcars.com/'

export interface RentalFilters {
  automatic: boolean
  family: boolean
  fullInsurance: boolean
  freeCancel: boolean
}

/** Euros per day, estimated */
export function rentalPerDay(dest: Destination, c: RentalCompany, f: RentalFilters) {
  const base = 38 * priceLevel(dest) * c.factor
  const mult = (f.automatic ? 1.15 : 1) * (f.family ? 1.35 : 1) * (f.fullInsurance ? 1.3 : 1) * (f.freeCancel ? 1.05 : 1)
  return Math.round(base * mult)
}
