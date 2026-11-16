import { useEffect, useId, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { ArrowRight, Check, Clock, ExternalLink, Info, Minus, Plus, Search, Trash2 } from 'lucide-react'
import PlaceSheet from '../components/PlaceSheet'
import { useRemoveWithUndo } from '../components/UndoRemove'
import { AreaBar, MapAreaPicker, PlaceAreaSearch, snapRadius, useLiveLocation, type Area } from '../components/AreaControls'
import { IconButton, IconTile, MODE_ICON, cx } from '../components/ui'
import {
  DEFAULT_VISIT,
  TRANSIT_MODES,
  dayEnd,
  dayStart,
  distanceKm,
  durationLabel,
  formatDayLong,
  modeLabel,
  stopDuration,
  timeRange,
  toMin,
} from '../data/helpers'
import { CATEGORIES, KIND_LABEL, radiusKmFor, recommendedPlaces, searchPlaces, type CategoryId } from '../data/places'
import type { Day, PlaceInfo, Stop, TransitMode } from '../data/types'
import { useTrip } from '../state/TripStore'
import { restaurantsNearUrl } from '../data/restaurants'
import { href } from '../router'

/** Plan one day: hours, the itinerary (visit lengths + travel times) and recommended places to add. */
export default function DayPlanner({ dayId }: { dayId: string }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const index = trip.days.findIndex((d) => d.id === dayId)
  const day = trip.days[index]

  const [category, setCategory] = useState<CategoryId>('all')
  const [recs, setRecs] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; items: PlaceInfo[] }>({ status: 'loading', items: [] })
  const [sheet, setSheet] = useState<{ place: PlaceInfo; stopId?: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [areaOpen, setAreaOpen] = useState<'place' | 'map' | null>(null)
  const [retry, setRetry] = useState(0)
  const { remove: removeStop, toast: undoToast } = useRemoveWithUndo('bottom')

  // Default area: the day's own stops if it has some, otherwise the trip's destination
  const routeCenter = useMemo(() => {
    if (day?.stops.length) {
      const n = day.stops.length
      return { lat: day.stops.reduce((a, s) => a + s.lat, 0) / n, lng: day.stops.reduce((a, s) => a + s.lng, 0) / n }
    }
    return trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId, trip.destination])
  const routeArea: Area = useMemo(
    () => ({
      kind: 'route',
      label: day?.stops.length ? 'המסלול של היום' : (trip.destination?.name ?? 'היעד'),
      center: routeCenter,
      radiusKm: snapRadius(radiusKmFor(trip.destination?.zoom ?? 12)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeCenter, trip.destination],
  )

  // The area the user picked instead (null = near the route); "my location" follows the device
  const [chosen, setChosen] = useState<Area | null>(null)
  const live = useLiveLocation(chosen?.kind === 'me')
  const area: Area = useMemo(() => {
    if (!chosen) return routeArea
    if (chosen.kind === 'route') return { ...routeArea, radiusKm: chosen.radiusKm }
    if (chosen.kind === 'me') return { ...chosen, center: live.pos }
    return chosen
  }, [chosen, routeArea, live.pos])
  const centerKey = area.center ? `${area.center.lat.toFixed(4)},${area.center.lng.toFixed(4)}` : ''
  const mapStart = useMemo(
    () => (area.center ? { ...area.center, radiusKm: area.radiusKm } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centerKey, area.radiusKm],
  )

  useEffect(() => {
    if (!area.center) {
      setRecs({ status: 'idle', items: [] }) // waiting for a location
      return
    }
    let alive = true
    // Clear the old list: showing another category's places while loading is misleading
    setRecs({ status: 'loading', items: [] })
    recommendedPlaces(area.center, area.radiusKm, category)
      .then((items) => alive && setRecs({ status: 'done', items }))
      .catch(() => alive && setRecs({ status: 'error', items: [] }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, area.radiusKm, category, retry])

  if (!day) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-start gap-4 p-5">
        <IconButton label="חזרה ללו״ז" to="/trip/schedule">
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <p className="text-muted">היום הזה לא נמצא בטיול.</p>
      </div>
    )
  }

  const addedRefs = new Set(day.stops.map((s) => s.info?.ref).filter(Boolean))
  const add = (place: PlaceInfo) => dispatch({ type: 'addPlace', dayId: day.id, place })

  const sheetAction = sheet && (() => {
    const stop = sheet.stopId ? day.stops.find((s) => s.id === sheet.stopId) : day.stops.find((s) => s.info?.ref === sheet.place.ref)
    return stop ? (
      <button
        type="button"
        onClick={() => {
          removeStop(day, stop.id)
          setSheet(null)
        }}
        className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong text-[15px] font-medium text-accent-2"
      >
        <Trash2 size={18} aria-hidden="true" />
        הסרה מהיום
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          add(sheet.place)
          setSheet(null)
        }}
        className="flex h-12 items-center justify-center gap-2 rounded-tile bg-accent text-[15px] font-semibold text-on-accent"
      >
        <Plus size={18} aria-hidden="true" />
        הוספה ליום {index + 1} · {durationLabel(DEFAULT_VISIT[sheet.place.kind])}
      </button>
    )
  })()

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col gap-4 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <IconButton label="חזרה ללו״ז" to="/trip/schedule">
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl font-bold">תכנון יום {index + 1}</h1>
          <span className="text-[13px] text-muted">
            {formatDayLong(day.date)} · {trip.destination?.name ?? day.city}
          </span>
        </div>
      </header>

      <DayHours day={day} onChange={(start, end) => dispatch({ type: 'setDayHours', dayId: day.id, start, end })} />

      <section aria-labelledby="itinerary" className="flex flex-col gap-3 rounded-phone border border-border bg-surface p-4">
        <h2 id="itinerary" className="text-lg font-semibold">
          המסלול {day.stops.length > 0 && <span className="text-[13px] font-medium text-muted">({day.stops.length} מקומות)</span>}
        </h2>
        {day.stops.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong px-4 py-5 text-center text-[14px] text-muted">
            עוד אין מקומות ביום הזה. בחרו מהמקומות המומלצים למטה, או הוסיפו מקום ידנית.
          </p>
        ) : (
          <ol className="flex flex-col">
            {day.stops.map((s, i) => (
              <li key={s.id} className="flex flex-col">
                <ItineraryRow
                  stop={s}
                  n={i + 1}
                  onInfo={() => (s.info ? setSheet({ place: s.info, stopId: s.id }) : null)}
                  onMinutes={(m) => dispatch({ type: 'setStopMinutes', stopId: s.id, minutes: m })}
                  onRemove={() => removeStop(day, s.id)}
                />
                {i < day.stops.length - 1 && (
                  <TravelRow
                    mode={s.transitToNext?.mode ?? 'walk'}
                    minutes={s.transitToNext?.minutes ?? 15}
                    onChange={(mode, minutes) => dispatch({ type: 'setTransit', stopId: s.id, transit: { mode, minutes } })}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-tile border border-dashed border-accent/60 text-[15px] font-medium text-accent hover:bg-accent/8"
        >
          <Search size={18} aria-hidden="true" />
          הוספת מקום ידנית
        </button>
      </section>

      <section aria-labelledby="recs" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="recs" className="text-lg font-semibold">
            מקומות מומלצים
          </h2>
          <p className="text-[12px] text-muted">מסודרים לפי פופולריות בוויקיפדיה. ביקורות מבקרים – בכפתור "ביקורות בגוגל" בכל מקום.</p>
        </div>
        <AreaBar
          area={area}
          locating={area.kind === 'me' && live.locating}
          error={area.kind === 'me' ? live.error : ''}
          onRoute={() => setChosen(null)}
          onMe={() => setChosen({ kind: 'me', label: 'המיקום שלך', center: null, radiusKm: 3 })}
          onSearch={() => setAreaOpen('place')}
          onMap={() => setAreaOpen('map')}
          onRadius={(km) => setChosen({ ...area, radiusKm: km })}
        />
        <div role="group" aria-label="סוג מקום" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cx(
                'h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors duration-200 ease-out',
                category === c.id ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-surface font-medium text-muted hover:text-text',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div aria-live="polite" className="flex flex-col gap-2">
          {recs.status === 'loading' && recs.items.length === 0 && <RecSkeleton />}
          {recs.status === 'error' && (
            <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-4 text-center text-[14px] text-muted">
              לא הצלחנו לטעון המלצות כרגע.
              <button type="button" onClick={() => setRetry((n) => n + 1)} className="h-10 rounded-tile border border-border-strong px-4 font-medium text-text">
                לנסות שוב
              </button>
            </div>
          )}
          {recs.status === 'done' && recs.items.length === 0 && (
            <p className="rounded-card border border-border bg-surface p-4 text-center text-[14px] text-muted">
              {category === 'food' || category === 'shopping'
                ? 'לא מצאנו מקומות מהסוג הזה במקורות החינמיים. אפשר להוסיף מקום ידנית, או לחפש בגוגל מפות.'
                : 'לא מצאנו מקומות מהסוג הזה באזור.'}
            </p>
          )}
          {recs.items.map((p) => (
            <RecCard
              key={p.ref}
              place={p}
              distance={area.center ? distanceKm(area.center, p) : undefined}
              added={addedRefs.has(p.ref)}
              onOpen={() => setSheet({ place: p })}
              onAdd={() => add(p)}
            />
          ))}
          {category === 'food' && area.center && (
            <a
              href={restaurantsNearUrl(area.center.lat, area.center.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong bg-surface text-[14px] font-medium"
            >
              עוד מסעדות באזור, עם דירוגים – בגוגל מפות
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </section>

      <a href={href('/trip/schedule')} className="flex h-12 items-center justify-center rounded-tile bg-accent text-[15px] font-semibold text-on-accent">
        סיום – חזרה ללו״ז
      </a>

      {undoToast}
      <PlaceAreaSearch
        open={areaOpen === 'place'}
        onOpenChange={(o) => setAreaOpen(o ? 'place' : null)}
        onPick={(a) => {
          setChosen(a)
          setAreaOpen(null)
        }}
      />
      <MapAreaPicker
        open={areaOpen === 'map'}
        onOpenChange={(o) => setAreaOpen(o ? 'map' : null)}
        start={mapStart}
        onPick={(a) => {
          setChosen(a)
          setAreaOpen(null)
        }}
      />
      <PlaceSheet place={sheet?.place ?? null} onClose={() => setSheet(null)} action={sheetAction} />
      <ManualSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        near={area.center ?? routeCenter ?? undefined}
        onPick={(p) => {
          setSearchOpen(false)
          // Let the search sheet close before opening the details sheet
          window.setTimeout(() => setSheet({ place: p }), 250)
        }}
      />
    </div>
  )
}

/* ---------- day hours ---------- */

function DayHours({ day, onChange }: { day: Day; onChange: (start: string, end: string) => void }) {
  const startId = useId()
  const endId = useId()
  const start = dayStart(day)
  const end = dayEnd(day)
  const last = day.stops[day.stops.length - 1]
  const left = last ? toMin(end) - toMin(last.end) : toMin(end) - toMin(start)
  const input =
    'h-11 w-full min-w-0 rounded-tile border border-border bg-raised px-3 text-[15px] text-text outline-none focus:border-accent'

  return (
    <section aria-labelledby="hours" className="flex flex-col gap-3 rounded-phone border border-border bg-surface p-4">
      <h2 id="hours" className="flex items-center gap-2 text-lg font-semibold">
        <Clock size={18} className="text-accent" aria-hidden="true" />
        שעות היום
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={startId} className="text-xs text-muted">
            יציאה
          </label>
          <input id={startId} type="time" step={300} value={start} onChange={(e) => e.target.value && onChange(e.target.value, end)} className={input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={endId} className="text-xs text-muted">
            סיום
          </label>
          <input id={endId} type="time" step={300} value={end} min={start} onChange={(e) => e.target.value && onChange(start, e.target.value)} className={input} />
        </div>
      </div>
      <p className={cx('text-[13px]', left < 0 ? 'font-medium text-accent-2' : 'text-muted')} role={left < 0 ? 'alert' : undefined}>
        {left < 0
          ? `המסלול חורג מסוף היום ב-${durationLabel(-left)}. קצרו ביקור או הזיזו את שעת הסיום.`
          : last
            ? `המסלול מסתיים ב-${last.end} · נשארו ${durationLabel(left)} פנויות`
            : `${durationLabel(left)} פנויות לתכנון`}
      </p>
    </section>
  )
}

/* ---------- itinerary ---------- */

function Stepper({ label, value, onMinus, onPlus, minusDisabled }: { label: string; value: string; onMinus: () => void; onPlus: () => void; minusDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={onMinus}
        disabled={minusDisabled}
        aria-label={`קיצור: ${label}`}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-text disabled:opacity-40"
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <span className="min-w-[68px] text-center text-[13px] font-medium" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={onPlus}
        aria-label={`הארכה: ${label}`}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-text"
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function ItineraryRow({
  stop,
  n,
  onInfo,
  onMinutes,
  onRemove,
}: {
  stop: Stop
  n: number
  onInfo: () => void
  onMinutes: (m: number) => void
  onRemove: () => void
}) {
  const minutes = stopDuration(stop)
  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-raised p-3">
      <div className="flex items-center gap-3">
        <Thumb place={stop.info} kind={stop.kind} size={48} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold" dir="auto">
            <span className="text-muted">{n}. </span>
            {stop.name}
          </span>
          <span className="text-[13px] text-muted">{timeRange(stop.start, stop.end)}</span>
        </div>
        {stop.info ? (
          <button type="button" onClick={onInfo} aria-label={`פרטים על ${stop.name}`} className="flex size-10 shrink-0 items-center justify-center rounded-tile text-muted hover:text-text">
            <Info size={18} aria-hidden="true" />
          </button>
        ) : (
          <a href={href(`/place/${stop.id}`)} aria-label={`פרטים על ${stop.name}`} className="flex size-10 shrink-0 items-center justify-center rounded-tile text-muted hover:text-text">
            <Info size={18} aria-hidden="true" />
          </a>
        )}
        <button type="button" onClick={onRemove} aria-label={`הסרת ${stop.name}`} className="flex size-10 shrink-0 items-center justify-center rounded-tile text-muted hover:text-accent-2">
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-[13px] text-muted">משך הביקור</span>
        <Stepper
          label={`משך הביקור ב${stop.name}`}
          value={durationLabel(minutes)}
          minusDisabled={minutes <= 15}
          onMinus={() => onMinutes(Math.max(15, minutes - 15))}
          onPlus={() => onMinutes(minutes + 15)}
        />
      </div>
    </article>
  )
}

function TravelRow({ mode, minutes, onChange }: { mode: TransitMode; minutes: number; onChange: (mode: TransitMode, minutes: number) => void }) {
  const id = useId()
  const Icon = MODE_ICON[mode]
  return (
    <div className="flex items-center gap-2 py-2 ps-3">
      <span className="h-8 w-0.5 rounded-full bg-border-strong" aria-hidden="true" />
      <Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        דרך הגעה למקום הבא
      </label>
      <select
        id={id}
        value={mode}
        onChange={(e) => onChange(e.target.value as TransitMode, minutes)}
        className="h-9 rounded-tile border border-border bg-surface px-2 text-[13px] text-text outline-none focus:border-accent"
      >
        {TRANSIT_MODES.map((m) => (
          <option key={m} value={m}>
            {modeLabel(m)}
          </option>
        ))}
      </select>
      <div className="ms-auto">
        <Stepper
          label="זמן הדרך למקום הבא"
          value={`${minutes} דק׳`}
          minusDisabled={minutes <= 5}
          onMinus={() => onChange(mode, Math.max(5, minutes - 5))}
          onPlus={() => onChange(mode, minutes + 5)}
        />
      </div>
    </div>
  )
}

/* ---------- recommendations ---------- */

function Thumb({ place, kind, size }: { place?: PlaceInfo; kind: Stop['kind']; size: number }) {
  const [failed, setFailed] = useState(false)
  if (place?.image && !failed)
    return (
      <img
        src={place.image.replace(/width=\d+/, 'width=200')}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-tile bg-raised object-cover"
        style={{ width: size, height: size }}
      />
    )
  return <IconTile kind={kind} size={size} />
}

function RecCard({ place, distance, added, onOpen, onAdd }: { place: PlaceInfo; distance?: number; added: boolean; onOpen: () => void; onAdd: () => void }) {
  return (
    <article className="flex items-center gap-3 rounded-card border border-border bg-surface p-2.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <Thumb place={place} kind={place.kind} size={72} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold" dir="auto">
            {place.name}
          </span>
          <span className="text-[12px] text-muted">
            {KIND_LABEL[place.kind]}
            {distance !== undefined && ` · ${distance < 1 ? `${Math.round(distance * 1000)} מ׳` : `${distance.toFixed(1)} ק״מ`}`}
          </span>
          {place.description && (
            <span className="line-clamp-1 text-[12px] text-muted" dir="auto">
              {place.description}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onAdd}
        disabled={added}
        aria-label={added ? `${place.name} כבר ביום` : `הוספת ${place.name} ליום`}
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-tile border-[1.5px] transition-colors duration-200 ease-out',
          added ? 'border-accent bg-accent text-on-accent' : 'border-accent text-accent hover:bg-accent/10',
        )}
      >
        {added ? <Check size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}
      </button>
    </article>
  )
}

function RecSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-card border border-border bg-surface p-2.5" aria-hidden="true">
          <span className="size-[72px] rounded-tile bg-raised" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3.5 w-2/3 rounded bg-raised" />
            <span className="h-3 w-1/3 rounded bg-raised" />
          </span>
        </div>
      ))}
      <span className="sr-only">טוענים מקומות מומלצים…</span>
    </>
  )
}

/* ---------- manual search ---------- */

function ManualSearch({
  open,
  onOpenChange,
  near,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  near?: { lat: number; lng: number }
  onPick: (p: PlaceInfo) => void
}) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; items: PlaceInfo[] }>({ status: 'idle', items: [] })
  const term = q.trim()

  useEffect(() => {
    if (term.length < 2) {
      setRes({ status: 'idle', items: [] })
      return
    }
    const ctrl = new AbortController()
    setRes((r) => ({ status: 'loading', items: r.items }))
    const t = window.setTimeout(() => {
      searchPlaces(term, near, ctrl.signal)
        .then((items) => setRes({ status: 'done', items }))
        .catch((e: unknown) => (e as Error).name !== 'AbortError' && setRes({ status: 'error', items: [] }))
    }, 400)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [term, near])

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
          <Drawer.Title className="text-xl font-bold">הוספת מקום ידנית</Drawer.Title>
          <label className="flex h-[52px] shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-raised px-4 text-muted focus-within:border-accent">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">שם המקום</span>
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="שם המקום, בעברית או באנגלית"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
            />
          </label>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" data-vaul-no-drag aria-live="polite">
            {res.status === 'idle' && <p className="text-[14px] text-muted">הקלידו לפחות 2 אותיות. מקומות קרובים ליעד יופיעו ראשונים.</p>}
            {res.status === 'loading' && res.items.length === 0 && <p className="text-[14px] text-muted">מחפשים…</p>}
            {res.status === 'error' && <p className="text-[14px] text-muted">החיפוש לא זמין כרגע. נסו שוב בעוד רגע.</p>}
            {res.status === 'done' && res.items.length === 0 && <p className="text-[14px] text-muted">לא מצאנו מקום בשם הזה. נסו שם אחר או באנגלית.</p>}
            {res.items.map((p) => (
              <button
                key={`${p.source}:${p.ref}`}
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-[60px] items-center gap-3 rounded-card border border-border bg-raised p-2.5 text-start hover:border-border-strong"
              >
                <Thumb place={p} kind={p.kind} size={44} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold" dir="auto">
                    {p.name}
                  </span>
                  <span className="truncate text-[12px] text-muted" dir="auto">
                    {KIND_LABEL[p.kind]}
                    {(p.address ?? p.description) && ` · ${p.address ?? p.description}`}
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
