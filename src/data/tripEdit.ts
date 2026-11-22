import { useCallback, useSyncExternalStore } from 'react'
import { addDays, emptyBrief, totalNights } from './brief'
import { tripLegs } from './helpers'
import type { Day, RentalChoice, Trip, TripBrief } from './types'
import type { Action } from '../state/TripStore'

/**
 * Editing a trip: the edit screen keeps an unsaved draft (in sessionStorage, so it survives
 * a visit to the transfer or car-rental screens). "Save" applies it to the trip.
 */

export interface EditDraft {
  tripId: string
  name: string
  start: string
  brief: TripBrief
}

/** The trip's brief; older trips without one get it rebuilt from their days */
export function briefOf(trip: Trip): TripBrief {
  const legs = tripLegs(trip).map((l, i, all) => ({ destination: l.destination, nights: Math.max(1, l.days.length - (i === all.length - 1 ? 1 : 0)) }))
  const base = trip.brief ?? { ...emptyBrief(), legs }
  return { ...base, legs: base.legs.length ? base.legs : legs, multi: true, start: trip.days[0]?.date ?? base.start }
}

const key = (tripId: string) => `trip-planner:edit:${tripId}`
const EVENT = 'trip-planner:edit'

export function loadEditDraft(tripId: string): EditDraft | null {
  try {
    const raw = sessionStorage.getItem(key(tripId))
    return raw ? (JSON.parse(raw) as EditDraft) : null
  } catch {
    return null
  }
}

export function saveEditDraft(d: EditDraft) {
  try {
    sessionStorage.setItem(key(d.tripId), JSON.stringify(d))
  } catch {
    /* storage unavailable: the draft lives only while this screen is open */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function clearEditDraft(tripId: string) {
  try {
    sessionStorage.removeItem(key(tripId))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT))
}

export const newDraft = (trip: Trip): EditDraft => ({ tripId: trip.id, name: trip.name, start: trip.days[0]?.date ?? '', brief: briefOf(trip) })

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

/**
 * The brief the transfer and rental screens work on: the open edit draft if there is one,
 * else the saved trip. `update` writes to the same place.
 */
export function useEditableBrief(trip: Trip, dispatch: (a: Action) => void) {
  const raw = useSyncExternalStore(subscribe, () => {
    try {
      return sessionStorage.getItem(key(trip.id))
    } catch {
      return null
    }
  })
  const draft = raw ? (JSON.parse(raw) as EditDraft) : null
  const brief = draft?.brief ?? briefOf(trip)
  const update = useCallback(
    (patch: Partial<TripBrief>) => {
      const current = loadEditDraft(trip.id)
      if (current) saveEditDraft({ ...current, brief: { ...current.brief, ...patch } })
      else dispatch({ type: 'setBrief', brief: { ...briefOf(trip), ...patch } })
    },
    [trip, dispatch],
  )
  return { brief, update, editing: !!draft }
}

/** Did the route (dates, cities or nights) change, so the days must be rebuilt? */
export function routeChanged(trip: Trip, d: EditDraft) {
  const was = briefOf(trip)
  return (
    d.start !== (trip.days[0]?.date ?? '') ||
    was.legs.length !== d.brief.legs.length ||
    was.legs.some((l, i) => l.destination.id !== d.brief.legs[i]?.destination.id || l.nights !== d.brief.legs[i]?.nights)
  )
}

/** Each saved city's days, in order */
function savedCityDays(trip: Trip) {
  const was = briefOf(trip).legs
  const out = new Map<string, Day[]>()
  let cursor = 0
  was.forEach((leg, i) => {
    const count = leg.nights + (i === was.length - 1 ? 1 : 0)
    out.set(leg.destination.id, trip.days.slice(cursor, cursor + count))
    cursor += leg.nights
  })
  return out
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/**
 * The trip's days and lodging on the edited route. A city that stays keeps its plan, day by day, even if it
 * moved in the order or the dates; a city that was removed or replaced takes its stops and lodging with it.
 */
export function rebuildRoute(trip: Trip, d: EditDraft) {
  const old = savedCityDays(trip)
  const main = d.brief.legs[0].destination
  const used = new Set<string>()
  const days: Day[] = []
  const legStart = new Map<string, { from: string; to: string }>()
  let cursor = 0
  d.brief.legs.forEach((leg, i) => {
    const count = leg.nights + (i === d.brief.legs.length - 1 ? 1 : 0)
    const from = addDays(d.start, cursor)
    legStart.set(leg.destination.id, { from, to: addDays(from, leg.nights) })
    const saved = old.get(leg.destination.id) ?? []
    for (let k = 0; k < count; k++) {
      const date = addDays(from, k)
      const was = saved[k]
      if (was) used.add(was.id)
      let id = was?.id ?? `${trip.id}-${date}`
      while (!was && (days.some((x) => x.id === id) || trip.days.some((x) => x.id === id))) id += '-n'
      days.push({
        ...(was ?? { id, city: leg.destination.name, title: leg.destination.name, stops: [], suggestions: [] }),
        id,
        date,
        destination: leg.destination.id === main.id ? undefined : leg.destination,
      })
    }
    cursor += leg.nights
  })
  const lodgings = (trip.lodgings ?? []).flatMap((l) => {
    for (const [destId, list] of old) {
      if (!list.length || l.checkIn < list[0].date || l.checkIn > list[list.length - 1].date) continue
      const to = legStart.get(destId)
      if (!to) return []
      const checkIn = addDays(l.checkIn, daysBetween(list[0].date, to.from))
      if (checkIn >= to.to) return []
      const moved = addDays(l.checkOut, daysBetween(list[0].date, to.from))
      return [{ ...l, checkIn, checkOut: moved > to.to ? to.to : moved }]
    }
    return [l]
  })
  const lostDays = trip.days.filter((x) => !used.has(x.id))
  return { destination: main, days, lodgings, lost: lostDays.reduce((n, x) => n + x.stops.length, 0) }
}

/** Stops on days that the new route drops */
export function stopsLost(trip: Trip, d: EditDraft) {
  if (!d.start || !d.brief.legs.length) return 0
  return rebuildRoute(trip, d).lost
}

/** Apply a saved draft: name, then the route with each city's plan, then the brief */
export function applyEdit(trip: Trip, d: EditDraft, dispatch: (a: Action) => void) {
  if (d.name.trim() && d.name !== trip.name) dispatch({ type: 'renameTrip', name: d.name })
  if (d.start && routeChanged(trip, d)) {
    const { destination, days, lodgings } = rebuildRoute(trip, d)
    dispatch({ type: 'setRoute', destination, days, lodgings })
  }
  // Choices for cities no longer in the trip go with them
  const here = new Set(d.brief.legs.map((l) => l.destination.id))
  const only = <T,>(m?: Record<string, T>) => (m ? Object.fromEntries(Object.entries(m).filter(([k]) => here.has(k))) : m)
  dispatch({
    type: 'setBrief',
    brief: { ...d.brief, rentals: only(d.brief.rentals), cityTransport: only(d.brief.cityTransport), start: d.start, end: d.start ? addDays(d.start, totalNights(d.brief)) : d.brief.end },
  })
  clearEditDraft(trip.id)
}

export type { RentalChoice }
