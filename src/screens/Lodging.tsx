import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BedDouble, Check, ChevronDown, ExternalLink, Footprints, Globe, House, MapPin, Pencil, RefreshCw, Search, Star, Trash2, X } from 'lucide-react'
import { LngLatBounds, Map as MLMap, Marker, type GeoJSONSource } from 'maplibre-gl'
import LodgingSearch from '../components/LodgingSearch'
import { IconButton, cx } from '../components/ui'
import { addDays, lodgingLinks } from '../data/brief'
import { distanceKm, hasLocation, shortDate, tripLegs } from '../data/helpers'
import { LODGING_LABEL, bookingFor, googlePlaceUrl, lodgingDetails, lodgingNear, nearStops, stopsCenter, type LodgingDetails, type LodgingKind, type LodgingPlace } from '../data/lodging'
import { ON_STREET_M, WALK_M_PER_MIN, lodgingAround, metersTo, walkMinutes, type Target } from '../data/placeSearch'
import { briefOf } from '../data/tripEdit'
import { applyMapTheme, currentStyleUrl } from '../maplibreSetup'
import { useTrip } from '../state/TripStore'
import type { Lodging } from '../data/types'
import { useTheme } from '../theme'
import { navigate, prefersReducedMotion } from '../router'

type Area = 'stops' | 'center' | 'map'
type Filter = 'all' | 'hotel' | 'apartment' | 'hostel'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'hotel', label: 'מלונות' },
  { id: 'apartment', label: 'דירות' },
  { id: 'hostel', label: 'הוסטלים' },
]
type Walk = 0 | 5 | 10 | 15
const WALKS: { id: Walk; label: string }[] = [
  { id: 0, label: 'על המקום עצמו' },
  { id: 5, label: 'עד 5 דק׳ הליכה' },
  { id: 10, label: 'עד 10 דק׳ הליכה' },
  { id: 15, label: 'עד 15 דק׳ הליכה' },
]
const walkMeters = (w: Walk) => (w === 0 ? ON_STREET_M : w * WALK_M_PER_MIN)
type Sort = 'near' | 'rating'
/** A Hebrew prefix letter before a name: "מטירת…", but "מ-Alfama" before a name in Latin letters */
const heb = (prefix: string, name: string) => (/^[\u0590-\u05FF]/.test(name) ? `${prefix}${name}` : `${prefix}-${name}`)

const matchesFilter = (k: LodgingKind, f: Filter) => f === 'all' || (f === 'hotel' ? k === 'hotel' || k === 'guest' : k === f)

const PIN_COLOR: Record<LodgingKind, string> = { hotel: 'bg-accent', guest: 'bg-accent', apartment: 'bg-[#2B6CB0]', hostel: 'bg-[#6B7280]' }
const BED_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>'
const HOME_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'

/** Choose where to sleep in one city: places on a map, ranked by how close they are to the day plans */
export default function Lodging({ legIndex }: { legIndex: number }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const legs = tripLegs(trip)
  const leg = legs[legIndex]
  const brief = briefOf(trip)

  // Only stops in this city (a day trip far away shouldn't pull the search area out of town)
  const stops = useMemo(() => (leg ? leg.days.flatMap((d) => d.stops).filter((s) => hasLocation(s) && distanceKm(s, leg.destination) <= 15) : []), [leg])
  const cityCenter = leg ? { lat: leg.destination.lat, lng: leg.destination.lng } : { lat: 0, lng: 0 }
  const planCenter = stopsCenter(stops)
  const [area, setArea] = useState<Area>(planCenter ? 'stops' : 'center')
  const [mapArea, setMapArea] = useState<{ center: { lat: number; lng: number }; radius: number } | null>(null)
  const [moved, setMoved] = useState<{ center: { lat: number; lng: number }; radius: number } | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [places, setPlaces] = useState<LodgingPlace[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // The place whose details sheet is open
  const [openId, setOpenId] = useState<string | null>(null)
  const listRef = useRef<HTMLHeadingElement>(null)
  // "Stay near…": a street, area or stop picked in the search, and the filters that go with it
  const [target, setTarget] = useState<Target | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [walk, setWalk] = useState<Walk>(5)
  const [walkMenu, setWalkMenu] = useState(false)
  const [minRating, setMinRating] = useState(false)
  const [sort, setSort] = useState<Sort>('near')
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const pickTarget = useCallback((t: Target) => {
    setTarget(t)
    setSearchOpen(false)
    setSelected(null)
    setSort('near')
  }, [])
  const closeSheet = useCallback(() => setOpenId(null), [])

  const search =
    area === 'map' && mapArea ? mapArea : area === 'stops' && planCenter ? { center: planCenter, radius: 1500 } : { center: cityCenter, radius: 1500 }
  const searchKey = target
    ? `t:${target.label}:${target.center.lat.toFixed(4)},${target.center.lng.toFixed(4)}:${walk}`
    : `${search.center.lat.toFixed(4)},${search.center.lng.toFixed(4)},${search.radius}`

  useEffect(() => {
    const ctrl = new AbortController()
    setPlaces(null)
    setFailed(false)
    setLoadingMore(true)
    const progress = (first: LodgingPlace[]) => first.length && setPlaces(first)
    ;(target ? lodgingAround(target, walkMeters(walk), ctrl.signal, progress) : lodgingNear(search.center, search.radius, ctrl.signal, progress))
      .then(setPlaces)
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setFailed(true)
          setPlaces((p) => p ?? [])
        }
      })
      .finally(() => !ctrl.signal.aborted && setLoadingMore(false))
    return () => ctrl.abort()
    // searchKey stands for the search area, or the picked place and walking distance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey])

  if (!leg) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">העיר הזו כבר לא בטיול.</p>
        <button type="button" onClick={() => navigate('/edit')} className="h-11 rounded-tile bg-accent px-5 font-semibold text-on-accent">
          חזרה
        </button>
      </div>
    )
  }

  const city = leg.destination.name
  const isLast = legIndex === legs.length - 1
  const nights = Math.max(1, leg.days.length - (isLast ? 1 : 0))
  const checkIn = leg.days[0].date
  const checkOut = addDays(checkIn, nights)
  const stay = (trip.lodgings ?? []).find((l) => l.checkIn < checkOut && l.checkOut > checkIn)
  const sites = lodgingLinks(brief, city, checkIn, checkOut)
  const isStay = (p: LodgingPlace) => !!stay && (stay.placeId ? stay.placeId === p.id : stay.name === p.name)

  const rating = (p: LodgingPlace) => p.google?.rating ?? 0
  const measured = (places ?? []).map((p) => ({ p, near: nearStops(p, stops), d: distanceKm(p, search.center), m: target ? metersTo(p, target) : 0 }))
  // With a picked place: how many are within each walking distance (for the menu)
  const walkCounts = target ? WALKS.map((w) => measured.filter((r) => r.m <= walkMeters(w.id)).length) : []
  const ranked = measured
    .filter((r) => matchesFilter(r.p.kind, filter) && (!minRating || rating(r.p) >= 4) && (!target || r.m <= walkMeters(walk)))
    .sort((a, b) =>
      sort === 'rating'
        ? rating(b.p) - rating(a.p) || (b.p.google?.ratingCount ?? 0) - (a.p.google?.ratingCount ?? 0)
        : target
          ? a.m - b.m
          : b.near.count - a.near.count || a.d - b.d,
    )
  const nearTarget = (m: number) =>
    !target
      ? undefined
      : m <= ON_STREET_M
        ? target.kind === 'line'
          ? `על ${target.label}`
          : target.kind === 'area' && m === 0
            ? heb('ב', target.label)
            : `ליד ${target.label}`
        : `${walkMinutes(m)} דק׳ הליכה ${heb('מ', target.label)}`
  const selectedItem = ranked.find((r) => r.p.id === selected)
  const list = selectedItem ? [selectedItem, ...ranked.filter((r) => r !== selectedItem)] : ranked

  const openPlace = (id: string) => {
    setSelected(id)
    setOpenId(id)
  }
  const open = ranked.find((r) => r.p.id === openId)

  const save = (p: LodgingPlace) => {
    if (stay) dispatch({ type: 'removeExtra', list: 'lodgings', id: stay.id })
    dispatch({
      type: 'addLodging',
      item: {
        id: `lodging-${Date.now().toString(36)}`,
        name: p.name,
        area: city,
        // A new pick keeps the dates you set for this city's stay
        checkIn: stay?.checkIn ?? checkIn,
        checkOut: stay?.checkOut ?? checkOut,
        lat: p.lat,
        lng: p.lng,
        kind: p.kind,
        placeId: p.id,
      },
    })
  }
  const back = () => history.back()

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col">
      <div className="relative h-[52vh] min-h-[320px]">
        <LodgingMap
          places={ranked.map((r) => r.p)}
          stops={stops}
          center={target ? target.center : search.center}
          target={target}
          walkM={walkMeters(walk)}
          selected={selected}
          savedName={stay?.name}
          onSelect={openPlace}
          onMoved={setMoved}
        />
        <div className="pointer-events-none absolute inset-x-3.5 top-3.5 z-10 flex flex-col gap-2.5">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-surface py-1.5 ps-1.5 pe-3.5 shadow-[var(--float-shadow)]">
            <IconButton label="חזרה" onClick={back} variant="surface" className="!border-0">
              <ArrowRight size={20} aria-hidden="true" />
            </IconButton>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-[17px] font-bold">לינה ב{city}</h1>
              <span className="text-xs text-muted">
                {shortDate(checkIn)} – {shortDate(checkOut)} · {nights === 1 ? 'לילה 1' : `${nights} לילות`} · {brief.adults + brief.children.length} נוסעים
              </span>
            </div>
          </div>
          {target ? (
            <>
              <div className="pointer-events-auto flex items-center gap-1 rounded-2xl bg-surface p-1.5 shadow-[var(--float-shadow)]">
                <button type="button" onClick={() => setSearchOpen(true)} className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-raised px-3 text-start">
                  <Search size={16} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <bdi className="truncate text-[15px] font-semibold">{target.label}</bdi>
                    {target.sub && <span className="truncate text-[11px] text-muted">{target.sub}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="ניקוי החיפוש"
                  onClick={() => {
                    setTarget(null)
                    setWalkMenu(false)
                  }}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="no-scrollbar pointer-events-auto -mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1" role="group" aria-label="סינון">
                <AreaChip on onClick={() => setWalkMenu((v) => !v)} expanded={walkMenu}>
                  <Footprints size={14} aria-hidden="true" />
                  {walk === 0 && target.kind === 'line' ? 'על הרחוב עצמו' : WALKS.find((w) => w.id === walk)?.label}
                  <ChevronDown size={13} aria-hidden="true" />
                </AreaChip>
                <AreaChip on={minRating} onClick={() => setMinRating((v) => !v)}>
                  <Star size={13} aria-hidden="true" />
                  4+
                </AreaChip>
                <AreaChip on={sort === 'rating'} onClick={() => setSort((v) => (v === 'rating' ? 'near' : 'rating'))}>
                  {sort === 'rating' ? 'הכי מדורגים' : 'הכי קרובים'}
                </AreaChip>
              </div>
              {walkMenu && (
                <div role="menu" aria-label="מרחק הליכה" className="pointer-events-auto flex w-60 flex-col gap-0.5 rounded-card bg-surface p-2 shadow-[0_12px_32px_rgba(21,24,29,0.2)]">
                  <span className="truncate px-2 pt-1.5 pb-1 text-xs text-muted">
                    מרחק <bdi>{heb('מ', target.label)}</bdi>
                  </span>
                  {WALKS.map((w, i) => (
                    <button
                      key={w.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={walk === w.id}
                      onClick={() => {
                        setWalk(w.id)
                        setWalkMenu(false)
                      }}
                      className={cx('flex h-10 items-center justify-between rounded-[10px] px-2.5 text-sm', walk === w.id ? 'bg-accent/12 font-semibold text-accent' : 'hover:bg-raised')}
                    >
                      {w.id === 0 && target.kind === 'line' ? 'על הרחוב עצמו' : w.label}
                      {/* Counts are known only up to the distance searched so far */}
                      {w.id <= walk && <span className="text-xs text-muted">{walkCounts[i]}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="pointer-events-auto flex h-11 items-center gap-2.5 rounded-[14px] bg-surface px-3.5 text-sm text-muted shadow-[var(--float-shadow)]"
              >
                <Search size={17} className="text-text" aria-hidden="true" />
                חפשו ליד רחוב, שדרה, שכונה או תחנה
              </button>
          <div className="no-scrollbar pointer-events-auto -mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1" role="group" aria-label="אזור">
              {planCenter && (
                <AreaChip on={area === 'stops'} onClick={() => setArea('stops')}>
                  <MapPin size={14} aria-hidden="true" />
                  ליד העצירות שלכם
                </AreaChip>
              )}
              <AreaChip on={area === 'center'} onClick={() => setArea('center')}>
                מרכז {city}
              </AreaChip>
              {mapArea && (
                <AreaChip on={area === 'map'} onClick={() => setArea('map')}>
                  האזור שבחרתם במפה
                </AreaChip>
              )}
              <AreaChip on={minRating} onClick={() => setMinRating((v) => !v)}>
                <Star size={13} aria-hidden="true" />
                4+
              </AreaChip>
            </div>
            </>
          )}
        </div>
        {!target && moved && distanceKm(moved.center, search.center) > 0.3 && (
          <button
            type="button"
            onClick={() => {
              setMapArea(moved)
              setArea('map')
              setMoved(null)
            }}
            className="absolute bottom-10 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-accent shadow-[var(--float-shadow)]"
          >
            <RefreshCw size={14} aria-hidden="true" />
            חיפוש באזור הזה
          </button>
        )}
      </div>

      <section aria-label="מקומות לינה" className="relative -mt-7 flex flex-1 flex-col gap-2.5 rounded-t-sheet bg-bg px-4 pt-2 pb-6 shadow-[var(--sheet-shadow)]">
        <div className="flex h-5 items-center justify-center" aria-hidden="true">
          <span className="h-[5px] w-10 rounded-full bg-handle" />
        </div>

        {stay && (
          <ChosenStay
            key={stay.id}
            stay={stay}
            legFrom={checkIn}
            legTo={checkOut}
            onChange={() => {
              // The list of places, or (when there's none) the field for typing the place's name
              const manual = document.getElementById('manual-lodging')
              const target = listRef.current ?? manual
              target?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
              if (!listRef.current) manual?.focus({ preventScroll: true })
            }}
          />
        )}

        {places === null ? (
          <p className="py-6 text-center text-sm text-muted" role="status">
            מחפשים מקומות לינה באזור…
          </p>
        ) : places.length === 0 && loadingMore ? (
          <p className="py-6 text-center text-sm text-muted" role="status">
            מחפשים מקומות לינה באזור…
          </p>
        ) : places.length === 0 && target && walk < 15 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted">לא מצאנו מקומות לינה במרחק הזה מ{target.label}.</p>
            <button type="button" onClick={() => setWalk(walk === 0 ? 5 : walk === 5 ? 10 : 15)} className="h-11 rounded-tile bg-accent px-5 text-sm font-semibold text-on-accent">
              הרחבה ל-{walk === 0 ? 5 : walk === 5 ? 10 : 15} דק׳ הליכה
            </button>
          </div>
        ) : places.length === 0 ? (
          <Fallback city={city} sites={sites} failed={failed} onManual={(name) => save({ id: 'manual', name, kind: 'hotel', lat: cityCenter.lat, lng: cityCenter.lng })} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <h2 ref={listRef} className="scroll-mt-4 text-[17px] font-bold whitespace-nowrap">
                  {ranked.length === 1 ? 'מקום אחד' : `${ranked.length} מקומות`} {target ? (target.kind === 'line' ? 'ליד הרחוב' : target.kind === 'area' ? 'באזור ובסביבה' : 'ליד המקום') : 'באזור'}
                </h2>
                {target && (
                  <span className="truncate text-xs text-muted">
                    {walk === 0 ? 'ממש עליו' : `עד ${walk} דק׳ הליכה`} <bdi>{heb('מ', target.label)}</bdi>
                    {minRating ? ' · דירוג 4+' : ''}
                  </span>
                )}
              </span>
              <div role="group" aria-label="סוג לינה" className="flex gap-1 rounded-xl bg-raised p-[3px]">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cx('h-8 rounded-[9px] px-2.5 text-xs', filter === f.id ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(21,24,29,0.1)]' : 'font-medium text-muted')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {ranked.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">
                {target || minRating ? 'אין מקומות שמתאימים לסינון. נסו מרחק הליכה גדול יותר או בלי סינון הדירוג.' : 'אין מקומות מהסוג הזה באזור. נסו סוג אחר או אזור אחר.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {list.map(({ p, near, m }) => (
                  <LodgingCard key={p.id} place={p} near={near} nearTarget={nearTarget(m)} saved={isStay(p)} highlighted={p.id === selected} onOpen={() => openPlace(p.id)} />
                ))}
              </ul>
            )}
            <p className="text-xs leading-relaxed text-muted" role="status">
              {loadingMore ? 'טוענים עוד מקומות באזור…' : `המקומות מ-${places.some((p) => p.google) ? 'Google ו-' : ''}OpenStreetMap. מחירים וזמינות – באתרי ההזמנות.`}
            </p>
          </>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
          <span className="shrink-0 text-xs text-muted">מחירים וזמינות:</span>
          {sites.slice(0, 2).map((s) => (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface text-sm font-semibold"
            >
              {s.id === 'booking' ? 'Booking' : 'Airbnb'}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>

      {searchOpen && <LodgingSearch city={city} center={cityCenter} days={leg.days} onPick={pickTarget} onClose={closeSearch} />}

      {open && (
        <LodgingSheet
          place={open.p}
          city={city}
          near={open.near}
          saved={isStay(open.p)}
          bookingUrl={open.p.kind === 'apartment' ? sites[1].url : bookingFor(open.p.name, city, checkIn, checkOut, brief.adults, brief.rooms)}
          onSave={() => save(open.p)}
          onClose={closeSheet}
        />
      )}
    </div>
  )
}

/** The lodging you picked for this city: its dates and notes, with edit, change and remove */
function ChosenStay({
  stay,
  legFrom,
  legTo,
  onChange,
}: {
  stay: Lodging
  legFrom: string
  legTo: string
  onChange: () => void
}) {
  const { dispatch } = useTrip()
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [from, setFrom] = useState(stay.checkIn)
  const [to, setTo] = useState(stay.checkOut)
  const [note, setNote] = useState(stay.note ?? '')
  const nights = Math.round((new Date(`${stay.checkOut}T12:00:00`).getTime() - new Date(`${stay.checkIn}T12:00:00`).getTime()) / 86_400_000)
  const datesOk = !!from && !!to && from < to && from >= legFrom && to <= legTo

  const startEdit = () => {
    setFrom(stay.checkIn)
    setTo(stay.checkOut)
    setNote(stay.note ?? '')
    setEditing(true)
  }
  const saveEdit = () => {
    if (!datesOk) return
    dispatch({ type: 'updateLodging', id: stay.id, patch: { checkIn: from, checkOut: to, note: note.trim() || undefined } })
    setEditing(false)
  }
  const btn = 'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface text-[13px] font-semibold'

  return (
    <section aria-label="הלינה שבחרתם" className="flex flex-col gap-2.5 rounded-[20px] border border-accent/40 bg-accent/8 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent text-on-accent">
          <Check size={18} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs text-muted">הלינה שבחרתם</span>
          <span className="truncate text-base font-semibold">{stay.name}</span>
          <span className="text-xs text-muted">
            {shortDate(stay.checkIn)} – {shortDate(stay.checkOut)} · {nights === 1 ? 'לילה 1' : `${nights} לילות`}
          </span>
          {stay.note && !editing && <span className="mt-0.5 text-[13px]">{stay.note}</span>}
        </span>
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-2.5 rounded-card bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault()
            saveEdit()
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              צ׳ק-אין
              <input type="date" value={from} min={legFrom} max={legTo} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-xl border border-border-strong bg-surface px-2.5 text-sm text-text outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              צ׳ק-אאוט
              <input type="date" value={to} min={legFrom} max={legTo} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-xl border border-border-strong bg-surface px-2.5 text-sm text-text outline-none focus:border-accent" />
            </label>
          </div>
          {!datesOk && (
            <p role="alert" className="text-xs text-accent-2">
              התאריכים צריכים להיות בין {shortDate(legFrom)} ל-{shortDate(legTo)}, והצ׳ק-אאוט אחרי הצ׳ק-אין.
            </p>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted">
            מספר הזמנה או הערות
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="למשל: הזמנה 48211, צ׳ק-אין מ-15:00"
              className="h-11 rounded-xl border border-border-strong bg-surface px-3 text-sm text-text outline-none focus:border-accent"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!datesOk} className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-40">
              שמירה
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-xl border border-border-strong px-4 text-sm font-medium">
              ביטול
            </button>
          </div>
        </form>
      ) : confirmRemove ? (
        <div role="alertdialog" aria-label="הסרת הלינה" className="flex flex-col gap-2 rounded-card bg-surface p-3">
          <span className="text-sm">להסיר את {stay.name} מהטיול?</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'removeExtra', list: 'lodgings', id: stay.id })}
              className="h-10 flex-1 rounded-xl bg-[#B42318] text-sm font-semibold text-white"
            >
              הסרה
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)} className="h-10 flex-1 rounded-xl border border-border-strong text-sm font-medium">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={startEdit} className={btn}>
            <Pencil size={14} aria-hidden="true" />
            עריכה
          </button>
          <button type="button" onClick={onChange} className={btn}>
            <RefreshCw size={14} aria-hidden="true" />
            החלפה
          </button>
          <button type="button" onClick={() => setConfirmRemove(true)} className={cx(btn, 'text-[#B42318]')}>
            <Trash2 size={14} aria-hidden="true" />
            הסרה
          </button>
        </div>
      )}
    </section>
  )
}

function AreaChip({ on, onClick, children, expanded }: { on: boolean; onClick: () => void; children: React.ReactNode; expanded?: boolean }) {
  return (
    <button
      type="button"
      // A menu button says whether its menu is open; the others are toggles
      aria-pressed={expanded === undefined ? on : undefined}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      onClick={onClick}
      className={cx(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium shadow-[0_2px_8px_rgba(21,24,29,0.12)]',
        on ? 'bg-text text-bg' : 'bg-surface',
      )}
    >
      {children}
    </button>
  )
}

/** The card's picture: the place's photo, or (when there's none) a tinted panel with its type's icon */
function PlaceImage({ place: p, photo, onFail, className }: { place: LodgingPlace; photo?: string; onFail: () => void; className: string }) {
  if (photo) return <img src={photo} alt={p.name} loading="lazy" onError={onFail} className={cx('object-cover', className)} />
  const apartment = p.kind === 'apartment'
  const hostel = p.kind === 'hostel'
  const Icon = apartment ? House : BedDouble
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-1.5',
        apartment ? 'bg-[#2B6CB0]/10 text-[#2B6CB0]' : hostel ? 'bg-raised text-muted' : 'bg-accent/10 text-accent',
        className,
      )}
    >
      <Icon size={34} strokeWidth={1.75} aria-hidden="true" />
      <span className="text-xs font-medium text-muted">אין תמונה כאן · תמונות בגוגל</span>
    </div>
  )
}

/** Google rating, e.g. "4.8 ★ (655 ביקורות)" */
function Rating({ value, count, short }: { value: number; count?: number; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold" aria-label={`דירוג ${value.toFixed(1)} מתוך 5${count ? `, ${count} ביקורות` : ''}`}>
      <span>{value.toFixed(1)}</span>
      <Star size={13} className="fill-[#F2B01E] text-[#F2B01E]" aria-hidden="true" />
      {count ? <span className="font-normal text-muted">({count.toLocaleString('en-US')}{short ? '' : ' ביקורות'})</span> : null}
    </span>
  )
}

function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cx('text-[#B7791F]', className)} aria-label={`${n} כוכבים`}>
      {'★'.repeat(n)}
      <span className="text-border-strong" aria-hidden="true">
        {'★'.repeat(5 - n)}
      </span>
    </span>
  )
}

/** One place in the list: picture, name, type and stars; tapping opens its details */
function LodgingCard({
  place: p,
  near,
  nearTarget,
  saved,
  highlighted,
  onOpen,
}: {
  place: LodgingPlace
  near: { minutes: number; count: number }
  /** "4 דק׳ הליכה מ-Avenida da Liberdade", when a place was picked in the search */
  nearTarget?: string
  saved: boolean
  highlighted: boolean
  onOpen: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const info = useLodgingDetails(p, ref)
  const [photoFailed, setPhotoFailed] = useState(false)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [highlighted])
  const stars = info?.stars ?? p.stars
  const nearText = near.count ? `${near.minutes} דק׳ הליכה ${near.count === 1 ? 'מעצירה אחת' : `מ-${near.count} עצירות`}` : near.minutes ? `${near.minutes} דק׳ מהעצירה הקרובה` : ''
  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          'flex w-full flex-col overflow-hidden rounded-[20px] bg-surface text-start transition-shadow duration-200 ease-out',
          highlighted ? 'border-2 border-accent shadow-[0_6px_18px_color-mix(in_srgb,var(--color-accent)_14%,transparent)]' : 'border border-border',
        )}
      >
        <span className="relative block">
          <PlaceImage place={p} photo={info?.photo && !photoFailed ? info.photo : undefined} onFail={() => setPhotoFailed(true)} className="h-36 w-full" />
          <span className="absolute top-2.5 left-2.5 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold shadow-sm">{LODGING_LABEL[p.kind]}</span>
          {saved && (
            <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent shadow-sm">
              <Check size={13} aria-hidden="true" />
              הלינה שלכם
            </span>
          )}
        </span>
        <span className="flex flex-col gap-1 p-3">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold">{p.name}</span>
            {stars ? <Stars n={stars} className="shrink-0 text-sm" /> : null}
          </span>
          {info?.rating ? (
            <span className="text-[13px]">
              <Rating value={info.rating} count={info.ratingCount} short />
            </span>
          ) : null}
          {nearTarget ? (
            <span className="text-xs font-semibold text-accent">{nearTarget}</span>
          ) : (
            nearText && <span className={cx('text-xs', near.count ? 'font-semibold text-accent' : 'text-muted')}>{nearText}</span>
          )}
        </span>
      </button>
    </li>
  )
}

/** A place's full details: large picture, stars, address, phone, and links for reviews, prices and its own site */
function LodgingSheet({
  place: p,
  city,
  near,
  saved,
  bookingUrl,
  onSave,
  onClose,
}: {
  place: LodgingPlace
  city: string
  near: { minutes: number; count: number }
  saved: boolean
  bookingUrl: string
  onSave: () => void
  onClose: () => void
}) {
  const [info, setInfo] = useState<LodgingDetails | null>(null)
  const [photoFailed, setPhotoFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let live = true
    lodgingDetails(p).then((d) => live && setInfo(d))
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      live = false
      window.removeEventListener('keydown', onKey)
    }
  }, [p, onClose])
  const stars = info?.stars ?? p.stars
  const apartment = p.kind === 'apartment'
  const linkBtn = 'flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong bg-surface px-3 text-sm font-semibold'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-y-auto rounded-t-sheet bg-bg shadow-[var(--sheet-shadow)] sm:rounded-sheet"
      >
        <div className="relative shrink-0">
          <PlaceImage place={p} photo={info?.photo && !photoFailed ? info.photo : undefined} onFail={() => setPhotoFailed(true)} className="h-56 w-full" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-surface shadow-[var(--float-shadow)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <span className="absolute top-3 left-3 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold shadow-sm">{LODGING_LABEL[p.kind]}</span>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <header className="flex flex-col gap-1">
            <h2 className="text-[22px] leading-tight font-bold">{p.name}</h2>
            {info?.rating ? (
              <span className="text-[15px]">
                <Rating value={info.rating} count={info.ratingCount} />
                <span className="ms-1.5 text-xs font-normal text-muted">בגוגל</span>
              </span>
            ) : null}
            <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              {stars ? <Stars n={stars} /> : <span>דירוג כוכבים לא ידוע</span>}
              <span aria-hidden="true">·</span>
              <span>{city}</span>
            </span>
            {near.minutes > 0 && (
              <span className={cx('text-[13px]', near.count ? 'font-semibold text-accent' : 'text-muted')}>
                {near.count ? `${near.minutes} דק׳ הליכה ${near.count === 1 ? 'מעצירה אחת' : `מ-${near.count} עצירות`} שלכם` : `${near.minutes} דק׳ הליכה מהעצירה הקרובה`}
              </span>
            )}
          </header>

          <dl className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface px-3.5 text-sm">
            <div className="flex gap-3 py-2.5">
              <dt className="w-14 shrink-0 text-muted">כתובת</dt>
              <dd className="min-w-0">{info ? info.address ? <bdi>{info.address}</bdi> : <span className="text-muted">לא ידועה</span> : <span className="text-muted">טוען…</span>}</dd>
            </div>
            <div className="flex gap-3 py-2.5">
              <dt className="w-14 shrink-0 text-muted">טלפון</dt>
              <dd>
                {info?.phone ? (
                  <a href={`tel:${info.phone.replace(/\s/g, '')}`} className="font-medium text-accent" dir="ltr">
                    {info.phone}
                  </a>
                ) : (
                  <span className="text-muted">{info ? 'לא ידוע' : 'טוען…'}</span>
                )}
              </dd>
            </div>
            {(info?.rooms || info?.wifi || info?.wheelchair) && (
              <div className="flex flex-wrap gap-1.5 py-2.5">
                {info.rooms && <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs">{info.rooms} חדרים</span>}
                {info.wifi && <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs">Wi-Fi</span>}
                {info.wheelchair && <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs">נגיש</span>}
              </div>
            )}
          </dl>

          <a href={info?.mapsUrl ?? googlePlaceUrl(p, city)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-[#B7791F]/12 text-[#B7791F]">
              <Star size={20} aria-hidden="true" />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{info?.ratingCount ? `כל ${info.ratingCount.toLocaleString('en-US')} הביקורות והתמונות` : 'ביקורות ותמונות'}</span>
              <span className="text-xs text-muted">כל הביקורות, התמונות ושעות הקבלה – בגוגל מפות</span>
            </span>
            <ExternalLink size={16} className="text-muted" aria-hidden="true" />
          </a>

          <div className="grid grid-cols-2 gap-2">
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className={linkBtn}>
              {apartment ? 'ב-Airbnb' : 'מחיר ב-Booking'}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
            {info?.website ? (
              <a href={info.website} target="_blank" rel="noopener noreferrer" className={linkBtn}>
                <Globe size={15} aria-hidden="true" />
                האתר של המקום
              </a>
            ) : (
              <a href={googlePlaceUrl(p, city)} target="_blank" rel="noopener noreferrer" className={linkBtn}>
                <MapPin size={15} aria-hidden="true" />
                במפה
              </a>
            )}
          </div>

          <button type="button" onClick={onSave} disabled={saved} className="h-[52px] rounded-2xl bg-accent text-base font-semibold text-on-accent disabled:opacity-60">
            {saved ? 'זו הלינה שלכם' : 'שמירה כלינה'}
          </button>
          {info?.photo && !photoFailed && info.photoAuthor && (
            <span className="text-center text-[11px] text-muted">
              תמונה:{' '}
              {info.photoAuthorUrl ? (
                <a href={info.photoAuthorUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {info.photoAuthor}
                </a>
              ) : (
                info.photoAuthor
              )}{' '}
              · Google
            </span>
          )}
          {info?.photo && !photoFailed && info.photoPage && (
            <a href={info.photoPage} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] text-muted hover:underline">
              תמונה: Wikimedia Commons
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/** A place's details (photo, stars, contact), fetched once the card scrolls near the screen */
function useLodgingDetails(p: LodgingPlace, ref: React.RefObject<HTMLElement | null>) {
  const [info, setInfo] = useState<LodgingDetails | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        lodgingDetails(p).then((d) => live && setInfo(d))
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => {
      live = false
      io.disconnect()
    }
  }, [p, ref])
  return info
}

/** No places found (or the map service is unreachable): the booking sites, and adding a place by name */
function Fallback({ city, sites, failed, onManual }: { city: string; sites: { id: string; label: string; url: string }[]; failed: boolean; onManual: (name: string) => void }) {
  const [name, setName] = useState('')
  const desc: Record<string, string> = { booking: 'מחירים וזמינות בזמן אמת', airbnb: 'דירות ובתים שלמים', google: 'ביקורות ותמונות לכל מקום' }
  const title: Record<string, string> = { booking: 'מלונות ב-Booking', airbnb: 'דירות ב-Airbnb', google: 'לינה בגוגל' }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-accent-2/70 bg-accent-2/6 px-3.5 py-3">
        <MapPin size={22} className="mt-px shrink-0 text-accent-2" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-accent-2">{failed ? 'לא הצלחנו לטעון מקומות לינה כרגע' : 'אין לנו מספיק מידע על לינה באזור הזה'}</h2>
          <p className="text-[13px] leading-[1.45] text-muted">חפשו באתרים האלה – הם ייפתחו עם {city}, התאריכים ומספר הנוסעים כבר מוזנים.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {sites.map((s) => (
          <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="flex h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent/12 text-accent">
              {s.id === 'airbnb' ? <House size={18} aria-hidden="true" /> : s.id === 'google' ? <Search size={18} aria-hidden="true" /> : <BedDouble size={18} aria-hidden="true" />}
            </span>
            <span className="flex flex-1 flex-col gap-px">
              <span className="text-[15px] font-semibold">{title[s.id] ?? s.label}</span>
              <span className="text-xs text-muted">{desc[s.id] ?? ''}</span>
            </span>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        ))}
      </div>
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onManual(name.trim())
          setName('')
        }}
      >
        <label htmlFor="manual-lodging" className="text-[13px] font-medium text-muted">
          כבר הזמנתם? הוסיפו את המקום
        </label>
        <div className="flex gap-2">
          <input
            id="manual-lodging"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם המלון או הדירה"
            className="h-12 min-w-0 flex-1 rounded-[14px] border-[1.5px] border-dashed border-border-strong bg-transparent px-3 text-[15px] outline-none focus:border-accent"
          />
          <button type="submit" disabled={!name.trim()} className="h-12 rounded-[14px] bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-40">
            שמירה
          </button>
        </div>
      </form>
    </div>
  )
}

/** The lodging map: a pin per place (by type), small dots for the city's stops; drag to look elsewhere */
/** Meters to pixels at each zoom, so the street's band is as wide as the walking distance on both sides */
function bandWidth(walkM: number, lat: number) {
  const metersPerPixel = (z: number) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z)
  return ['interpolate', ['exponential', 2], ['zoom'], 10, (2 * walkM) / metersPerPixel(10), 20, (2 * walkM) / metersPerPixel(20)] as unknown as number
}

/** The street as lines, or a circle (the area plus the walking distance) for a place or neighbourhood */
function targetShape(t: Target | null, walkM: number): GeoJSON.FeatureCollection {
  if (!t) return { type: 'FeatureCollection', features: [] }
  if (t.kind === 'line')
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { part: 'street' }, geometry: { type: 'MultiLineString', coordinates: t.lines } }] }
  const r = t.radiusM + walkM
  const ring: [number, number][] = []
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI
    ring.push([t.center.lng + (r * Math.sin(a)) / (111320 * Math.cos((t.center.lat * Math.PI) / 180)), t.center.lat + (r * Math.cos(a)) / 111320])
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { part: 'band' }, geometry: { type: 'Polygon', coordinates: [ring] } }] }
}

function LodgingMap({
  places,
  stops,
  center,
  target,
  walkM,
  selected,
  savedName,
  onSelect,
  onMoved,
}: {
  places: LodgingPlace[]
  stops: { lat: number; lng: number }[]
  center: { lat: number; lng: number }
  /** A picked street or place: drawn with a band as wide as the walking distance */
  target: Target | null
  walkM: number
  selected: string | null
  savedName?: string
  onSelect: (id: string) => void
  onMoved: (a: { center: { lat: number; lng: number }; radius: number }) => void
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
      map = new MLMap({ container: ref.current, style: currentStyleUrl(), center: [center.lng, center.lat], zoom: 14.2, attributionControl: { compact: true } })
    } catch {
      return
    }
    mapRef.current = map
    map.on('load', () => applyMapTheme(map))
    map.on('moveend', (e) => {
      if (!(e as { originalEvent?: unknown }).originalEvent) return // only moves the user made
      const c = map.getCenter()
      const b = map.getBounds()
      const radius = Math.min(3000, Math.max(600, distanceKm({ lat: c.lat, lng: c.lng }, { lat: b.getNorth(), lng: c.lng }) * 1000))
      onMovedRef.current({ center: { lat: c.lat, lng: c.lng }, radius })
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
    // the map is created once per theme; center changes are flown to below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => {
    if (target) return // fitted to the picked place below
    mapRef.current?.easeTo({ center: [center.lng, center.lat], duration: prefersReducedMotion() ? 0 : 400 })
  }, [center.lat, center.lng, target])

  // The picked street (or a circle around the picked place) and the walking band around it
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      const data = targetShape(target, walkM)
      const src = map.getSource('target') as GeoJSONSource | undefined
      if (src) src.setData(data)
      else {
        map.addSource('target', { type: 'geojson', data })
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#0B7F6D'
        map.addLayer({ id: 'target-band', type: 'fill', source: 'target', filter: ['==', ['get', 'part'], 'band'], paint: { 'fill-color': accent, 'fill-opacity': 0.12 } })
        map.addLayer({
          id: 'target-band-line',
          type: 'line',
          source: 'target',
          filter: ['==', ['get', 'part'], 'street'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': accent, 'line-opacity': 0.12, 'line-width': bandWidth(walkM, center.lat) },
        })
        map.addLayer({
          id: 'target-casing',
          type: 'line',
          source: 'target',
          filter: ['==', ['get', 'part'], 'street'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FFFFFF', 'line-width': 9 },
        })
        map.addLayer({
          id: 'target-line',
          type: 'line',
          source: 'target',
          filter: ['==', ['get', 'part'], 'street'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': accent, 'line-width': 5 },
        })
      }
      if (map.getLayer('target-band-line')) map.setPaintProperty('target-band-line', 'line-width', bandWidth(walkM, center.lat))
      if (!target) return
      const b = new LngLatBounds()
      if (target.kind === 'line') target.lines.flat().forEach((c) => b.extend(c))
      else b.extend([target.center.lng, target.center.lat])
      const pad = target.kind === 'line' ? walkM : target.radiusM + walkM
      const dLat = pad / 111320
      const dLng = pad / (111320 * Math.cos((target.center.lat * Math.PI) / 180))
      b.extend([b.getWest() - dLng, b.getSouth() - dLat])
      b.extend([b.getEast() + dLng, b.getNorth() + dLat])
      map.fitBounds(b, { padding: { top: 140, bottom: 36, left: 20, right: 20 }, maxZoom: 16.5, duration: prefersReducedMotion() ? 0 : 500 })
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
    return () => void map.off('load', draw)
    // the map is rebuilt when the theme changes, so draw again then
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, walkM, theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markers.current.forEach((m) => m.remove())
    markers.current = []
    if (target && target.kind !== 'line') {
      const pin = document.createElement('div')
      pin.className = 'flex size-8 items-center justify-center rounded-full border-[3px] border-surface bg-text text-bg shadow-lg'
      pin.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>'
      pin.setAttribute('aria-hidden', 'true')
      markers.current.push(new Marker({ element: pin }).setLngLat([target.center.lng, target.center.lat]).addTo(map))
    }
    for (const s of stops) {
      const dot = document.createElement('div')
      dot.className = 'size-3.5 rounded-full border-[2.5px] border-accent bg-surface'
      dot.setAttribute('aria-hidden', 'true')
      markers.current.push(new Marker({ element: dot }).setLngLat([s.lng, s.lat]).addTo(map))
    }
    for (const p of places) {
      const on = p.id === selected
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('aria-label', `${p.name}, ${LODGING_LABEL[p.kind]}`)
      // Along a picked street the places are many and close together: small dots keep the street visible
      const compact = !!target && !on
      btn.className = on
        ? 'flex h-8 items-center gap-1.5 rounded-full bg-text px-3 text-[13px] font-semibold text-bg shadow-lg'
        : compact
          ? `size-4 rounded-full border-2 border-white shadow-md ${PIN_COLOR[p.kind]} ${p.name === savedName ? 'ring-2 ring-text ring-offset-1' : ''}`
          : `flex h-7 w-10 items-center justify-center rounded-full shadow-md ${PIN_COLOR[p.kind]} ${p.name === savedName ? 'ring-2 ring-text ring-offset-2' : ''}`
      if (on) btn.textContent = p.name
      else if (!compact) btn.innerHTML = p.kind === 'apartment' ? HOME_SVG : BED_SVG
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelect(p.id)
      })
      const m = new Marker({ element: btn }).setLngLat([p.lng, p.lat]).addTo(map)
      if (on) m.getElement().style.zIndex = '5'
      markers.current.push(m)
    }
  }, [places, stops, selected, savedName, onSelect, theme, target])

  return <div ref={ref} className="h-full w-full bg-map-bg" aria-label="מפת מקומות הלינה" role="region" />
}
