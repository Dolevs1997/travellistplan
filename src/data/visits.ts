import { legsWithNights } from './brief'
import { distanceKm, estimateTransit, fromMin, toMin } from './helpers'
import { crossesSea, recommendedMode, transferOptions, type TransferMode } from './transport'
import type { Day, Destination, Stop, Trip, TripBrief, Visit } from './types'

/**
 * A visit of a few hours, without lodging (Porto Cervo between Olbia and Baja Sardinia). It takes place inside
 * an existing day: it adds no day and no night, and the night stays with the destination around it.
 */

const round5 = (m: number) => Math.ceil(m / 5) * 5

/** A rough drive: roads are longer than a straight line, about 50 km/h on average */
export const driveMinutes = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.max(10, round5(((distanceKm(a, b) * 1.3) / 50) * 60 + 5))

export interface VisitPlan {
  visit: Visit
  /** Which day of the trip (0 = first) */
  dayIndex: number
  from: Destination
  /** Where you continue to: the night's destination, or the day's next visit */
  to: Destination
  /** The transport there and onward, and how long each takes in minutes */
  modeIn: TransferMode
  modeOut: TransferMode
  driveIn: number
  driveOut: number
  /** Minutes from midnight */
  leave: number
  arrive: number
  depart: number
  reach: number
}

/** Close by, a car; otherwise what was chosen for this part of the route, else the suggested way */
function suggestedMode(b: TripBrief, a: Destination, c: Destination): TransferMode {
  const available = transferOptions(a, c).map((o) => o.mode)
  if (available.includes('רכב') && distanceKm(a, c) <= 60) return 'רכב'
  const k = b.legs.findIndex((l, i) => l.destination.id === a.id && b.legs[i + 1]?.destination.id === c.id)
  const chosen = b.transfers?.[k] as TransferMode | undefined
  return chosen && available.includes(chosen) ? chosen : recommendedMode(a, c)
}

/** The way between two places and its time. A choice this route can't use (a car across the sea) falls back */
export function travelBetween(b: TripBrief, a: Destination, c: Destination, chosen?: string) {
  const options = transferOptions(a, c)
  const opt = options.find((o) => o.mode === chosen) ?? options.find((o) => o.mode === suggestedMode(b, a, c)) ?? options[0]
  // A short hop by road or rail, in minutes: the transfer screen's half-hour steps are too coarse for it
  const short = distanceKm(a, c) <= 60 && !crossesSea(a, c) && opt.mode !== 'מעבורת'
  const minutes = short ? Math.max(driveMinutes(a, c), opt.mode === 'רכב' ? 0 : Math.round(opt.hours * 60)) : Math.round(opt.hours * 60)
  return { mode: opt.mode, minutes }
}

/** What can be chosen between two places, with the time of each */
export const travelChoices = (b: TripBrief, a: Destination, c: Destination) =>
  transferOptions(a, c).map((o) => ({ mode: o.mode, minutes: travelBetween(b, a, c, o.mode).minutes }))

const nightsBefore = (legs: TripBrief['legs'], id: string) => {
  let n = 0
  for (const l of legs) {
    n += l.nights
    if (l.destination.id === id) return n
  }
  return n
}

/** The destination you sleep at on night `n` (0 = first night) */
function nightLeg(legs: TripBrief['legs'], n: number): Destination {
  let c = 0
  for (const l of legs) {
    c += l.nights
    if (n < c) return l.destination
  }
  return legs[legs.length - 1].destination
}

export const visitDayIndex = (b: TripBrief, v: Visit) => {
  const legs = legsWithNights(b)
  const total = legs.reduce((a, l) => a + l.nights, 0)
  return Math.max(0, Math.min(total, nightsBefore(legs, v.afterId) + (v.dayShift ?? 0)))
}

/** Anchor a visit to day `d`, so it stays on that day of its part of the route when nights change */
export function onDay(b: TripBrief, v: Visit, d: number): Visit {
  const legs = legsWithNights(b)
  const after = d > 0 ? nightLeg(legs, d - 1).id : legs[0].destination.id
  return { ...v, afterId: after, dayShift: d - nightsBefore(legs, after) || undefined }
}

/** Every visit with its day, route and times, in trip order */
export function planVisits(b: TripBrief | undefined): VisitPlan[] {
  if (!b?.visits?.length || !b.legs.length) return []
  const legs = legsWithNights(b)
  const plans = b.visits
    .map((visit) => {
      const dayIndex = visitDayIndex(b, visit)
      const from = dayIndex > 0 ? nightLeg(legs, dayIndex - 1) : legs[0].destination
      const to = nightLeg(legs, dayIndex)
      return { visit, dayIndex, from, to, modeIn: 'רכב' as TransferMode, modeOut: 'רכב' as TransferMode, driveIn: 0, driveOut: 0, leave: toMin(visit.leave), arrive: 0, depart: 0, reach: 0 }
    })
    .sort((a, c) => a.dayIndex - c.dayIndex || a.leave - c.leave)
  plans.forEach((p, i) => {
    const prev = plans[i - 1]?.dayIndex === p.dayIndex ? plans[i - 1] : undefined
    if (prev) {
      p.from = prev.visit.destination
      prev.to = p.visit.destination
      const onward = travelBetween(b, prev.visit.destination, p.visit.destination, prev.visit.modeOut)
      prev.modeOut = onward.mode
      prev.driveOut = onward.minutes
      prev.reach = prev.depart + prev.driveOut
      p.leave = Math.max(p.leave, prev.depart)
    }
    const there = travelBetween(b, p.from, p.visit.destination, p.visit.modeIn)
    p.modeIn = there.mode
    p.driveIn = there.minutes
    p.arrive = p.leave + p.driveIn
    p.depart = p.arrive + Math.round(p.visit.hours * 60)
    const next = travelBetween(b, p.visit.destination, p.to, p.visit.modeOut)
    p.modeOut = next.mode
    p.driveOut = next.minutes
    p.reach = p.depart + p.driveOut
  })
  return plans
}

/** A visit already covers the move between these two destinations */
export const visitBetween = (b: TripBrief, fromId: string, toName: string) => planVisits(b).some((p) => p.visit.afterId === fromId && p.to.name === toName)

export const visitsOnDay = (b: TripBrief | undefined, dayIndex: number) => planVisits(b).filter((p) => p.dayIndex === dayIndex)
export const findVisit = (b: TripBrief | undefined, id: string | undefined) => (id ? planVisits(b).find((p) => p.visit.id === id) : undefined)

/** Where the next place in a visit starts: after its last stop, inside the visit's hours */
export function nextInVisit(day: Day, p: VisitPlan, at: { lat: number; lng: number }) {
  const inside = day.stops.filter((s) => s.visitId === p.visit.id)
  const last = inside[inside.length - 1]
  const start = last ? round5(toMin(last.end) + estimateTransit(last, at).minutes) : p.arrive
  return { start, index: day.stops.filter((s) => toMin(s.start) <= start).length, after: last?.name }
}

/* ---------- changes to the route ---------- */

export function newVisit(b: TripBrief, destination: Destination): Visit {
  // By default on the way between the last two destinations, else from the only one
  const legs = b.legs
  const after = legs[Math.max(0, legs.length - 2)].destination.id
  // With one destination: a day out in the middle of the stay, not on the day you fly home
  const dayShift = legs.length === 1 && legs[0].nights > 1 ? -Math.ceil(legs[0].nights / 2) : undefined
  return { id: `visit-${Date.now().toString(36)}`, destination, afterId: after, hours: 4, leave: '09:30', dayShift }
}

/** A stay becomes a visit: its nights go, and the visit follows the previous destination */
export function stayToVisit(b: TripBrief, i: number, v: Visit): Partial<TripBrief> {
  const t = Array.from({ length: Math.max(0, b.legs.length - 1) }, (_, k) => b.transfers?.[k] ?? '')
  if (i === b.legs.length - 1) t.splice(i - 1, 1)
  else t.splice(i - 1, 2, '')
  return { legs: b.legs.filter((_, k) => k !== i), transfers: t, visits: [...visitsWithoutLeg(b, i), v] }
}

/** A visit becomes a stay of one night, right after the destination it follows */
export function visitToStay(b: TripBrief, v: Visit): Partial<TripBrief> {
  const at = Math.max(0, b.legs.findIndex((l) => l.destination.id === v.afterId)) + 1
  const legs = [...b.legs.slice(0, at), { destination: v.destination, nights: 1 }, ...b.legs.slice(at)]
  const t = Array.from({ length: Math.max(0, b.legs.length - 1) }, (_, k) => b.transfers?.[k] ?? '')
  // The way there and onward become the two transfers around the new stay
  t.splice(at - 1, at < b.legs.length ? 1 : 0, v.modeIn ?? '', ...(at < b.legs.length ? [v.modeOut ?? ''] : []))
  return { legs, transfers: t.slice(0, legs.length - 1), visits: (b.visits ?? []).filter((x) => x.id !== v.id) }
}

/** Visits that followed a removed destination now follow the one before it */
export function visitsWithoutLeg(b: TripBrief, i: number) {
  const gone = b.legs[i]?.destination.id
  const instead = b.legs[i - 1]?.destination.id ?? b.legs[i + 1]?.destination.id
  return (b.visits ?? []).flatMap((v) => (v.afterId !== gone ? [v] : instead ? [{ ...v, afterId: instead, dayShift: undefined }] : []))
}

export const visitsWithReplacedLeg = (b: TripBrief, i: number, d: Destination) =>
  (b.visits ?? []).map((v) => (v.afterId === b.legs[i]?.destination.id ? { ...v, afterId: d.id } : v))

/* ---------- keeping the schedule in step ---------- */

const byStart = (a: Stop, b: Stop) => toMin(a.start) - toMin(b.start)

/** Travel between stops, after some were moved in or out of the day */
function relinked(stops: Stop[]) {
  return stops.map((s, i) => {
    const next = stops[i + 1]
    if (!next) {
      const copy = { ...s }
      delete copy.transitToNext
      return copy
    }
    return s.transitToNext && s.visitId === next.visitId ? s : { ...s, transitToNext: estimateTransit(s, next) }
  })
}

/**
 * When a visit moves to another day or time its stops go with it. When it's removed they stay in the day as
 * regular stops.
 */
export function syncVisitStops(trip: Trip, next: TripBrief): Day[] {
  const before = new Map(planVisits(trip.brief).map((p) => [p.visit.id, p]))
  const after = new Map(planVisits(next).map((p) => [p.visit.id, p]))
  if (!before.size) return trip.days
  const moving: { stop: Stop; to: number }[] = []
  const days = trip.days.map((d, i) => {
    const keep: Stop[] = []
    let changed = false
    for (const s of d.stops) {
      if (!s.visitId) {
        keep.push(s)
        continue
      }
      const was = before.get(s.visitId)
      const now = after.get(s.visitId)
      if (!now) {
        const free = { ...s }
        delete free.visitId
        keep.push(free)
        changed = true
      } else if (was && (now.dayIndex !== i || now.arrive !== was.arrive)) {
        const delta = now.arrive - was.arrive
        moving.push({ stop: { ...s, start: fromMin(toMin(s.start) + delta), end: fromMin(toMin(s.end) + delta) }, to: Math.min(now.dayIndex, trip.days.length - 1) })
        changed = true
      } else keep.push(s)
    }
    return changed ? { ...d, stops: keep } : d
  })
  if (!moving.length) return days.map((d, i) => (d === trip.days[i] ? d : { ...d, stops: relinked(d.stops) }))
  return days.map((d, i) => {
    const incoming = moving.filter((m) => m.to === i).map((m) => m.stop)
    if (!incoming.length && d === trip.days[i]) return d
    return { ...d, stops: relinked([...d.stops, ...incoming].sort(byStart)) }
  })
}

/** Reflow a day's regular stops; a visit's stops keep their times, inside the visit */
export function mergeKeepingVisits(free: Stop[], pinned: Stop[]) {
  return [...free, ...pinned].sort(byStart)
}
