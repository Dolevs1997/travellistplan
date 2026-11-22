import { useEffect, useState } from 'react'
import type { Destination } from './types'

/**
 * A representative photo for a city or country, from Wikipedia's page summary
 * (free, no key). Hebrew Wikipedia first, then English by place name.
 * Results are cached in localStorage so each place is fetched once.
 */

export interface CityPhoto {
  src: string
  /** The Wikipedia page the photo comes from (credit link) */
  page: string
}

const CACHE_KEY = 'trip-planner:city-photos'
const memory = new Map<string, CityPhoto | null>()

function readCache(): Record<string, CityPhoto | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeCache(id: string, photo: CityPhoto | null) {
  try {
    const all = readCache()
    all[id] = photo
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable: keep the in-memory copy only */
  }
}

async function summary(lang: 'he' | 'en', title: string): Promise<CityPhoto | null> {
  const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  if (!res.ok) return null
  const data = await res.json()
  const thumb: string | undefined = data.thumbnail?.source
  if (!thumb) return null
  // Ask for a wider rendition of the same thumbnail (fits a 2x phone card)
  const src = thumb.replace(/\/(\d+)px-/, '/960px-')
  const page: string = data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`
  return { src, page }
}

export async function fetchCityPhoto(dest: Destination): Promise<CityPhoto | null> {
  if (memory.has(dest.id)) return memory.get(dest.id) ?? null
  const cached = readCache()
  if (dest.id in cached) {
    memory.set(dest.id, cached[dest.id])
    return cached[dest.id]
  }
  let photo: CityPhoto | null = null
  try {
    photo = (await summary('he', dest.name)) ?? (await summary('en', dest.id.replace(/^country-/, '').replace(/-/g, ' ')))
  } catch {
    photo = null // offline or blocked: callers fall back to a map or a tile
    return null // don't cache network failures
  }
  memory.set(dest.id, photo)
  writeCache(dest.id, photo)
  return photo
}

/** undefined while loading, null when no photo exists */
export function useCityPhoto(dest: Destination | null | undefined) {
  const [photo, setPhoto] = useState<CityPhoto | null | undefined>(() => (dest ? memory.get(dest.id) : null))
  useEffect(() => {
    if (!dest) {
      setPhoto(null)
      return
    }
    let live = true
    setPhoto(memory.get(dest.id))
    fetchCityPhoto(dest).then((p) => live && setPhoto(p))
    return () => {
      live = false
    }
  }, [dest])
  return photo
}

/**
 * A photo for a planned stop: the image its place data already has, else the Hebrew (then English)
 * Wikipedia page of the same name. Cached like city photos, under "place:<name>".
 */
async function fetchPlacePhoto(name: string, at?: { lat: number; lng: number }): Promise<CityPhoto | null> {
  const key = `place:${name}`
  if (memory.has(key)) return memory.get(key) ?? null
  const cached = readCache()
  if (key in cached) {
    memory.set(key, cached[key])
    return cached[key]
  }
  let photo: CityPhoto | null
  try {
    // Spellings Wikipedia may use: geresh (׳) as an apostrophe, and the name without a description after a dash
    const base = name.split(/ [–-] /)[0].trim()
    const variants = [...new Set([name, name.replace(/׳/g, "'"), base, base.replace(/׳/g, "'")])]
    photo = null
    for (const v of variants) {
      photo = (await summary('he', v)) ?? (/[a-z]/i.test(v) ? await summary('en', v) : null)
      if (photo) break
    }
    // Last try: the nearest Wikipedia article with a picture, within 150 m of the stop
    if (!photo && at) photo = await nearbyPhoto(at)
  } catch {
    return null
  }
  memory.set(key, photo)
  writeCache(key, photo)
  return photo
}

async function nearbyPhoto(at: { lat: number; lng: number }): Promise<CityPhoto | null> {
  const u = `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${at.lat}%7C${at.lng}&ggsradius=150&ggslimit=5&prop=pageimages%7Cinfo&inprop=url&piprop=thumbnail&pithumbsize=960&format=json&origin=*`
  const res = await fetch(u)
  if (!res.ok) return null
  const pages = Object.values(((await res.json()) as { query?: { pages?: Record<string, { index?: number; thumbnail?: { source: string }; fullurl?: string }> } }).query?.pages ?? {})
  const hit = pages.filter((p) => p.thumbnail).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0]
  return hit?.thumbnail ? { src: hit.thumbnail.source, page: hit.fullurl ?? '' } : null
}

/** undefined while loading, null when there's no photo */
export function usePlacePhoto(name: string | undefined, image?: string, at?: { lat: number; lng: number }) {
  const key = name ? `place:${name}` : ''
  const [photo, setPhoto] = useState<CityPhoto | null | undefined>(() => (image ? { src: image, page: '' } : key ? memory.get(key) : null))
  useEffect(() => {
    if (image) {
      setPhoto({ src: image, page: '' })
      return
    }
    if (!name) {
      setPhoto(null)
      return
    }
    let live = true
    setPhoto(memory.get(`place:${name}`))
    fetchPlacePhoto(name, at).then((p) => live && setPhoto(p))
    return () => {
      live = false
    }
    // `at` is read once per name; coordinates of a stop don't change while it keeps its name
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, image])
  return photo
}
