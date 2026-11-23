import { dayStart, estimateTransit, fromMin, stopDuration, toMin } from './helpers'
import type { Day, Stop } from './types'

/** Morning, afternoon and evening of a day: how the route screen groups places and where a new one goes */

export type DayPart = 'morning' | 'noon' | 'evening'

export const PARTS: { id: DayPart; label: string; hours: string; to: string }[] = [
  { id: 'morning', label: 'בוקר', hours: 'עד 12:00', to: 'לבוקר' },
  { id: 'noon', label: 'צהריים', hours: '⁦12:00–17:00⁩', to: 'לצהריים' },
  { id: 'evening', label: 'ערב', hours: 'מ-17:00', to: 'לערב' },
]

const NOON = 12 * 60
const EVENING = 17 * 60
const NIGHT = 23 * 60

export const partOf = (hhmm: string): DayPart => {
  const m = toMin(hhmm)
  return m < NOON ? 'morning' : m < EVENING ? 'noon' : 'evening'
}

const partStart = (day: Day, part: DayPart) => (part === 'morning' ? Math.min(toMin(dayStart(day)), NOON - 60) : part === 'noon' ? NOON : EVENING)
const partEnd = (part: DayPart) => (part === 'morning' ? NOON : part === 'noon' ? EVENING : NIGHT)
const round5 = (m: number) => Math.ceil(m / 5) * 5
const byStart = (a: Stop, b: Stop) => toMin(a.start) - toMin(b.start)

/** When something new would start in this part: after what's already there, with time to get there */
export function nextInPart(day: Day, part: DayPart, at?: { lat: number; lng: number }) {
  const stops = [...day.stops].sort(byStart)
  const from = partStart(day, part)
  const until = partEnd(part)
  const before = stops.filter((s) => toMin(s.start) < until).pop()
  const start = before && toMin(before.end) > from - 60 ? Math.max(from, round5(toMin(before.end) + (at ? estimateTransit(before, at).minutes : 15))) : from
  return { start, free: start < until }
}

/** Where a stop starting at `start` goes in the day's order */
export const indexAt = (day: Day, start: number) => day.stops.filter((s) => toMin(s.start) <= start).length

/** Travel between stops, kept where the neighbour didn't change */
function relink(stops: Stop[], was: Stop[]) {
  const nextOf = new Map(was.map((s, i) => [s.id, was[i + 1]?.id]))
  return stops.map((s, i) => {
    const next = stops[i + 1]
    if (!next) {
      const last = { ...s }
      delete last.transitToNext
      return last
    }
    return s.transitToNext && nextOf.get(s.id) === next.id ? s : { ...s, transitToNext: estimateTransit(s, next) }
  })
}

/**
 * The day's stops after moving one to a part of the day, before `overId` (or to the end of that part).
 * Inside its part only the order changes; into another part it takes that part's first free time.
 * Later stops move only if they'd overlap, and a few-hours visit's stops keep their times.
 */
export function moveToPart(day: Day, stopId: string, part: DayPart, overId?: string): Stop[] {
  const was = [...day.stops].sort(byStart)
  const stop = was.find((s) => s.id === stopId)
  if (!stop) return day.stops
  const rest = was.filter((s) => s.id !== stopId)
  const inPart = rest.filter((s) => !s.visitId && partOf(s.start) === part)
  const found = overId ? inPart.findIndex((s) => s.id === overId) : -1
  const samePart = partOf(stop.start) === part
  // Dragged down within its part, it lands after the stop it was dropped on
  const movedDown = samePart && found >= 0 && toMin(stop.start) < toMin(inPart[found].start)
  const pos = found < 0 ? inPart.length : movedDown ? found + 1 : found
  const duration = stopDuration(stop)

  if (samePart) {
    const group = was.filter((s) => !s.visitId && partOf(s.start) === part)
    const order = [...inPart.slice(0, pos), stop, ...inPart.slice(pos)]
    let t = toMin(group[0].start)
    const timed = order.map((s, i) => {
      if (i > 0) t = Math.max(t, round5(t + estimateTransit(order[i - 1], s).minutes))
      const next = { ...s, start: fromMin(t), end: fromMin(t + stopDuration(s)) }
      t += stopDuration(s)
      return next
    })
    const others = was.filter((s) => s.visitId || partOf(s.start) !== part)
    return relink(pushLater([...others, ...timed].sort(byStart)), was)
  }

  const before = inPart[pos - 1] ?? rest.filter((s) => toMin(s.start) < partStart(day, part)).pop()
  const from = partStart(day, part)
  const after = inPart[pos]
  // Dropped on the part's first place, it takes that place's time and the place moves after it
  const start = after && pos === 0 ? toMin(after.start) : before && toMin(before.end) > from - 60 ? Math.max(from, round5(toMin(before.end) + estimateTransit(before, stop).minutes)) : from
  const placed = { ...stop, start: fromMin(start), end: fromMin(start + duration) }
  const at = after ? rest.indexOf(after) : rest.filter((s) => toMin(s.start) <= start).length
  return relink(pushLater([...rest.slice(0, at), placed, ...rest.slice(at)]), was)
}

/** Stops that now overlap the one before them move later; a visit's stops stay */
function pushLater(stops: Stop[]) {
  let end = -1
  return stops.map((s) => {
    const start = toMin(s.start)
    if (s.visitId || start >= end) {
      end = toMin(s.end)
      return s
    }
    const moved = { ...s, start: fromMin(round5(end)), end: fromMin(round5(end) + stopDuration(s)) }
    end = toMin(moved.end)
    return moved
  })
}

/**
 * The day after giving a stop a new time. With `shift`, whatever now overlaps it moves after it (in a chain,
 * with time to get there); places that don't overlap keep their time, and so do a few-hours visit's stops.
 */
export function retimeStop(day: Day, stopId: string, start: number, minutes: number, shift: boolean) {
  const was = [...day.stops].sort(byStart)
  const stop = was.find((s) => s.id === stopId)
  const none = { stops: day.stops, moved: [] as { id: string; name: string; from: string; to: string }[], overlaps: [] as Stop[], stuck: [] as Stop[], tooLate: false }
  if (!stop) return none
  if (start + minutes >= 24 * 60) return { ...none, tooLate: true }
  const placed = { ...stop, start: fromMin(start), end: fromMin(start + minutes) }
  const rest = was.filter((s) => s.id !== stopId)
  const overlaps = rest.filter((s) => toMin(s.start) < start + minutes && toMin(s.end) > start)
  const stuck = overlaps.filter((s) => s.visitId)
  if (!shift) return { ...none, stops: relink([...rest, placed].sort(byStart), was), overlaps, stuck }

  const before = rest.filter((s) => toMin(s.end) <= start || (s.visitId && toMin(s.start) < start))
  const after = rest.filter((s) => !before.includes(s))
  let prev: Stop = placed
  let end = start + minutes
  let tooLate = false
  const timed = after.map((s) => {
    let next = s
    if (!s.visitId && toMin(s.start) < end) {
      const from = round5(end + estimateTransit(prev, s).minutes)
      if (from + stopDuration(s) >= 24 * 60) tooLate = true
      else next = { ...s, start: fromMin(from), end: fromMin(from + stopDuration(s)) }
    }
    prev = next
    end = Math.max(end, toMin(next.end))
    return next
  })
  if (tooLate) return { ...none, overlaps, stuck, tooLate }
  const moved = timed.flatMap((s, i) => (s.start === after[i].start ? [] : [{ id: s.id, name: s.name, from: after[i].start, to: `${s.start}–${s.end}` }]))
  return { ...none, stops: relink([...before, placed, ...timed], was), moved, overlaps, stuck }
}

/** Whether a place is open for the whole time, from that day's hours ("10:00–19:00"); undefined when unknown */
export function openDuring(hours: string | undefined, start: number, end: number) {
  if (!hours || /am|pm/i.test(hours)) return undefined
  if (/closed|סגור/i.test(hours)) return false
  if (/24/.test(hours) && !/\d:\d/.test(hours)) return true
  const ranges = [...hours.matchAll(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g)].map((m) => {
    const from = Number(m[1]) * 60 + Number(m[2])
    const to = Number(m[3]) * 60 + Number(m[4])
    return [from, to <= from ? to + 24 * 60 : to]
  })
  if (!ranges.length) return undefined
  return ranges.some(([from, to]) => start >= from && end <= to)
}

/** Coordinates from a pasted Google Maps link, or typed as "41.14, 9.53" */
export function coordsFromText(text: string) {
  const t = decodeURIComponent(text.trim())
  const m =
    t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ??
    t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ??
    t.match(/[?&](?:q|query|destination|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
    t.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}
