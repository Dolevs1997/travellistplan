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
      hours: 0,
      low: 0,
      high: 0,
      note: 'רק אם יש קו בקטע הזה – בדקו באתר',
      url: 'https://www.directferries.com/',
    },
  ]
  // A short hop isn't worth flying; a very long one isn't worth a bus
  return options.filter((o) => !(o.mode === 'טיסה' && km < 250) && !(o.mode === 'אוטובוס' && km > 1500))
}

/** The suggested mode for a leg */
export function recommendedMode(a: Destination, b: Destination): TransferMode {
  const km = distanceKm(a, b) * 1.2
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
