import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { mockTrip } from '../data/mockTrip'
import { DEFAULT_VISIT, dayStart, estimateTransit, fromMin, isoRange, nextStartAfter, reflowFrom, stopDuration, toMin } from '../data/helpers'
import type { Activity, Day, Destination, Lodging, PlaceInfo, SavedRestaurant, Stop, Transit, Trip, TripExtras } from '../data/types'

/** What screens read: the active trip plus UI state */
export interface State {
  /** The open trip. When `hasActiveTrip` is false this is an empty placeholder: screens must not show it */
  trip: Trip
  hasActiveTrip: boolean
  trips: Trip[]
  activeDayId: string
  selectedStopId: string | null
}

interface Store {
  trips: Trip[]
  activeTripId: string
  activeDayId: string
  selectedStopId: string | null
}

export type Action =
  | { type: 'setDay'; dayId: string }
  | { type: 'selectStop'; stopId: string | null }
  | { type: 'reorder'; dayId: string; from: number; to: number }
  | { type: 'addFromSuggestion'; dayId: string; suggestionId: string }
  | { type: 'toggleBooked'; stopId: string }
  | { type: 'setNote'; stopId: string; note: string }
  | { type: 'moveStop'; stopId: string; toDayId: string }
  | { type: 'addExpense'; categoryId: string; amount: number }
  | { type: 'createTrip'; id: string }
  | { type: 'setupTrip'; destination: Destination; startDate: string; endDate: string; extras: TripExtras }
  | { type: 'setTripDates'; startDate: string; endDate: string }
  | { type: 'addLodging'; item: Lodging }
  | { type: 'addRestaurant'; item: SavedRestaurant }
  | { type: 'addActivity'; item: Activity }
  | { type: 'removeExtra'; list: keyof TripExtras; id: string }
  | { type: 'setDayHours'; dayId: string; start: string; end: string }
  | { type: 'addPlace'; dayId: string; place: PlaceInfo; minutes?: number }
  | { type: 'setStopMinutes'; stopId: string; minutes: number }
  | { type: 'setTransit'; stopId: string; transit: Transit }
  | { type: 'removeStop'; stopId: string }
  | { type: 'restoreDayStops'; dayId: string; stops: Stop[] }
  | { type: 'setActiveTrip'; tripId: string }
  | { type: 'deleteTrip'; tripId: string }
  | { type: 'reset' }

const STORAGE_KEY = 'trip-planner:v3'
const V2_KEY = 'trip-planner:v2'
const LEGACY_KEY = 'trip-planner:v1'

/** The bundled Lisbon & Porto trip is a sample: never opened or shown on Home by default */
export const isSampleTrip = (t: Trip) => t.id === mockTrip.id

/** Nothing is open until the user creates a trip (or opens the sample from Profile) */
const initialStore = (): Store => ({
  trips: [structuredClone(mockTrip)],
  activeTripId: '',
  activeDayId: '',
  selectedStopId: null,
})

const firstOwnTrip = (trips: Trip[]) => trips.find((t) => !isSampleTrip(t))

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Omit<Store, 'selectedStopId'>
      if (parsed?.trips?.length) return { ...parsed, selectedStopId: null }
    }
    // v2 opened the sample trip by default: keep the user's trips, but don't leave the sample open
    const v2 = localStorage.getItem(V2_KEY)
    if (v2) {
      const parsed = JSON.parse(v2) as Omit<Store, 'selectedStopId'>
      if (parsed?.trips?.length) {
        const active = parsed.trips.find((t) => t.id === parsed.activeTripId)
        if (active && !isSampleTrip(active)) return { ...parsed, selectedStopId: null }
        const own = firstOwnTrip(parsed.trips)
        return { trips: parsed.trips, activeTripId: own?.id ?? '', activeDayId: own?.days[0]?.id ?? '', selectedStopId: null }
      }
    }
    // v1 stored a single trip
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const old = JSON.parse(legacy) as { trip: Trip; activeDayId: string }
      if (old?.trip?.days?.length && !isSampleTrip(old.trip)) {
        return { trips: [structuredClone(mockTrip), old.trip], activeTripId: old.trip.id, activeDayId: old.activeDayId, selectedStopId: null }
      }
    }
  } catch {
    /* storage unavailable – start fresh */
  }
  return initialStore()
}

const newBudget = (): Trip['budget'] => ({
  currency: 'EUR',
  categories: mockTrip.budget.categories.map((c) => ({ ...c, spent: 0, planned: 0 })),
})

/** Placeholder when no trip is open; App never renders trip screens for it */
const NO_TRIP: Trip = { id: '', name: '', destination: null, days: [], budget: newBudget() }

/**
 * Rebuild a trip's days for a new date range. Days whose date is still in range keep their
 * stops; new dates get empty days; anything pointing at a removed day is unlinked.
 */
function withDates(trip: Trip, startDate: string, endDate: string): Trip {
  const city = trip.destination?.name ?? ''
  const byDate = new Map(trip.days.map((d) => [d.date, d]))
  const days: Day[] = isoRange(startDate, endDate).map(
    (date) => byDate.get(date) ?? { id: `${trip.id}-${date}`, date, city, title: city, stops: [], suggestions: [] },
  )
  const ids = new Set(days.map((d) => d.id))
  const keepDay = <T extends { dayId?: string }>(x: T): T => (x.dayId && !ids.has(x.dayId) ? { ...x, dayId: undefined } : x)
  return {
    ...trip,
    days,
    progress: trip.progress && ids.has(trip.progress.dayId) ? trip.progress : undefined,
    restaurants: (trip.restaurants ?? []).map(keepDay),
    activities: (trip.activities ?? []).map(keepDay),
  }
}

const mapDay = (trip: Trip, dayId: string, fn: (d: Day) => Day): Trip => ({
  ...trip,
  days: trip.days.map((d) => (d.id === dayId ? fn(d) : d)),
})

const mapStop = (trip: Trip, stopId: string, fn: (s: Stop) => Stop): Trip => ({
  ...trip,
  days: trip.days.map((d) => ({ ...d, stops: d.stops.map((s) => (s.id === stopId ? fn(s) : s)) })),
})

/** Actions that only touch the active trip */
function tripReducer(trip: Trip, action: Action): { trip: Trip; selectedStopId?: string | null } {
  switch (action.type) {
    case 'reorder':
      return {
        trip: mapDay(trip, action.dayId, (d) => {
          if (d.stops.length < 2) return d
          const legs = d.stops.map((s) => s.transitToNext)
          const moved = arrayMove(d.stops, action.from, action.to).map((s, i) => ({ ...s, transitToNext: legs[i] }))
          return { ...d, stops: reflowFrom(moved, toMin(d.stops[0].start)) }
        }),
      }
    case 'addFromSuggestion': {
      let addedId: string | null = null
      const next = mapDay(trip, action.dayId, (d) => {
        const sug = d.suggestions.find((g) => g.id === action.suggestionId)
        if (!sug) return d
        const start = nextStartAfter(d.stops, sug.travel.minutes)
        addedId = `x-${sug.id}-${Date.now().toString(36)}`
        const stop: Stop = {
          id: addedId,
          name: sug.name,
          area: sug.area,
          lat: sug.lat,
          lng: sug.lng,
          kind: sug.kind,
          start: fromMin(start),
          end: fromMin(start + sug.durationMin),
          heritage: sug.kind === 'heritage',
        }
        const stops = d.stops.map((s, i) => (i === d.stops.length - 1 ? { ...s, transitToNext: sug.travel } : s))
        return { ...d, stops: [...stops, stop], suggestions: d.suggestions.filter((g) => g.id !== sug.id) }
      })
      return { trip: next, selectedStopId: addedId }
    }
    case 'toggleBooked':
      return { trip: mapStop(trip, action.stopId, (s) => ({ ...s, booked: !s.booked })) }
    case 'setNote':
      return { trip: mapStop(trip, action.stopId, (s) => ({ ...s, note: action.note })) }
    case 'moveStop': {
      const from = trip.days.find((d) => d.stops.some((s) => s.id === action.stopId))
      if (!from || from.id === action.toDayId) return { trip }
      const stop = from.stops.find((s) => s.id === action.stopId)!
      const days = trip.days.map((d) => {
        if (d.id === from.id) {
          const rest = d.stops.filter((s) => s.id !== action.stopId)
          return { ...d, stops: rest.length ? reflowFrom(rest, toMin(rest[0].start)) : [] }
        }
        if (d.id === action.toDayId) {
          const start = nextStartAfter(d.stops, 20)
          const stops = d.stops.map((s, i) =>
            i === d.stops.length - 1 ? { ...s, transitToNext: { mode: 'walk' as const, minutes: 20 } } : s,
          )
          const moved: Stop = { ...stop, start: fromMin(start), end: fromMin(start + stopDuration(stop)) }
          delete moved.transitToNext
          return { ...d, stops: [...stops, moved] }
        }
        return d
      })
      return { trip: { ...trip, days } }
    }
    case 'addExpense':
      return {
        trip: {
          ...trip,
          budget: {
            ...trip.budget,
            categories: trip.budget.categories.map((c) =>
              c.id === action.categoryId ? { ...c, spent: Math.round((c.spent + action.amount) * 100) / 100 } : c,
            ),
          },
        },
      }
    case 'setupTrip': {
      const { destination, startDate, endDate, extras } = action
      // Activities/restaurants picked during setup refer to days by date; map them to the new day ids
      const base = withDates({ ...trip, name: `טיול ל${destination.name}`, destination, days: [] }, startDate, endDate)
      return { trip: { ...base, ...extras } }
    }
    case 'setTripDates':
      return { trip: withDates(trip, action.startDate, action.endDate) }
    case 'addLodging':
      return { trip: { ...trip, lodgings: [...(trip.lodgings ?? []), action.item] } }
    case 'addRestaurant':
      return { trip: { ...trip, restaurants: [...(trip.restaurants ?? []), action.item] } }
    case 'addActivity':
      return { trip: { ...trip, activities: [...(trip.activities ?? []), action.item] } }
    case 'removeExtra':
      return { trip: { ...trip, [action.list]: (trip[action.list] ?? []).filter((x) => x.id !== action.id) } }
    case 'setDayHours':
      return {
        trip: mapDay(trip, action.dayId, (d) => reflowDay({ ...d, startTime: action.start, endTime: action.end })),
      }
    case 'addPlace': {
      const { place } = action
      const id = `p-${place.ref.replace(/\W/g, '')}-${Date.now().toString(36)}`
      const next = mapDay(trip, action.dayId, (d) => {
        const prev = d.stops[d.stops.length - 1]
        const travel = prev ? estimateTransit(prev, place) : undefined
        const minutes = action.minutes ?? DEFAULT_VISIT[place.kind]
        const start = nextStartAfter(d.stops, travel?.minutes ?? 0, toMin(dayStart(d)))
        const stop: Stop = {
          id,
          name: place.name,
          area: place.address ?? place.description ?? '',
          lat: place.lat,
          lng: place.lng,
          kind: place.kind,
          start: fromMin(start),
          end: fromMin(start + minutes),
          info: place,
        }
        const stops = d.stops.map((s, i) => (i === d.stops.length - 1 ? { ...s, transitToNext: travel } : s))
        return { ...d, stops: [...stops, stop] }
      })
      return { trip: next, selectedStopId: id }
    }
    case 'setStopMinutes':
      return {
        trip: mapDayOfStop(trip, action.stopId, (d) =>
          reflowDay({
            ...d,
            stops: d.stops.map((s) => (s.id === action.stopId ? { ...s, end: fromMin(toMin(s.start) + Math.max(5, action.minutes)) } : s)),
          }),
        ),
      }
    case 'setTransit':
      return {
        trip: mapDayOfStop(trip, action.stopId, (d) =>
          reflowDay({ ...d, stops: d.stops.map((s) => (s.id === action.stopId ? { ...s, transitToNext: action.transit } : s)) }),
        ),
      }
    case 'removeStop':
      return {
        trip: mapDayOfStop(trip, action.stopId, (d) => reflowDay({ ...d, stops: d.stops.filter((s) => s.id !== action.stopId) }, d.stops[0]?.start)),
        selectedStopId: null,
      }
    case 'restoreDayStops':
      // Undo a removal: put the day's stops back exactly as they were (times and travel included)
      return { trip: mapDay(trip, action.dayId, (d) => ({ ...d, stops: action.stops })) }
    default:
      return { trip }
  }
}

/**
 * Re-time a day's stops, keeping each visit's length and travel times. Starts at the day's own start
 * hour if one was set, otherwise where the day already started (so removing the first stop doesn't
 * jump the day to the default 10:00).
 */
const reflowDay = (d: Day, previousFirstStart?: string): Day => {
  if (!d.stops.length) return d
  const start = d.startTime ?? previousFirstStart ?? d.stops[0].start ?? dayStart(d)
  return { ...d, stops: reflowFrom(d.stops, toMin(start)) }
}

const mapDayOfStop = (trip: Trip, stopId: string, fn: (d: Day) => Day): Trip => ({
  ...trip,
  days: trip.days.map((d) => (d.stops.some((s) => s.id === stopId) ? fn(d) : d)),
})

function reducer(store: Store, action: Action): Store {
  switch (action.type) {
    case 'setDay':
      return { ...store, activeDayId: action.dayId, selectedStopId: null }
    case 'selectStop':
      return { ...store, selectedStopId: action.stopId }
    case 'createTrip': {
      const trip: Trip = { id: action.id, name: 'טיול חדש', destination: null, days: [], budget: newBudget() }
      return { trips: [...store.trips, trip], activeTripId: trip.id, activeDayId: '', selectedStopId: null }
    }
    case 'setActiveTrip': {
      const trip = store.trips.find((t) => t.id === action.tripId)
      if (!trip) return store
      return { ...store, activeTripId: trip.id, activeDayId: trip.progress?.dayId ?? trip.days[0]?.id ?? '', selectedStopId: null }
    }
    case 'deleteTrip': {
      const trips = store.trips.filter((t) => t.id !== action.tripId)
      if (trips.length === 0) return initialStore()
      if (store.activeTripId !== action.tripId) return { ...store, trips }
      // Fall back to another of the user's own trips, never to the sample
      const own = firstOwnTrip(trips)
      return { trips, activeTripId: own?.id ?? '', activeDayId: own?.progress?.dayId ?? own?.days[0]?.id ?? '', selectedStopId: null }
    }
    case 'reset': {
      // Restore only the sample trip; the user's own trips stay
      const trips = [structuredClone(mockTrip), ...store.trips.filter((t) => !isSampleTrip(t))]
      if (store.activeTripId === mockTrip.id) return { ...store, trips, activeDayId: mockTrip.progress!.dayId, selectedStopId: null }
      return { ...store, trips }
    }
    default: {
      const active = store.trips.find((t) => t.id === store.activeTripId)
      if (!active) return store // no trip open: trip actions do nothing
      const res = tripReducer(active, action)
      if (res.trip === active) return store
      const next: Store = { ...store, trips: store.trips.map((t) => (t.id === active.id ? res.trip : t)) }
      if (res.selectedStopId !== undefined) next.selectedStopId = res.selectedStopId
      if (action.type === 'addFromSuggestion' || action.type === 'addPlace') next.activeDayId = action.dayId
      if (action.type === 'setupTrip') next.activeDayId = res.trip.days[0]?.id ?? ''
      if (action.type === 'setTripDates' && !res.trip.days.some((d) => d.id === store.activeDayId)) {
        next.activeDayId = res.trip.progress?.dayId ?? res.trip.days[0]?.id ?? ''
        next.selectedStopId = null
      }
      return next
    }
  }
}

const Ctx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null)

export function TripProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      const { trips, activeTripId, activeDayId } = store
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trips, activeTripId, activeDayId }))
    } catch {
      /* ignore */
    }
  }, [store])

  const state = useMemo<State>(() => {
    const active = store.trips.find((t) => t.id === store.activeTripId)
    return {
      trip: active ?? NO_TRIP,
      hasActiveTrip: !!active,
      trips: store.trips,
      activeDayId: store.activeDayId,
      selectedStopId: store.selectedStopId,
    }
  }, [store])

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useTrip() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrip must be used inside TripProvider')
  return ctx
}

export function findStop(trip: Trip, stopId: string) {
  for (const day of trip.days) {
    const index = day.stops.findIndex((s) => s.id === stopId)
    if (index !== -1) return { day, stop: day.stops[index], index }
  }
  return null
}
