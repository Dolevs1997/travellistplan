import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { Crosshair, Globe, LocateFixed, Map as MapIcon, MapPin, Route, Search } from 'lucide-react'
import { Map as MLMap } from 'maplibre-gl'
import { cx } from './ui'
import { DESTINATIONS } from '../data/destinations'
import { searchCities } from '../data/citySearch'
import { distanceKm } from '../data/helpers'
import { radiusKmFor } from '../data/places'
import { applyMapTheme, currentStyleUrl } from '../maplibreSetup'
import { useTheme } from '../theme'

export type AreaKind = 'route' | 'me' | 'place' | 'map'

export interface Area {
  kind: AreaKind
  label: string
  center: { lat: number; lng: number } | null
  radiusKm: number
}

export const RADII = [1, 3, 5, 15, 45]

/** Nearest radius option to a value */
export const snapRadius = (km: number) => RADII.reduce((best, r) => (Math.abs(r - km) < Math.abs(best - km) ? r : best), RADII[0])

/* ---------- bar shown above the recommendations ---------- */

export function AreaBar({
  area,
  locating,
  error,
  onRoute,
  onMe,
  onSearch,
  onMap,
  onRadius,
}: {
  area: Area
  locating: boolean
  error: string
  onRoute: () => void
  onMe: () => void
  onSearch: () => void
  onMap: () => void
  onRadius: (km: number) => void
}) {
  const modes: { id: AreaKind; label: string; icon: typeof Route; onClick: () => void }[] = [
    { id: 'route', label: 'ליד המסלול', icon: Route, onClick: onRoute },
    { id: 'me', label: 'המיקום שלי', icon: LocateFixed, onClick: onMe },
    { id: 'place', label: 'עיר או אזור', icon: Search, onClick: onSearch },
    { id: 'map', label: 'על המפה', icon: MapIcon, onClick: onMap },
  ]
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3">
      <div role="group" aria-label="איפה לחפש המלצות" className="grid grid-cols-2 gap-2">
        {modes.map(({ id, label, icon: Icon, onClick }) => (
          <button
            key={id}
            type="button"
            aria-pressed={area.kind === id}
            onClick={onClick}
            className={cx(
              'flex h-11 items-center justify-center gap-1.5 rounded-tile border text-[13px] transition-colors duration-200 ease-out',
              area.kind === id ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-raised font-medium text-muted hover:text-text',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-[13px]" aria-live="polite">
        <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />
        {locating ? (
          <span className="text-muted">מאתרים את המיקום שלך…</span>
        ) : error ? (
          <span className="text-accent-2">{error}</span>
        ) : (
          <span className="min-w-0 truncate">
            המלצות ליד: <span className="font-semibold" dir="auto">{area.label}</span>
            {area.kind === 'me' && <span className="text-muted"> · מתעדכן כשזזים</span>}
          </span>
        )}
      </p>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-muted">רדיוס</span>
        <div role="group" aria-label="רדיוס החיפוש" className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={area.radiusKm === r}
              onClick={() => onRadius(r)}
              className={cx(
                'h-9 shrink-0 rounded-full border px-3 text-[12px] transition-colors duration-200 ease-out',
                area.radiusKm === r ? 'border-accent bg-accent/12 font-semibold text-accent' : 'border-border bg-raised text-muted',
              )}
            >
              {r} ק״מ
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- live location ---------- */

/**
 * Follows the device's position while `active`. Updates only after moving ~300 m,
 * so the recommendations don't reload on every GPS jitter.
 */
export function useLiveLocation(active: boolean) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const last = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!active) {
      setLocating(false)
      setError('')
      return
    }
    if (!('geolocation' in navigator)) {
      setError('הדפדפן הזה לא תומך באיתור מיקום')
      return
    }
    setLocating(!last.current)
    setError('')
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude }
        setLocating(false)
        if (!last.current || distanceKm(last.current, next) > 0.3) {
          last.current = next
          setPos(next)
        }
      },
      (err) => {
        setLocating(false)
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'אין הרשאה למיקום. אפשר לאשר גישה למיקום בהגדרות הדפדפן.'
            : 'לא הצלחנו לאתר את המיקום כרגע.',
        )
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [active])

  return { pos, locating, error }
}

/* ---------- search a city / town / village / region ---------- */

interface Hit {
  id: string
  name: string
  sub: string
  lat: number
  lng: number
  zoom: number
}

export function PlaceAreaSearch({
  open,
  onOpenChange,
  onPick,
  country,
  countryCode,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (a: Area) => void
  /** Search inside this country (the day's destination): its name, and ISO code when known */
  country?: string
  countryCode?: string
}) {
  const [q, setQ] = useState('')
  const [world, setWorld] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; hits: Hit[] }>({ status: 'idle', hits: [] })
  const term = q.trim()

  // Built-in destinations first: they have Hebrew names for regions like Sicily or Tuscany
  const local: Hit[] = useMemo(
    () =>
      (term.length < 2
        ? country
          ? DESTINATIONS.filter((d) => d.kind !== 'country' && d.country === country)
          : []
        : DESTINATIONS.filter((d) => d.name.includes(term) || d.country.includes(term))
      ).map((d) => ({
            id: d.id,
            name: d.name,
            sub: d.country,
            lat: d.lat,
            lng: d.lng,
            zoom: d.zoom,
          })),
    [term, country],
  )

  useEffect(() => {
    if (term.length < 2) {
      setWorld({ status: 'idle', hits: [] })
      return
    }
    const ctrl = new AbortController()
    setWorld((w) => ({ status: 'loading', hits: w.hits }))
    const t = window.setTimeout(() => {
      searchCities(term, ctrl.signal, countryCode)
        .then((hits) =>
          setWorld({
            status: 'done',
            hits: hits.map((h) => ({ id: h.id, name: h.name, sub: [h.admin, h.country].filter(Boolean).join(' · '), lat: h.lat, lng: h.lng, zoom: h.zoom })),
          }),
        )
        .catch((e: unknown) => (e as Error).name !== 'AbortError' && setWorld({ status: 'error', hits: [] }))
    }, 300)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [term, countryCode])

  const all = [...local, ...world.hits.filter((h) => !local.some((l) => l.name === h.name))]
  // Places in the day's country first
  const hits = country ? [...all.filter((h) => h.sub.includes(country)), ...all.filter((h) => !h.sub.includes(country))] : all

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Drawer.Content
          aria-describedby={undefined}
          dir="rtl"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[85%] max-w-[560px] flex-col gap-3 rounded-t-sheet border-t border-border bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] font-sans text-text shadow-sheet outline-none"
        >
          <span className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-handle" aria-hidden="true" />
          <Drawer.Title className="text-xl font-bold">המלצות באזור אחר</Drawer.Title>
          <label className="flex h-[52px] shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-raised px-4 text-muted focus-within:border-accent">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">{country ? `עיר, עיירה, כפר או מחוז ב${country}` : 'עיר, עיירה, כפר או מחוז'}</span>
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={country ? `עיר, עיירה, כפר או מחוז ב${country}` : 'עיר, עיירה, כפר או מחוז'}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
            />
          </label>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" data-vaul-no-drag aria-live="polite">
            {term.length < 2 && <p className="text-[14px] text-muted">הקלידו שם של מקום – מכפר קטן ועד מחוז שלם{country && local.length ? `, או בחרו מקום ב${country}:` : '.'}</p>}
            {term.length >= 2 && world.status === 'loading' && hits.length === 0 && <p className="text-[14px] text-muted">מחפשים…</p>}
            {world.status === 'error' && hits.length === 0 && <p className="text-[14px] text-muted">החיפוש לא זמין כרגע.</p>}
            {world.status === 'done' && hits.length === 0 && <p className="text-[14px] text-muted">לא מצאנו מקום בשם הזה. נסו באנגלית.</p>}
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onPick({ kind: 'place', label: h.name, center: { lat: h.lat, lng: h.lng }, radiusKm: snapRadius(radiusKmFor(h.zoom)) })}
                className="flex min-h-[56px] items-center gap-3 rounded-card border border-border bg-raised px-3 text-start hover:border-border-strong"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-water text-accent" aria-hidden="true">
                  <Globe size={16} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold" dir="auto">
                    {h.name}
                  </span>
                  <span className="truncate text-xs text-muted" dir="auto">
                    {h.sub}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/* ---------- choose on a map ---------- */

export function MapAreaPicker({
  open,
  onOpenChange,
  start,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  start: { lat: number; lng: number; radiusKm: number } | null
  onPick: (a: Area) => void
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} handleOnly>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Drawer.Content
          aria-describedby={undefined}
          dir="rtl"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[88%] max-w-[560px] flex-col gap-3 rounded-t-sheet border-t border-border bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] font-sans text-text shadow-sheet outline-none"
        >
          <Drawer.Handle className="!h-[5px] !w-10 shrink-0 !bg-handle" />
          <Drawer.Title className="text-xl font-bold">בחירת אזור על המפה</Drawer.Title>
          <p className="-mt-1 text-[13px] text-muted">הזיזו והגדילו את המפה. ההמלצות יהיו סביב הסמן שבמרכז.</p>
          {open && <PickerMap start={start} onPick={onPick} />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function PickerMap({ start, onPick }: { start: { lat: number; lng: number; radiusKm: number } | null; onPick: (a: Area) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const theme = useTheme()

  useEffect(() => {
    if (!ref.current) return
    let map: MLMap
    try {
      map = new MLMap({
        container: ref.current,
        style: currentStyleUrl(),
        center: start ? [start.lng, start.lat] : [12, 30],
        zoom: start ? (start.radiusKm <= 3 ? 13 : start.radiusKm <= 15 ? 11 : 8) : 2,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      })
    } catch {
      return
    }
    map.touchZoomRotate.disableRotation()
    map.on('load', () => applyMapTheme(map))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [start, theme])

  const choose = () => {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    const b = map.getBounds()
    // Half the shorter side of the visible map, as the search radius
    const halfW = distanceKm({ lat: c.lat, lng: b.getWest() }, { lat: c.lat, lng: c.lng })
    const halfH = distanceKm({ lat: b.getNorth(), lng: c.lng }, { lat: c.lat, lng: c.lng })
    const radius = snapRadius(Math.min(halfW, halfH))
    onPick({ kind: 'map', label: 'האזור שבחרת במפה', center: { lat: c.lat, lng: c.lng }, radiusKm: radius })
  }

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-border" data-vaul-no-drag>
        {/* maplibre-gl.css forces position:relative on the container, so size it explicitly */}
        <div ref={ref} className="h-full w-full bg-map-bg" role="region" aria-label="מפה לבחירת אזור" />
        <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent drop-shadow" aria-hidden="true">
          <Crosshair size={34} strokeWidth={2.5} />
        </span>
      </div>
      <button type="button" onClick={choose} className="h-[52px] shrink-0 rounded-tile bg-accent text-[15px] font-semibold text-on-accent">
        המלצות באזור הזה
      </button>
    </>
  )
}
