import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { mockTrip } from '../data/mockTrip'
import { emptyDays, fromMin, nextStartAfter, reflowFrom, stopDuration, toMin } from '../data/helpers'
import type { Day, Destination, Stop, Trip } from '../data/types'

/** What screens read: the active trip plus UI state */
export interface State {
  trip: Trip
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
  | { type: 'setDestination'; destination: Destination; startDate: string; dayCount: number }
  | { type: 'setActiveTrip'; tripId: string }
  | { type: 'deleteTrip'; tripId: string }
  | { type: 'reset' }

const STORAGE_KEY = 'trip-planner:v2'
const LEGACY_KEY = 'trip-planner:v1'

const initialStore = (): Store => ({
  trips: [structuredClone(mockTrip)],
  activeTripId: mockTrip.id,
  activeDayId: mockTrip.progress!.dayId,
  selectedStopId: null,
})

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Omit<Store, 'selectedStopId'>
      if (parsed?.trips?.length) return { ...parsed, selectedStopId: null }
    }
    // Earlier versions stored a single trip
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const old = JSON.parse(legacy) as { trip: Trip; activeDayId: string }
      if (old?.trip?.days?.length) {
        const trip = { ...old.trip, destination: old.trip.destination ?? mockTrip.destination }
        return { trips: [trip], activeTripId: trip.id, activeDayId: old.activeDayId, selectedStopId: null }
      }
    }
  } catch {
    /* storage unavailable – fall back to mock data */
  }
  return initialStore()
}

const newBudget = (): Trip['budget'] => ({
  currency: 'EUR',
  categories: mockTrip.budget.categories.map((c) => ({ ...c, spent: 0, planned: 0 })),
})

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
    case 'setDestination': {
      const { destination, startDate, dayCount } = action
      return {
        trip: {
          ...trip,
          name: `טיול ל${destination.name}`,
          destination,
          days: emptyDays(trip.id, destination.name, startDate, dayCount),
        },
      }
    }
    default:
      return { trip }
  }
}

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
      const first = trips[0]
      return { trips, activeTripId: first.id, activeDayId: first.progress?.dayId ?? first.days[0]?.id ?? '', selectedStopId: null }
    }
    case 'reset':
      return initialStore()
    default: {
      const active = store.trips.find((t) => t.id === store.activeTripId) ?? store.trips[0]
      const res = tripReducer(active, action)
      if (res.trip === active) return store
      const next: Store = { ...store, trips: store.trips.map((t) => (t.id === active.id ? res.trip : t)) }
      if (res.selectedStopId !== undefined) next.selectedStopId = res.selectedStopId
      if (action.type === 'addFromSuggestion') next.activeDayId = action.dayId
      if (action.type === 'setDestination') next.activeDayId = res.trip.days[0]?.id ?? ''
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

  const state = useMemo<State>(
    () => ({
      trip: store.trips.find((t) => t.id === store.activeTripId) ?? store.trips[0],
      trips: store.trips,
      activeDayId: store.activeDayId,
      selectedStopId: store.selectedStopId,
    }),
    [store],
  )

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
