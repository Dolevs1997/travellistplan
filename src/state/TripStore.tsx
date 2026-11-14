import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { mockTrip } from '../data/mockTrip'
import { fromMin, nextStartAfter, reflowFrom, stopDuration, toMin } from '../data/helpers'
import type { Day, Stop, Trip } from '../data/types'

export interface State {
  trip: Trip
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
  | { type: 'reset' }

const STORAGE_KEY = 'trip-planner:v1'

const initialState = (): State => ({
  trip: structuredClone(mockTrip),
  activeDayId: mockTrip.progress.dayId,
  selectedStopId: null,
})

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Pick<State, 'trip' | 'activeDayId'>
      if (parsed?.trip?.days?.length) return { ...parsed, selectedStopId: null }
    }
  } catch {
    /* storage unavailable – fall back to mock data */
  }
  return initialState()
}

const mapDay = (trip: Trip, dayId: string, fn: (d: Day) => Day): Trip => ({
  ...trip,
  days: trip.days.map((d) => (d.id === dayId ? fn(d) : d)),
})

const mapStop = (trip: Trip, stopId: string, fn: (s: Stop) => Stop): Trip => ({
  ...trip,
  days: trip.days.map((d) => ({ ...d, stops: d.stops.map((s) => (s.id === stopId ? fn(s) : s)) })),
})

function reducer(state: State, action: Action): State {
  const { trip } = state
  switch (action.type) {
    case 'setDay':
      return { ...state, activeDayId: action.dayId, selectedStopId: null }
    case 'selectStop':
      return { ...state, selectedStopId: action.stopId }
    case 'reorder': {
      return {
        ...state,
        trip: mapDay(trip, action.dayId, (d) => {
          if (d.stops.length < 2) return d
          const legs = d.stops.map((s) => s.transitToNext)
          const moved = arrayMove(d.stops, action.from, action.to).map((s, i) => ({ ...s, transitToNext: legs[i] }))
          return { ...d, stops: reflowFrom(moved, toMin(d.stops[0].start)) }
        }),
      }
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
      return { ...state, trip: next, activeDayId: action.dayId, selectedStopId: addedId }
    }
    case 'toggleBooked':
      return { ...state, trip: mapStop(trip, action.stopId, (s) => ({ ...s, booked: !s.booked })) }
    case 'setNote':
      return { ...state, trip: mapStop(trip, action.stopId, (s) => ({ ...s, note: action.note })) }
    case 'moveStop': {
      const from = trip.days.find((d) => d.stops.some((s) => s.id === action.stopId))
      if (!from || from.id === action.toDayId) return state
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
      return { ...state, trip: { ...trip, days } }
    }
    case 'addExpense':
      return {
        ...state,
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
    case 'reset':
      return initialState()
  }
}

const Ctx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null)

export function TripProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip: state.trip, activeDayId: state.activeDayId }))
    } catch {
      /* ignore */
    }
  }, [state.trip, state.activeDayId])

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
