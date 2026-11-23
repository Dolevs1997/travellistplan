import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Clock, ExternalLink, Landmark, Minus, Plus, Search, Sparkles, Star, X } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import { DEFAULT_VISIT, dayEnd, dayStart, distanceKm, durationLabel, estimateTransit, fromMin, shortDate, timeRange, toMin } from '../data/helpers'
import {
  dayArea,
  explore,
  exploreAvailable,
  exploreCategories,
  matchTrip,
  hoursOn,
  kindOf,
  nearestStop,
  toPlaceInfo,
  type ExploreCat,
  type ExplorePlace,
} from '../data/explore'
import { googlePhoto } from '../data/lodging'
import { briefOf } from '../data/tripEdit'
import { findVisit, nextInVisit } from '../data/visits'
import type { Day } from '../data/types'
import { navigate } from '../router'
import { useTrip } from '../state/TripStore'

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5
/** "ממנזר…", but "מ-MAAT" before a name in Latin letters; long names are cut at their dash */
const fromName = (name: string) => {
  const short = name.split(/ [–-] /)[0]
  return /^[\u0590-\u05FF]/.test(short) ? `מ${short}` : `מ-${short}`
}

/** Where a place would go on a day if added "after the last stop" */
export function nextSlot(day: Day, p: { lat: number; lng: number }) {
  const last = day.stops[day.stops.length - 1]
  if (!last) return { start: toMin(dayStart(day)), after: undefined as string | undefined }
  return { start: roundUp5(toMin(last.end) + estimateTransit(last, p).minutes), after: last.name }
}

/** A short name for a day: its area or city */
const dayPlace = (d: Day) => d.stops.find((s) => s.area)?.area.split(',')[0] || d.destination?.name || d.city

/**
 * Add places to a day: Google recommendations around the day's stops, by category, and search.
 * Tapping a place opens a sheet for choosing the day, the time and how long to stay.
 */
export default function AddPlaces({ dayId, visitId }: { dayId: string; visitId?: string }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const brief = briefOf(trip)
  const initial = trip.days.find((d) => d.id === dayId) ?? trip.days.find((d) => d.id === state.activeDayId) ?? trip.days[0]
  const [activeId, setActiveId] = useState(initial?.id ?? '')
  const day = trip.days.find((d) => d.id === activeId) ?? initial
  const dayIndex = trip.days.indexOf(day)
  const fallback = trip.destination ?? { lat: day?.stops[0]?.lat ?? 0, lng: day?.stops[0]?.lng ?? 0 }
  // Adding to a few-hours visit: places around that town, on its day
  const visit = findVisit(trip.brief, visitId)
  const area = visit ? { center: { lat: visit.visit.destination.lat, lng: visit.visit.destination.lng }, radius: 3000 } : day ? dayArea(day, fallback) : null
  const cats = exploreCategories(!!brief.kosher)

  const [cat, setCat] = useState<ExploreCat>('top')
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<ExplorePlace[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<ExplorePlace | null>(null)
  // What was added on this visit, for the bar at the bottom
  const [added, setAdded] = useState<{ name: string; dayIndex: number; start: string; end: string }[]>([])
  const query = q.trim()
  const areaKey = area ? `${area.center.lat.toFixed(4)},${area.center.lng.toFixed(4)},${area.radius}` : ''

  useEffect(() => {
    if (!area) return
    const ctrl = new AbortController()
    setFailed(false)
    setPlaces(null)
    const run = () =>
      explore(query.length >= 2 ? { q: query } : { cat }, area)
        .then((r) => !ctrl.signal.aborted && setPlaces(r))
        .catch(() => !ctrl.signal.aborted && (setFailed(true), setPlaces([])))
    // Typing waits a moment; a category tap loads at once
    const timer = window.setTimeout(run, query.length >= 2 ? 350 : 0)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
    // areaKey stands for the area
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, cat, query])

  if (!day || !area) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">אין ימים בטיול הזה.</p>
      </div>
    )
  }

  const slot = nextSlot(day, area.center)
  const freeFrom = day.stops.length ? fromMin(slot.start) : dayStart(day)
  const back = () => (history.length > 1 ? history.back() : navigate('/trip/schedule'))

  const add = (p: ExplorePlace, d: Day, start: number, minutes: number) => {
    const info = toPlaceInfo(p, query ? undefined : cat)
    const isNext = !visit && start === nextSlot(d, p).start
    dispatch({ type: 'addPlace', dayId: d.id, place: info, minutes, ...(isNext ? {} : { start: fromMin(start) }), ...(visit ? { visitId: visit.visit.id } : {}) })
    setAdded((a) => [...a, { name: p.name, dayIndex: trip.days.indexOf(d), start: fromMin(start), end: fromMin(start + minutes) }])
  }
  const quickAdd = (p: ExplorePlace) => add(p, day, visit ? nextInVisit(day, visit, p).start : nextSlot(day, p).start, DEFAULT_VISIT[kindOf(p, query ? undefined : cat)])

  const inTrip = matchTrip(places ?? [], trip.days)
  const list = (places ?? []).map((p) => ({ p, near: nearestStop(p, day.stops), inTrip: inTrip.get(p.id) }))
  // Recommendations: closest to the day's route first among the well-rated; search keeps Google's order
  if (!query) list.sort((a, b) => (a.near?.km ?? 0) - (b.near?.km ?? 0) - ((a.p.rating ?? 0) - (b.p.rating ?? 0)) * 0.6)
  // Places already in the trip go last: they're there to show it, not to add again
  list.sort((a, b) => Number(!!a.inTrip) - Number(!!b.inTrip))

  const lastAdded = added[added.length - 1]
  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-28">
      <header className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <IconButton label="חזרה" onClick={back}>
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-xl font-bold">
            {visit ? (
              <>
                מקומות ב-<bdi>{visit.visit.destination.name}</bdi>
              </>
            ) : (
              `הוספת מקומות ליום ${dayIndex + 1}`
            )}
          </h1>
          <span className="truncate text-xs text-muted">
            {visit ? (
              <>
                יום {dayIndex + 1} · ביקור {timeRange(fromMin(visit.arrive), fromMin(visit.depart))}
              </>
            ) : (
              <>
                {shortDate(day.date)} · {dayPlace(day)} · פנוי מ-{freeFrom} עד {dayEnd(day)}
              </>
            )}
          </span>
        </div>
      </header>

      <div role="group" aria-label="יום" className="no-scrollbar flex gap-1.5 overflow-x-auto px-3.5 pt-3">
        {!visit && trip.days.map((d, i) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={d.id === day.id}
            onClick={() => setActiveId(d.id)}
            className={cx('h-8 shrink-0 rounded-[10px] px-3 text-xs', d.id === day.id ? 'bg-accent font-semibold text-on-accent' : 'bg-raised font-medium text-muted')}
          >
            יום {i + 1} · {d.stops.length ? dayPlace(d) : 'פנוי'}
          </button>
        ))}
      </div>

      <label className="mx-3.5 mt-3 flex h-12 items-center gap-2.5 rounded-[14px] border border-border bg-surface px-3.5 focus-within:border-accent">
        <Search size={17} className="shrink-0" aria-hidden="true" />
        <span className="sr-only">חיפוש מקום</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חפשו מקום, מסעדה או אטרקציה"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          enterKeyHint="search"
        />
        {q && (
          <button type="button" aria-label="ניקוי" onClick={() => setQ('')} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </label>

      {!query && (
        <div role="group" aria-label="קטגוריה" className="no-scrollbar flex gap-2 overflow-x-auto px-3.5 pt-3 pb-0.5">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              // Food has its own screen, by meal, with menus, photos and reviews
              onClick={() => (c.id === 'food' || c.id === 'kosher' ? navigate(visit ? `/eat/${day.id}/lunch/${visit.visit.id}` : `/eat/${day.id}`) : setCat(c.id))}
              className={cx(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium',
                cat === c.id ? 'border-text bg-text text-bg' : 'border-border bg-surface',
              )}
            >
              {c.id === 'top' && <Sparkles size={14} aria-hidden="true" />}
              {c.label}
            </button>
          ))}
        </div>
      )}

      <section aria-label={query ? 'תוצאות חיפוש' : 'מקומות מומלצים'} className="flex flex-col gap-2 px-3.5 pt-3.5">
        <div className="mb-0.5 flex flex-col gap-0.5">
          <h2 className="text-[17px] font-bold">{query ? `תוצאות עבור "${query}"` : cat === 'top' ? (day.stops.length ? 'מומלץ ליד המסלול שלכם' : `מומלץ ב${dayPlace(day)}`) : cats.find((c) => c.id === cat)?.label}</h2>
          <span className="text-xs text-muted">
            {day.stops.length ? `מקומות מדורגים במרחק קצר מהעצירות של יום ${dayIndex + 1}` : `מקומות מדורגים ב${dayPlace(day)}`}
          </span>
        </div>

        {!exploreAvailable() ? (
          <p className="rounded-card bg-raised p-4 text-sm text-muted">ההמלצות דורשות חיבור ל-Google Places, שלא מוגדר כאן. אפשר להוסיף מקומות בבנייה העצמית של המסלול.</p>
        ) : places === null ? (
          <p role="status" className="py-6 text-center text-sm text-muted">
            מחפשים מקומות…
          </p>
        ) : failed ? (
          <p className="py-6 text-center text-sm text-muted">לא הצלחנו לטעון מקומות כרגע. נסו שוב בעוד רגע.</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{query ? `לא מצאנו את "${query}" באזור.` : 'לא מצאנו מקומות מהסוג הזה באזור.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map(({ p, near, inTrip }) => (
              <PlaceRow
                key={p.id}
                place={p}
                near={near && near.km > 0.02 ? `${near.km > 2 ? `${Math.round(near.km * 10) / 10} ק״מ` : `${near.minutes} דק׳ הליכה`} ${fromName(near.name)}` : near ? `ליד ${near.name.split(/ [–-] /)[0]}` : undefined}
                inTrip={inTrip ? (inTrip.dayIndex === dayIndex ? inTrip.stop.start : `יום ${inTrip.dayIndex + 1}`) : undefined}
                onOpen={() => setOpen(p)}
                onAdd={() => quickAdd(p)}
              />
            ))}
          </ul>
        )}
        {list.length > 0 && <p className="pt-1 text-[11px] text-muted">דירוגים, תמונות ושעות פתיחה: Google</p>}
      </section>

      {lastAdded && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] px-3.5 pb-4">
          <div role="status" className="flex items-center gap-2.5 rounded-[18px] bg-text py-2.5 ps-4 pe-2.5 text-bg shadow-[0_10px_28px_rgba(21,24,29,0.25)]">
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="text-sm font-semibold">
                {added.length === 1 ? 'נוסף מקום אחד' : `נוספו ${added.length} מקומות`}
                {added.every((a) => a.dayIndex === lastAdded.dayIndex) ? ` ליום ${lastAdded.dayIndex + 1}` : ''}
              </span>
              <span className="truncate text-xs opacity-75">
                {lastAdded.name} · {timeRange(lastAdded.start, lastAdded.end)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'setDay', dayId: trip.days[lastAdded.dayIndex].id })
                navigate('/trip/schedule')
              }}
              className="h-10 shrink-0 rounded-xl bg-bg px-3.5 text-sm font-semibold text-text"
            >
              ללו״ז
            </button>
          </div>
        </div>
      )}

      {open && (
        <AddSheet
          place={open}
          days={trip.days}
          initialDayId={day.id}
          defaultMinutes={DEFAULT_VISIT[kindOf(open, query ? undefined : cat)]}
          fixedSlot={visit ? nextInVisit(day, visit, open) : undefined}
          onAdd={(d, start, minutes) => {
            add(open, d, start, minutes)
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function Thumb({ place: p, size }: { place: ExplorePlace; size: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  if (p.photo && !failed)
    return (
      <img
        src={googlePhoto(p.photo, size === 'sm' ? 240 : 960)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cx('shrink-0 object-cover', size === 'sm' ? 'size-[76px] rounded-[14px]' : 'h-44 w-full')}
      />
    )
  return (
    <span className={cx('flex shrink-0 items-center justify-center bg-accent/10 text-accent', size === 'sm' ? 'size-[76px] rounded-[14px]' : 'h-32 w-full')}>
      <Landmark size={size === 'sm' ? 22 : 32} aria-hidden="true" />
    </span>
  )
}

function RatingText({ value, count }: { value?: number; count?: number }) {
  if (!value) return null
  return (
    <>
      <span className="inline-flex items-center gap-0.5 font-semibold text-text">
        <Star size={12} className="fill-current text-[#E8A13A]" aria-hidden="true" />
        {value.toFixed(1)}
      </span>
      {count ? <span> ({count.toLocaleString('en-US')})</span> : null}
    </>
  )
}

function PlaceRow({
  place: p,
  near,
  inTrip,
  onOpen,
  onAdd,
}: {
  place: ExplorePlace
  near?: string
  /** Already in the trip: its time on this day, or which day */
  inTrip?: string
  onOpen: () => void
  onAdd: () => void
}) {
  return (
    <li className={cx('flex items-center gap-3 rounded-[18px] border p-2.5', inTrip ? 'border-accent bg-accent/6' : 'border-border bg-surface')}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <Thumb place={p} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold">{p.name}</span>
          <span className="truncate text-xs text-muted">
            <RatingText value={p.rating} count={p.ratingCount} />
            {p.typeLabel ? `${p.rating ? ' · ' : ''}${p.typeLabel}` : ''}
          </span>
          {near && <span className="truncate text-xs font-semibold text-accent">{near}</span>}
        </span>
      </button>
      {inTrip ? (
        <span className="flex shrink-0 flex-col items-center gap-0.5">
          <span aria-label="כבר בטיול" className="flex size-11 items-center justify-center rounded-[14px] bg-accent text-on-accent">
            <Check size={20} aria-hidden="true" />
          </span>
          <span className="text-[11px] font-semibold text-accent">{inTrip}</span>
        </span>
      ) : (
        <button
          type="button"
          aria-label={`הוספת ${p.name} אחרי העצירה האחרונה`}
          onClick={onAdd}
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-accent text-accent transition-colors duration-150 hover:bg-accent/8"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/** Choose the day, the time and how long to stay, then add (the nearby map uses it too) */
export function AddSheet({
  place: p,
  days,
  initialDayId,
  defaultMinutes,
  fixedSlot,
  onAdd,
  onClose,
}: {
  place: ExplorePlace
  days: Day[]
  initialDayId: string
  defaultMinutes: number
  /** Inside a few-hours visit: the day is set and the place comes after the visit's last stop */
  fixedSlot?: { start: number; after?: string }
  onAdd: (day: Day, start: number, minutes: number) => void
  onClose: () => void
}) {
  // The day whose stops are closest to the place gets a "closest" mark
  const closest = useMemo(() => {
    let best: { id: string; km: number } | null = null
    for (const d of days) for (const s of d.stops) {
      const km = distanceKm(p, s)
      if (!best || km < best.km) best = { id: d.id, km }
    }
    return best?.id
  }, [days, p])
  const [dayId, setDayId] = useState(initialDayId)
  const day = days.find((d) => d.id === dayId) ?? days[0]
  const auto = fixedSlot ?? nextSlot(day, p)
  const [own, setOwn] = useState(false)
  const [ownTime, setOwnTime] = useState(fromMin(auto.start))
  const [minutes, setMinutes] = useState(defaultMinutes)
  const start = own ? toMin(ownTime) : auto.start
  const end = start + minutes
  const overlap = own ? day.stops.find((s) => toMin(s.start) < end && toMin(s.end) > start) : undefined
  const late = end > toMin(dayEnd(day))
  const hours = hoursOn(p.hours, day.date)
  const sheet = useRef<HTMLElement>(null)

  useEffect(() => {
    sheet.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-[rgba(21,24,29,0.45)]" />
      <section
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${p.name} – הוספה לטיול`}
        className="relative flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] bg-bg outline-none"
      >
        <div className="relative shrink-0">
          <Thumb place={p} size="lg" />
          <button type="button" aria-label="סגירה" onClick={onClose} className="absolute top-3.5 left-3.5 flex size-9 items-center justify-center rounded-full bg-surface/92 text-text shadow">
            <X size={16} aria-hidden="true" />
          </button>
          {p.photo && p.photoAuthor && (
            <a
              href={p.photoAuthorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 left-3 rounded bg-black/35 px-1.5 text-[10px] text-white/90"
            >
              תמונה: {p.photoAuthor}
            </a>
          )}
        </div>

        <div className="flex flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 pt-3.5 pb-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] font-bold">{p.name}</h2>
            <span className="text-[13px] text-muted">
              <RatingText value={p.rating} count={p.ratingCount} />
              {p.typeLabel ? `${p.rating ? ' · ' : ''}${p.typeLabel}` : ''}
            </span>
            {p.summary && <p className="text-[13px] leading-relaxed">{p.summary}</p>}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              {hours && (
                <span className="flex items-center gap-1 text-muted">
                  <Clock size={13} aria-hidden="true" />
                  ב{shortDate(day.date)}: <bdi>{hours}</bdi>
                </span>
              )}
              <a href={`#/spot/${p.id}/${day.id}`} className="flex items-center gap-1 font-semibold text-accent">
                כל הפרטים: תמונות, ביקורות וניווט
              </a>
              {p.mapsUrl && (
                <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-accent">
                  ביקורות בגוגל
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </span>
          </div>

          <fieldset className={cx('flex flex-col gap-2', fixedSlot && 'hidden')}>
            <legend className="mb-2 text-[13px] font-semibold text-muted">לאיזה יום?</legend>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {days.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={d.id === day.id}
                  onClick={() => {
                    setDayId(d.id)
                    setOwn(false)
                    setOwnTime(fromMin(nextSlot(d, p).start))
                  }}
                  className={cx(
                    'flex h-[54px] min-w-[76px] shrink-0 flex-col items-center justify-center gap-px rounded-[14px] px-2.5',
                    d.id === day.id ? 'border-2 border-accent bg-accent/6' : 'border border-border bg-surface',
                  )}
                >
                  <b className="text-[13px] font-semibold">יום {i + 1}</b>
                  <span className={cx('text-[11px]', d.id === day.id ? 'font-semibold text-accent' : 'text-muted')}>
                    {d.id === closest ? 'הכי קרוב' : d.stops.length ? dayPlace(d) : 'פנוי'}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold text-muted">מתי ביום {days.indexOf(day) + 1}?</legend>
            <label className={cx('flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-sm', !own ? 'border-2 border-accent bg-accent/6' : 'border border-border bg-surface')}>
              <input type="radio" name="when" checked={!own} onChange={() => setOwn(false)} className="size-4 accent-[var(--color-accent)]" />
              <span className="flex-1">
                <b>{fromMin(auto.start)}</b> · {auto.after ? <>אחרי <bdi>{auto.after}</bdi></> : 'בתחילת היום'}
              </span>
              {!late && !own && <span className="text-xs font-semibold text-accent">מתאים לזמן הפנוי</span>}
            </label>
            <label className={cx('flex items-center gap-2.5 rounded-[14px] px-3 py-2 text-sm', own ? 'border-2 border-accent bg-accent/6' : 'border border-border bg-surface')}>
              <input type="radio" name="when" checked={own} onChange={() => setOwn(true)} className="size-4 accent-[var(--color-accent)]" />
              <span className="flex-1">אבחר שעה בעצמי</span>
              <input
                type="time"
                value={ownTime}
                step={300}
                onFocus={() => setOwn(true)}
                onChange={(e) => e.target.value && (setOwnTime(e.target.value), setOwn(true))}
                aria-label="שעת התחלה"
                className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm"
              />
            </label>
            {overlap && <p className="text-xs text-accent-2">השעה הזו חופפת ל{overlap.name} ({timeRange(overlap.start, overlap.end)}).</p>}
            {late && <p className="text-xs text-accent-2">זה מסתיים אחרי סוף היום המתוכנן ({dayEnd(day)}).</p>}
          </fieldset>

          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-3 py-2.5">
            <span className="flex flex-col gap-px">
              <span className="text-sm font-semibold">כמה זמן?</span>
              <span className="text-xs text-muted">הצעה לפי סוג המקום</span>
            </span>
            <span className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="פחות זמן"
                onClick={() => setMinutes((m) => Math.max(15, m - 15))}
                className="flex size-9 items-center justify-center rounded-[10px] border border-border-strong"
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <b className="min-w-[72px] text-center text-[15px]" aria-live="polite">
                {durationLabel(minutes)}
              </b>
              <button
                type="button"
                aria-label="יותר זמן"
                onClick={() => setMinutes((m) => Math.min(8 * 60, m + 15))}
                className="flex size-9 items-center justify-center rounded-[10px] border border-border-strong"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </span>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-bg px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onAdd(day, start, minutes)}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent px-3 text-[15px] font-semibold whitespace-nowrap text-on-accent"
          >
            <Plus size={18} className="shrink-0" aria-hidden="true" />
            הוספה ליום {days.indexOf(day) + 1} · {timeRange(fromMin(start), fromMin(end))}
          </button>
        </div>
      </section>
    </div>
  )
}
