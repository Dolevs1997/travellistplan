import { useEffect, useState } from 'react'
import { searchCities, type CityHit } from './citySearch'
import { searchDestinations } from './destinations'
import { distanceKm } from './helpers'
import type { Destination } from './types'

export type DestinationHit = Destination & { admin?: string }

const HEBREW = /[\u0590-\u05FF]/

/**
 * Destinations matching what was typed: the built-in list first (Hebrew names, instant), then towns,
 * islands and regions from the online city search when the list has fewer than `limit` – so small places
 * like Porto Cervo are found too. The online search knows Hebrew names only for well-known places.
 */
export function useDestinationSearch(query: string, limit = 6, skip: string[] = []) {
  const q = query.trim()
  const local: DestinationHit[] = searchDestinations(q, limit, skip)
  const [online, setOnline] = useState<{ q: string; hits: CityHit[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const needMore = q.length >= 2 && local.length < limit

  useEffect(() => {
    if (!needMore) {
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      searchCities(q, ctrl.signal)
        .then((hits) => setOnline({ q, hits }))
        .catch(() => !ctrl.signal.aborted && setOnline({ q, hits: [] }))
        .finally(() => !ctrl.signal.aborted && setLoading(false))
    }, 300)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, needMore])

  // Online places that aren't one of the built-in ones (the same city found twice)
  const extra = online?.q === q ? online.hits.filter((h) => !skip.includes(h.id) && !local.some((d) => d.name === h.name || distanceKm(d, h) < 10)) : []
  const matches = [...local, ...extra].slice(0, limit)
  return {
    matches,
    loading: loading && matches.length === 0,
    /** Typed in Hebrew and nothing found: names of small places abroad are found in Latin letters */
    hebrewMiss: !loading && q.length >= 2 && matches.length === 0 && HEBREW.test(q) && online?.q === q,
    noMatch: !loading && q.length >= 2 && matches.length === 0 && online?.q === q,
  }
}

/** The small line under a destination's name: country, or region and country */
export const destinationSub = (d: DestinationHit) => (d.kind === 'country' ? 'מדינה' : [d.admin, d.country].filter(Boolean).join(' · '))
