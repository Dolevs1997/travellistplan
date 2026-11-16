import type { Day, Stop, StopKind, StopStatus, Transit, TransitMode, Trip } from './types'

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const fromMin = (min: number) => {
  const clamped = Math.max(0, Math.min(min, 23 * 60 + 59))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Times step by 5 minutes so travel and visit lengths can be fine-tuned */
const roundUpTo5 = (min: number) => Math.ceil(min / 5) * 5

export const DEFAULT_DAY_START = '10:00'
export const DEFAULT_DAY_END = '18:00'
export const dayStart = (day: Day) => day.startTime ?? DEFAULT_DAY_START
export const dayEnd = (day: Day) => day.endTime ?? DEFAULT_DAY_END

export function dayIndexOf(trip: Trip, dayId: string) {
  return trip.days.findIndex((d) => d.id === dayId)
}

export function stopStatus(trip: Trip, dayId: string, stopId: string): StopStatus {
  if (!trip.progress) return 'upcoming'
  const progressDay = dayIndexOf(trip, trip.progress.dayId)
  const thisDay = dayIndexOf(trip, dayId)
  if (thisDay < progressDay) return 'done'
  if (thisDay > progressDay) return 'upcoming'
  const stops = trip.days[thisDay].stops
  const cur = stops.findIndex((s) => s.id === trip.progress?.stopId)
  const idx = stops.findIndex((s) => s.id === stopId)
  if (cur === -1) return 'upcoming'
  if (idx < cur) return 'done'
  if (idx === cur) return 'current'
  return 'upcoming'
}

export function isPastDay(trip: Trip, dayId: string) {
  if (!trip.progress) return false
  return dayIndexOf(trip, dayId) < dayIndexOf(trip, trip.progress.dayId)
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Empty days for a new trip, starting on `startIso`. */
export function emptyDays(tripId: string, city: string, startIso: string, count: number): Day[] {
  const start = new Date(`${startIso}T12:00:00`)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { id: `${tripId}-d${i + 1}`, date: isoDate(d), city, title: city, stops: [], suggestions: [] }
  })
}

export const isoInDays = (n: number, from = new Date()) => {
  const d = new Date(from)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export const MAX_TRIP_DAYS = 30

/** Number of days from departure to return, both included (0 when the range is invalid). */
export function tripLength(startIso: string, endIso: string) {
  if (!startIso || !endIso) return 0
  const ms = new Date(`${endIso}T12:00:00`).getTime() - new Date(`${startIso}T12:00:00`).getTime()
  const n = Math.round(ms / 86_400_000) + 1
  return n > 0 ? n : 0
}

/** All ISO dates from start to end, inclusive. */
export function isoRange(startIso: string, endIso: string) {
  const n = tripLength(startIso, endIso)
  const start = new Date(`${startIso}T12:00:00`)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return isoDate(d)
  })
}

/** "26.11" */
export const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d}.${m}`
}

export interface FreeSlot {
  start: string
  end: string
  wholeDay: boolean
}

/** Unplanned time left in the day (at least an hour before the day's end), if any */
export function freeSlot(day: Day): FreeSlot | null {
  const end = dayEnd(day)
  if (day.stops.length === 0) return { start: dayStart(day), end, wholeDay: true }
  const last = day.stops[day.stops.length - 1]
  if (toMin(last.end) <= toMin(end) - 60) return { start: last.end, end, wholeDay: false }
  return null
}

export const slotPartLabel = (start: string) => {
  const m = toMin(start)
  if (m < 12 * 60) return 'הבוקר'
  if (m < 17 * 60) return 'אחר הצהריים'
  return 'הערב'
}

/** "10:00–11:30" isolated as LTR so it doesn't flip inside Hebrew text. */
export const timeRange = (a: string, b: string) => `⁦${a}–${b}⁩`

const MODE_LABEL: Record<TransitMode, string> = {
  walk: 'הליכה',
  tram: 'טראם',
  bus: 'אוטובוס',
  metro: 'מטרו',
  train: 'רכבת',
  car: 'נסיעה',
}

export const transitLabel = (t: Transit) =>
  `${MODE_LABEL[t.mode]}${t.line ? ` ${t.line}` : ''} · ${t.minutes} דק׳`

export function durationLabel(min: number) {
  if (min < 60) return `${min} דק׳`
  if (min === 60) return 'שעה'
  if (min === 90) return 'שעה וחצי'
  if (min === 120) return 'שעתיים'
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h}:${String(rest).padStart(2, '0')} שעות` : `${h} שעות`
}

export const stopDuration = (s: Stop) => toMin(s.end) - toMin(s.start)

const dm = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d}.${m}`
}

export const dayChipLabel = (day: Day, index: number) =>
  day.stops.length === 0 ? `יום ${index + 1} · פנוי` : `יום ${index + 1} · ${dm(day.date)}`

export const formatDayLong = (iso: string) =>
  new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`))

export function tripRange(trip: Trip) {
  const first = trip.days[0].date
  const last = trip.days[trip.days.length - 1].date
  return `${dm(first)} – ${dm(last)}.${last.slice(0, 4)}`
}

export function daysUntil(iso: string, now = new Date()) {
  const start = new Date(`${iso}T00:00:00`)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((start.getTime() - today.getTime()) / 86_400_000)
}

export function countdownLabel(days: number) {
  if (days > 1) return `בעוד ${days} ימים`
  if (days === 1) return 'מחר'
  if (days === 0) return 'היום'
  return 'בטיול עכשיו'
}

export const tripStats = (trip: Trip) => ({
  stops: trip.days.reduce((n, d) => n + d.stops.length, 0),
  cities: new Set(trip.days.map((d) => d.city)).size,
  unplanned: trip.days.filter((d) => d.stops.length === 0).length,
})

/** Re-flow a day's stop times: keep each stop's duration, start after the previous one plus travel. */
export function reflowFrom(stops: Stop[], startMin: number): Stop[] {
  let t = startMin
  return stops.map((s, i) => {
    const dur = stopDuration(s)
    const next = { ...s, start: fromMin(t), end: fromMin(t + dur) }
    t = roundUpTo5(t + dur + (s.transitToNext?.minutes ?? 15))
    if (i === stops.length - 1) delete next.transitToNext
    return next
  })
}

export const nextStartAfter = (stops: Stop[], travelMin: number, dayStartMin = toMin(DEFAULT_DAY_START)) =>
  stops.length === 0 ? dayStartMin : roundUpTo5(toMin(stops[stops.length - 1].end) + travelMin)

export const TRANSIT_MODES: TransitMode[] = ['walk', 'metro', 'bus', 'tram', 'train', 'car']
export const modeLabel = (m: TransitMode) => MODE_LABEL[m]

/** Straight-line distance in km */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** Rough travel estimate between two places: walk when close, otherwise drive/ride. Editable by the user. */
export function estimateTransit(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Transit {
  const km = distanceKm(a, b) * 1.3 // streets aren't straight lines
  if (km <= 2.5) return { mode: 'walk', minutes: Math.max(5, roundUpTo5((km / 4.5) * 60)) } // up to ~30 min on foot
  return { mode: 'car', minutes: Math.max(10, roundUpTo5((km / (km > 30 ? 60 : 22)) * 60 + 5)) }
}

/** Suggested visit length per kind of place, in minutes */
export const DEFAULT_VISIT: Record<StopKind, number> = {
  museum: 120,
  heritage: 60,
  view: 30,
  nature: 60,
  beach: 180,
  market: 60,
  food: 75,
  shopping: 90,
}

export const directionsUrl = (s: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`
