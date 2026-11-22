import type { Destination } from './types'

/**
 * A rough round-trip flight price per person (ILS) from Tel Aviv, for the date calendar.
 * This is a model, not live data: distance sets the base, then the weekday and how far
 * ahead the date is. A flight-data provider can replace this function later.
 */

const TLV = { lat: 32.0055, lng: 34.8854 }

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

// Sunday → Saturday: weekend departures cost more, midweek less
const WEEKDAY = [1.15, 0.95, 0.85, 0.85, 1.0, 1.2, 1.05]

/** Same date and place always give the same small variation */
function wobble(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return 0.92 + ((h >>> 0) % 1000) / 1000 * 0.16
}

export function estimateFlight(dest: Destination, iso: string, todayIso: string) {
  const base = 150 + 0.08 * km(TLV, dest)
  const day = new Date(`${iso}T12:00:00`).getDay()
  const ahead = (new Date(`${iso}T12:00:00`).getTime() - new Date(`${todayIso}T12:00:00`).getTime()) / 86_400_000
  const lead = ahead < 14 ? 1.3 : ahead < 30 ? 1.1 : 1
  return Math.round((base * WEEKDAY[day] * lead * wobble(`${dest.id}:${iso}`)) / 10) * 10
}
