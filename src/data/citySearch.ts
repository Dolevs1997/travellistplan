import type { Destination } from './types'

/**
 * World-wide city search via the Open-Meteo geocoding API (free, no key, non-commercial use).
 * Only the typed query is sent. Names come back in Hebrew where the data has them.
 */
const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

interface GeoResult {
  id: number
  name: string
  latitude: number
  longitude: number
  feature_code?: string
  country?: string
  admin1?: string
  population?: number
}

export interface CityHit extends Destination {
  /** Region/state, shown under the name to tell same-named places apart */
  admin?: string
}

/** GeoNames feature codes kept besides populated places: islands, island groups, regions */
const AREA_CODES = new Set(['ISL', 'ISLS', 'ADM1', 'ADM2', 'RGN', 'PEN', 'AREA'])

/** Shown under the name so an island or region isn't mistaken for a town */
const KIND_LABEL: Record<string, string> = { ISL: 'אי', ISLS: 'קבוצת איים', ADM1: 'מחוז', ADM2: 'מחוז', RGN: 'אזור', PEN: 'חצי אי', AREA: 'אזור' }

const isPlace =(code?: string) => !code || code.startsWith('PPL') || AREA_CODES.has(code)

function zoomFor(code: string | undefined, population = 0) {
  if (code === 'ISLS' || code === 'ADM1' || code === 'RGN' || code === 'AREA') return 7
  if (code === 'ISL' || code === 'PEN') return population > 500_000 ? 7.2 : 9.5
  if (code === 'ADM2') return 9
  return population > 1_000_000 ? 11 : population > 200_000 ? 12 : 13
}

export async function searchCities(query: string, signal?: AbortSignal): Promise<CityHit[]> {
  const url = `${ENDPOINT}?name=${encodeURIComponent(query)}&count=12&language=he&format=json`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`city search failed: ${res.status}`)
  const data = (await res.json()) as { results?: GeoResult[] }
  return (data.results ?? [])
    .filter((r) => isPlace(r.feature_code)) // cities, towns, islands and regions; not parks, mountains etc.
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .map((r) => ({
      id: `geo-${r.id}`,
      name: r.name,
      country: r.country ?? '',
      admin: KIND_LABEL[r.feature_code ?? ''] ?? (r.admin1 && r.admin1 !== r.name ? r.admin1 : undefined),
      lat: r.latitude,
      lng: r.longitude,
      zoom: zoomFor(r.feature_code, r.population),
    }))
}
