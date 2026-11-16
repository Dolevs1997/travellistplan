import type { Action } from '../state/TripStore'
import type { Destination, PlaceInfo, StopKind, Trip } from './types'
import { dayDestination, shortDate } from './helpers'

/**
 * Changes the AI assistant proposes. Nothing is applied until the user approves the whole proposal
 * in the chat; then `planActions` turns each operation into ordinary store actions.
 * The same shape is the input schema of the `propose_trip_changes` tool (netlify/functions/chat.mts).
 */
export type PlanOp =
  | { op: 'setup_trip'; start_date: string; end_date: string; name: string; country: string; lat: number; lng: number; is_country?: boolean }
  | { op: 'set_destination'; day: number; to_day: number; name: string; country: string; lat: number; lng: number; is_country?: boolean }
  | { op: 'add_stop'; day: number; name: string; kind: StopKind; lat: number; lng: number; minutes?: number; note?: string }
  | { op: 'remove_stop'; day: number; name: string }
  | { op: 'clear_day'; day: number }
  | { op: 'set_day_hours'; day: number; start: string; end: string }
  | { op: 'add_lodging'; name: string; area?: string; check_in: string; check_out: string }
  | { op: 'add_restaurant'; name: string; cuisine?: string; day?: number }

export interface Proposal {
  summary: string
  operations: PlanOp[]
}

const KINDS: StopKind[] = ['food', 'heritage', 'museum', 'view', 'nature', 'beach', 'market', 'shopping', 'street']
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isTime = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const isDay = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 60
const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0
const isLatLng = (o: Record<string, unknown>) => isNum(o.lat) && isNum(o.lng) && Math.abs(o.lat as number) <= 90 && Math.abs(o.lng as number) <= 180

/** Checks the model's tool input before showing it: drops anything malformed instead of applying it */
export function parseProposal(input: unknown): Proposal | null {
  if (!input || typeof input !== 'object') return null
  const { summary, operations } = input as { summary?: unknown; operations?: unknown }
  if (!Array.isArray(operations)) return null
  const ops = operations.filter((raw): raw is PlanOp => {
    const o = raw as Record<string, unknown>
    switch (o?.op) {
      case 'setup_trip':
        return isDate(o.start_date) && isDate(o.end_date) && isText(o.name) && isLatLng(o)
      case 'set_destination':
        return isDay(o.day) && isDay(o.to_day) && isText(o.name) && isLatLng(o)
      case 'add_stop':
        return isDay(o.day) && isText(o.name) && KINDS.includes(o.kind as StopKind) && isLatLng(o)
      case 'remove_stop':
        return isDay(o.day) && isText(o.name)
      case 'clear_day':
        return isDay(o.day)
      case 'set_day_hours':
        return isDay(o.day) && isTime(o.start) && isTime(o.end)
      case 'add_lodging':
        return isText(o.name) && isDate(o.check_in) && isDate(o.check_out)
      case 'add_restaurant':
        return isText(o.name)
      default:
        return false
    }
  })
  if (!ops.length) return null
  return { summary: typeof summary === 'string' ? summary : '', operations: ops }
}

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

function destinationOf(o: { name: string; country: string; lat: number; lng: number; is_country?: boolean }): Destination {
  return {
    id: `ai-${slug(o.name)}`,
    name: o.name,
    country: o.is_country ? o.name : o.country,
    lat: o.lat,
    lng: o.lng,
    zoom: o.is_country ? 5 : 12,
    ...(o.is_country ? { kind: 'country' as const } : {}),
  }
}

/** Loose name match for removing a stop ("Belem Tower" vs "Torre de Belém") */
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const sameName = (a: string, b: string) => {
  const x = norm(a)
  const y = norm(b)
  return x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y))
}

/** One operation -> store actions, against the trip as it is at that moment */
export function planActions(trip: Trip, op: PlanOp): Action[] {
  const dayAt = (n: number) => trip.days[n - 1]
  switch (op.op) {
    case 'setup_trip':
      return [
        {
          type: 'setupTrip',
          destination: destinationOf(op),
          startDate: op.start_date,
          endDate: op.end_date < op.start_date ? op.start_date : op.end_date,
          extras: { lodgings: [], restaurants: [], activities: [] },
        },
      ]
    case 'set_destination': {
      const ids = trip.days.slice(Math.min(op.day, op.to_day) - 1, Math.max(op.day, op.to_day)).map((d) => d.id)
      return ids.length ? [{ type: 'setDaysDestination', dayIds: ids, destination: destinationOf(op) }] : []
    }
    case 'add_stop': {
      const day = dayAt(op.day)
      if (!day) return []
      const place: PlaceInfo = {
        source: 'ai',
        ref: newId('ai'),
        name: op.name,
        kind: op.kind,
        lat: op.lat,
        lng: op.lng,
        description: op.note,
      }
      return [{ type: 'addPlace', dayId: day.id, place, minutes: op.minutes && op.minutes > 0 ? Math.min(op.minutes, 600) : undefined }]
    }
    case 'remove_stop': {
      const stop = dayAt(op.day)?.stops.find((s) => sameName(s.name, op.name))
      return stop ? [{ type: 'removeStop', stopId: stop.id }] : []
    }
    case 'clear_day':
      return (dayAt(op.day)?.stops ?? []).map((s) => ({ type: 'removeStop', stopId: s.id }) as Action)
    case 'set_day_hours': {
      const day = dayAt(op.day)
      return day && op.start < op.end ? [{ type: 'setDayHours', dayId: day.id, start: op.start, end: op.end }] : []
    }
    case 'add_lodging':
      return [
        {
          type: 'addLodging',
          item: { id: newId('lodging'), name: op.name, area: op.area, checkIn: op.check_in, checkOut: op.check_out < op.check_in ? op.check_in : op.check_out },
        },
      ]
    case 'add_restaurant':
      return [{ type: 'addRestaurant', item: { id: newId('rest'), name: op.name, cuisine: op.cuisine, dayId: op.day ? dayAt(op.day)?.id : undefined } }]
  }
}

const dayLabel = (trip: Trip, n: number) => {
  const d = trip.days[n - 1]
  return d ? `יום ${n} (⁦${shortDate(d.date)}⁩)` : `יום ${n}`
}

/** Hebrew line for the approval card */
export function describeOp(trip: Trip, op: PlanOp): string {
  switch (op.op) {
    case 'setup_trip':
      return `${trip.days.length ? 'בניית הטיול מחדש (הימים הקיימים יוחלפו)' : 'יצירת הטיול'}: ${op.name}, ⁦${shortDate(op.start_date)} – ${shortDate(op.end_date)}⁩`
    case 'set_destination':
      return op.day === op.to_day
        ? `${dayLabel(trip, op.day)} ב${op.name}`
        : `ימים ⁦${op.day}–${op.to_day}⁩ ב${op.name}`
    case 'add_stop':
      return `הוספה ל${dayLabel(trip, op.day)}: ${op.name}${op.minutes ? ` · ${op.minutes} דק׳` : ''}`
    case 'remove_stop':
      return `הסרה מ${dayLabel(trip, op.day)}: ${op.name}`
    case 'clear_day':
      return `ניקוי כל המקומות ב${dayLabel(trip, op.day)}`
    case 'set_day_hours':
      return `שעות ${dayLabel(trip, op.day)}: ⁦${op.start}–${op.end}⁩`
    case 'add_lodging':
      return `לינה: ${op.name}${op.area ? `, ${op.area}` : ''} · ⁦${shortDate(op.check_in)} – ${shortDate(op.check_out)}⁩`
    case 'add_restaurant':
      return `מסעדה שמורה: ${op.name}${op.cuisine ? ` (${op.cuisine})` : ''}${op.day ? ` · ${dayLabel(trip, op.day)}` : ''}`
  }
}

/** The trip as the assistant sees it: plain text, sent with every message */
export function tripContext(trip: Trip | null, location: { lat: number; lng: number } | null) {
  const today = new Date().toISOString().slice(0, 10)
  const lines = [`Today: ${today}.`]
  if (location) lines.push(`The user's current location (shared just now): ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}.`)
  if (!trip || !trip.days.length) {
    lines.push('The user has no trip with dates yet. To build one, propose a setup_trip operation first.')
    return lines.join('\n')
  }
  lines.push(`Trip: "${trip.name}", ${trip.days[0].date} to ${trip.days[trip.days.length - 1].date} (${trip.days.length} days).`)
  trip.days.forEach((d, i) => {
    const dest = dayDestination(trip, d)
    const where = dest ? `${dest.name}${dest.kind === 'country' ? ' (whole country)' : dest.country ? `, ${dest.country}` : ''}` : d.city
    const hours = `${d.startTime ?? '10:00'}-${d.endTime ?? '18:00'}`
    const stops = d.stops.length ? d.stops.map((s) => `${s.start}-${s.end} ${s.name} [${s.kind}]`).join('; ') : 'nothing planned'
    lines.push(`Day ${i + 1} (${d.date}) in ${where}, hours ${hours}: ${stops}`)
  })
  const lodgings = trip.lodgings ?? []
  if (lodgings.length) lines.push(`Lodging: ${lodgings.map((l) => `${l.name}${l.area ? ` (${l.area})` : ''} ${l.checkIn} to ${l.checkOut}`).join('; ')}`)
  const rests = trip.restaurants ?? []
  if (rests.length) lines.push(`Saved restaurants: ${rests.map((r) => r.name).join(', ')}`)
  return lines.join('\n')
}

/* ---------- clarifying questions (ask_user_questions tool) ---------- */

export interface Question {
  id: string
  question: string
  options: string[]
  multiple: boolean
}

export function parseQuestions(input: unknown): Question[] {
  const qs = (input as { questions?: unknown })?.questions
  if (!Array.isArray(qs)) return []
  return qs
    .filter((q) => q && typeof q.question === 'string' && q.question.trim())
    .slice(0, 8)
    .map((q, i) => ({
      id: typeof q.id === 'string' && q.id ? q.id : `q${i + 1}`,
      question: q.question as string,
      options: Array.isArray(q.options) ? (q.options as unknown[]).filter((o): o is string => typeof o === 'string' && !!o.trim()).slice(0, 8) : [],
      multiple: q.multiple === true,
    }))
}
