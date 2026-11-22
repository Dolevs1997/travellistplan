import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Landmark, LocateFixed, Plus, RefreshCw, Search, Star, X } from 'lucide-react'
import { Map as MLMap, Marker, type GeoJSONSource } from 'maplibre-gl'
import { BottomNav, cx } from '../components/ui'
import { AddSheet, nextSlot } from './AddPlaces'
import { DEFAULT_VISIT, distanceKm, fromMin } from '../data/helpers'
import { explore, exploreAvailable, kindOf, matchTrip, toPlaceInfo, type ExploreCat, type ExplorePlace } from '../data/explore'
import { googlePhoto } from '../data/lodging'
import { applyMapTheme, currentStyleUrl } from '../maplibreSetup'
import { navigate, prefersReducedMotion } from '../router'
import { useTrip } from '../state/TripStore'
import { useTheme } from '../theme'
import type { Day } from '../data/types'

const CATS: { id: ExploreCat; label: string; maps: string }[] = [
  { id: 'top', label: 'מומלצים', maps: 'attractions' },
  { id: 'sights', label: 'אטרקציות', maps: 'tourist attractions' },
  { id: 'food', label: 'מסעדות', maps: 'restaurants' },
  { id: 'cafes', label: 'בתי קפה', maps: 'cafes' },
  { id: 'views', label: 'תצפיות', maps: 'viewpoints' },
  { id: 'museums', label: 'מוזיאונים', maps: 'museums' },
  { id: 'markets', label: 'שווקים', maps: 'markets' },
  { id: 'nature', label: 'טבע', maps: 'parks' },
]
const RADIUS = 1000
const isFood = (p: ExplorePlace) => p.types.some((t) => ['restaurant', 'cafe', 'coffee_shop', 'bakery', 'bar', 'food'].includes(t))
const fmtDistance = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} מ׳` : `${(m / 1000).toFixed(1)} ק״מ`)
const dayPlace = (d: Day) => d.stops.find((s) => s.area)?.area.split(',')[0] || d.destination?.name || d.city

type Where = { center: { lat: number; lng: number }; kind: 'day' | 'me' | 'map' }

/** The map tab: what's around you (or around today's stops) – recommendations by category, your stops, add to the trip */
export default function Nearby() {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const day = trip.days.find((d) => d.id === state.activeDayId) ?? trip.days[0]
  const dayIndex = trip.days.indexOf(day)
  const city = day.destination ?? trip.destination ?? { lat: day.stops[0]?.lat ?? 0, lng: day.stops[0]?.lng ?? 0 }
  const stopsHere = day.stops.filter((s) => distanceKm(s, city) <= 20)
  const dayCenter = stopsHere.length
    ? { lat: stopsHere.reduce((a, s) => a + s.lat, 0) / stopsHere.length, lng: stopsHere.reduce((a, s) => a + s.lng, 0) / stopsHere.length }
    : { lat: city.lat, lng: city.lng }

  const [where, setWhere] = useState<Where>({ center: dayCenter, kind: 'day' })
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [moved, setMoved] = useState<{ lat: number; lng: number } | null>(null)
  const [cat, setCat] = useState<ExploreCat>('top')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<ExplorePlace[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState<ExplorePlace | null>(null)
  const [toast, setToast] = useState('')
  const [locating, setLocating] = useState(false)
  const key = `${where.center.lat.toFixed(4)},${where.center.lng.toFixed(4)}|${cat}|${query}`

  useEffect(() => {
    let live = true
    setPlaces(null)
    setFailed(false)
    setSelected(null)
    explore(query ? { q: query } : { cat }, { center: where.center, radius: RADIUS })
      .then((r) => live && setPlaces(r))
      .catch(() => live && (setFailed(true), setPlaces([])))
    return () => {
      live = false
    }
    // key stands for the center, category and query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const say = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const locate = () => {
    if (!('geolocation' in navigator)) return say('הדפדפן הזה לא תומך באיתור מיקום')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMe(here)
        // Far from the trip (planning from home): stay on the day's area
        if (distanceKm(here, city) > 50) return say(`אתם רחוקים מ${day.destination?.name ?? day.city} – מציגים את האזור של יום ${dayIndex + 1}`)
        setWhere({ center: here, kind: 'me' })
        setMoved(null)
      },
      () => {
        setLocating(false)
        say('לא קיבלנו את המיקום. אפשר לאשר גישה למיקום בהגדרות הדפדפן.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const inTrip = matchTrip(places ?? [], trip.days)
  const list = (places ?? [])
    .map((p) => ({ p, m: distanceKm(p, where.center) * 1000, trip: inTrip.get(p.id) }))
    .filter((r) => r.m <= RADIUS * 1.6)
    .sort((a, b) => a.m - b.m)
  const catInfo = CATS.find((c) => c.id === cat)!
  const fromWhere = where.kind === 'me' ? 'ממך' : where.kind === 'day' ? `מהעצירות של יום ${dayIndex + 1}` : 'מהאזור במפה'
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query || catInfo.maps)}/@${where.center.lat},${where.center.lng},15z`

  const open = (p: ExplorePlace, tripStop?: { stop: { id: string } }) => {
    if (tripStop) navigate(`/place/${tripStop.stop.id}`)
    else if (isFood(p)) navigate(`/restaurant/${p.id}/${day.id}`)
    else navigate(`/spot/${p.id}/${day.id}`)
  }
  const onSelect = useCallback((id: string) => setSelected(id), [])

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-24">
      <div className="relative h-[55vh] min-h-[340px]">
        <NearbyMap
          center={where.center}
          me={me}
          radius={RADIUS}
          stops={stopsHere}
          places={list.filter((r) => !r.trip).map((r) => r.p)}
          selected={selected}
          onSelect={onSelect}
          onMoved={setMoved}
        />

        <div className="pointer-events-none absolute inset-x-3.5 top-3.5 z-10 flex flex-col gap-2.5">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setQuery(q.trim().length >= 2 ? q.trim() : '')
            }}
            className="pointer-events-auto flex h-12 items-center gap-2.5 rounded-2xl bg-surface px-3.5 shadow-[var(--float-shadow)]"
          >
            <Search size={18} className="shrink-0" aria-hidden="true" />
            <label className="sr-only" htmlFor="nearby-q">
              חיפוש מקום
            </label>
            <input
              id="nearby-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש מקום בסביבה"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
            {(q || query) && (
              <button
                type="button"
                aria-label="ניקוי החיפוש"
                onClick={() => {
                  setQ('')
                  setQuery('')
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-muted"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </form>
          {!query && (
            <div role="group" aria-label="קטגוריה" className="no-scrollbar pointer-events-auto -mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={cat === c.id}
                  onClick={() => setCat(c.id)}
                  className={cx(
                    'h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium shadow-[0_2px_8px_rgba(21,24,29,0.12)]',
                    cat === c.id ? 'bg-text font-semibold text-bg' : 'bg-surface',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {moved && distanceKm(moved, where.center) > 0.3 && (
          <button
            type="button"
            onClick={() => {
              setWhere({ center: moved, kind: 'map' })
              setMoved(null)
            }}
            className="absolute bottom-10 left-1/2 z-10 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-accent shadow-[var(--float-shadow)]"
          >
            <RefreshCw size={14} aria-hidden="true" />
            חיפוש באזור הזה
          </button>
        )}

        <button
          type="button"
          onClick={locate}
          disabled={locating}
          aria-label="המיקום שלי"
          className="absolute bottom-10 z-10 flex size-11 items-center justify-center rounded-full bg-surface text-accent shadow-[var(--float-shadow)] disabled:opacity-60"
          style={{ insetInlineEnd: 14 }}
        >
          <LocateFixed size={20} aria-hidden="true" />
        </button>

        <div aria-hidden="true" className="absolute bottom-10 z-10 flex items-center gap-2.5 rounded-full bg-surface/94 px-3 py-1.5 text-[11px] shadow" style={{ insetInlineStart: 14 }}>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-accent" />
            בטיול
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-[#E07B1A]" />
            מומלץ
          </span>
          {me && (
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-[#2B6CB0]" />
              אתם כאן
            </span>
          )}
        </div>
      </div>

      <section aria-label={query ? 'תוצאות חיפוש' : `${catInfo.label} בסביבה`} className="relative -mt-7 flex flex-1 flex-col gap-2.5 rounded-t-sheet bg-bg px-4 pt-2 pb-6 shadow-[var(--sheet-shadow)]">
        <div className="flex h-5 items-center justify-center" aria-hidden="true">
          <span className="h-[5px] w-10 rounded-full bg-handle" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-[19px] font-bold">{query ? `"${query}" בסביבה` : cat === 'top' ? 'מומלץ בסביבה' : `${catInfo.label} בסביבה`}</h1>
            <span className="truncate text-xs text-muted">
              עד 1 ק״מ {fromWhere} · {dayPlace(day)}
            </span>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-[13px] font-semibold text-on-accent"
          >
            הכל בגוגל מפות
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>

        {!exploreAvailable() ? (
          <p className="rounded-card bg-raised p-4 text-sm text-muted">ההמלצות דורשות חיבור ל-Google Places, שלא מוגדר כאן.</p>
        ) : places === null ? (
          <p role="status" className="py-6 text-center text-sm text-muted">
            מחפשים בסביבה…
          </p>
        ) : failed ? (
          <p className="py-6 text-center text-sm text-muted">לא הצלחנו לטעון מקומות כרגע. נסו שוב בעוד רגע.</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">לא מצאנו מקומות כאלה עד 1 ק״מ מכאן.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map(({ p, m, trip: t }) => (
              <NearbyRow
                key={p.id}
                place={p}
                meta={`${fmtDistance(m)} · ${p.typeLabel ?? catInfo.label}`}
                inTrip={!!t}
                highlighted={p.id === selected}
                onOpen={() => open(p, t)}
                onAdd={() => setAdding(p)}
              />
            ))}
          </ul>
        )}
        {list.length > 0 && <p className="text-center text-[11px] text-muted">דירוגים ותמונות: Google</p>}
      </section>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[90vw] rounded-full bg-text px-4 py-2.5 text-center text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}

      {adding && (
        <AddSheet
          place={adding}
          days={trip.days}
          initialDayId={day.id}
          defaultMinutes={DEFAULT_VISIT[kindOf(adding, query ? undefined : cat)]}
          onAdd={(d, start, minutes) => {
            const isNext = start === nextSlot(d, adding).start
            dispatch({ type: 'addPlace', dayId: d.id, place: toPlaceInfo(adding, query ? undefined : cat), minutes, ...(isNext ? {} : { start: fromMin(start) }) })
            say(`${adding.name} נוסף ליום ${trip.days.indexOf(d) + 1} · ${fromMin(start)}`)
            setAdding(null)
          }}
          onClose={() => setAdding(null)}
        />
      )}

      <BottomNav active="map" />
    </div>
  )
}

function NearbyRow({
  place: p,
  meta,
  inTrip,
  highlighted,
  onOpen,
  onAdd,
}: {
  place: ExplorePlace
  meta: string
  inTrip: boolean
  highlighted: boolean
  onOpen: () => void
  onAdd: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [highlighted])
  return (
    <li
      ref={ref}
      className={cx(
        'flex items-center gap-3 rounded-[18px] border bg-surface p-2.5',
        highlighted ? 'border-2 border-accent' : inTrip ? 'border-accent/50' : 'border-border',
      )}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        {p.photo && !failed ? (
          <img src={googlePhoto(p.photo, 200)} alt="" loading="lazy" onError={() => setFailed(true)} className="size-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Landmark size={20} aria-hidden="true" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{p.name}</span>
          <span className="truncate text-xs text-muted">
            {meta}
            {inTrip ? (
              <b className="text-accent"> · בטיול שלך</b>
            ) : (p.rating ?? 0) >= 4.5 ? (
              <b className="text-[#B4560A]"> · מומלץ</b>
            ) : null}
          </span>
          {p.rating ? (
            <span className="flex items-center gap-0.5 text-xs">
              <Star size={11} className="fill-current text-[#E8A13A]" aria-hidden="true" />
              <b>{p.rating.toFixed(1)}</b>
              {p.ratingCount ? <span className="text-muted"> ({p.ratingCount.toLocaleString('en-US')})</span> : null}
            </span>
          ) : null}
        </span>
      </button>
      {inTrip ? (
        <span aria-label="כבר בטיול" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
          <Check size={18} aria-hidden="true" />
        </span>
      ) : (
        <button
          type="button"
          aria-label={`הוספת ${p.name} לטיול`}
          onClick={onAdd}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-accent text-accent hover:bg-accent/8"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

const STAR_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/></svg>'

/** A circle polygon of `r` meters (the "1 km around you" area) */
function circle(c: { lat: number; lng: number }, r: number): GeoJSON.Feature {
  const ring: [number, number][] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI
    ring.push([c.lng + (r * Math.sin(a)) / (111320 * Math.cos((c.lat * Math.PI) / 180)), c.lat + (r * Math.cos(a)) / 111320])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

function NearbyMap({
  center,
  me,
  radius,
  stops,
  places,
  selected,
  onSelect,
  onMoved,
}: {
  center: { lat: number; lng: number }
  me: { lat: number; lng: number } | null
  radius: number
  stops: { id: string; lat: number; lng: number; name: string }[]
  places: ExplorePlace[]
  selected: string | null
  onSelect: (id: string) => void
  onMoved: (c: { lat: number; lng: number }) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markers = useRef<Marker[]>([])
  const theme = useTheme()
  const onMovedRef = useRef(onMoved)
  onMovedRef.current = onMoved

  useEffect(() => {
    if (!ref.current) return
    let map: MLMap
    try {
      map = new MLMap({ container: ref.current, style: currentStyleUrl(), center: [center.lng, center.lat], zoom: 14.6, attributionControl: { compact: true } })
    } catch {
      return
    }
    mapRef.current = map
    map.on('load', () => applyMapTheme(map))
    map.on('moveend', (e) => {
      if (!(e as { originalEvent?: unknown }).originalEvent) return // only moves the user made
      const c = map.getCenter()
      onMovedRef.current({ lat: c.lat, lng: c.lng })
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
    // created once per theme; the center is flown to below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // The searched area: a soft circle, and the map moved to it
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [circle(center, radius)] }
      const src = map.getSource('area') as GeoJSONSource | undefined
      if (src) src.setData(data)
      else {
        map.addSource('area', { type: 'geojson', data })
        map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#2B6CB0', 'fill-opacity': 0.06 } })
        map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#2B6CB0', 'line-opacity': 0.35, 'line-width': 1.5, 'line-dasharray': [2, 2] } })
      }
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
    map.easeTo({ center: [center.lng, center.lat], zoom: 14.6, duration: prefersReducedMotion() ? 0 : 500 })
    return () => void map.off('load', draw)
  }, [center.lat, center.lng, radius, theme, center])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markers.current.forEach((m) => m.remove())
    markers.current = []
    const add = (el: HTMLElement, at: { lat: number; lng: number }, z = 1) => {
      const m = new Marker({ element: el }).setLngLat([at.lng, at.lat]).addTo(map)
      m.getElement().style.zIndex = String(z)
      markers.current.push(m)
    }
    stops.forEach((s, i) => {
      const el = document.createElement('a')
      el.href = `#/place/${s.id}`
      el.setAttribute('aria-label', `עצירה ${i + 1}: ${s.name}`)
      el.className = 'flex size-8 items-center justify-center rounded-full border-2 border-white bg-accent text-[13px] font-bold text-white shadow-md'
      el.textContent = String(i + 1)
      add(el, s, 3)
    })
    for (const p of places) {
      const on = p.id === selected
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('aria-label', p.name)
      if (on) {
        btn.className = 'flex h-8 items-center rounded-full bg-text px-3 text-[13px] font-semibold text-bg shadow-lg'
        btn.textContent = p.name
      } else if ((p.rating ?? 0) >= 4.5) {
        btn.className = 'flex size-8 items-center justify-center rounded-full border-2 border-white bg-[#E07B1A] shadow-md'
        btn.innerHTML = STAR_SVG
      } else {
        btn.className = 'flex size-6 items-center justify-center rounded-full border-[3px] border-[#E07B1A] bg-white shadow-md'
        btn.innerHTML = '<span style="width:8px;height:8px;border-radius:999px;background:#E07B1A;display:block"></span>'
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelect(p.id)
      })
      add(btn, p, on ? 6 : 2)
    }
    if (me) {
      const dot = document.createElement('div')
      dot.setAttribute('aria-hidden', 'true')
      dot.className = 'size-4 rounded-full border-[3px] border-white bg-[#2B6CB0] shadow-[0_0_0_6px_rgba(43,108,176,0.25)]'
      add(dot, me, 5)
    }
  }, [stops, places, selected, me, onSelect, theme])

  return <div ref={ref} className="h-full w-full bg-map-bg" aria-label="מפת הסביבה" role="region" />
}
