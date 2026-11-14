import type { Day, Stop, StopStatus, Transit, TransitMode, Trip } from './types'

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

const roundUpTo15 = (min: number) => Math.ceil(min / 15) * 15

const DAY_END = '18:00'
const FREE_IF_ENDS_BEFORE = '16:00'

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

export interface FreeSlot {
  start: string
  end: string
  wholeDay: boolean
}

export function freeSlot(day: Day): FreeSlot | null {
  if (day.stops.length === 0) return { start: '10:00', end: DAY_END, wholeDay: true }
  const last = day.stops[day.stops.length - 1]
  if (toMin(last.end) < toMin(FREE_IF_ENDS_BEFORE)) return { start: last.end, end: DAY_END, wholeDay: false }
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
    t = roundUpTo15(t + dur + (s.transitToNext?.minutes ?? 15))
    if (i === stops.length - 1) delete next.transitToNext
    return next
  })
}

export const nextStartAfter = (stops: Stop[], travelMin: number) =>
  stops.length === 0 ? toMin('10:00') : roundUpTo15(toMin(stops[stops.length - 1].end) + travelMin)

export const directionsUrl = (s: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`
