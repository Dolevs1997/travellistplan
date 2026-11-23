import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, BedDouble, ChevronDown, ChevronUp, ClipboardPaste, GripVertical, Plus, Sparkles, X } from 'lucide-react'
import RoutePicker from '../components/RoutePicker'
import { DayVisit, useVisitEditor } from '../components/VisitParts'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconButton, IconTile, cx } from '../components/ui'
import { usePlacePhoto } from '../data/cityPhoto'
import { PARTS, moveToPart, nextInPart, partOf, type DayPart } from '../data/dayParts'
import { searchPlaces, KIND_LABEL } from '../data/places'
import { fromMin, hasLocation, shortDate, timeRange, tripLegs } from '../data/helpers'
import { briefOf } from '../data/tripEdit'
import { visitsOnDay } from '../data/visits'
import type { Day, Destination, Stop } from '../data/types'
import { useTrip } from '../state/TripStore'
import { href, navigate } from '../router'

const formatDay = (iso: string) => new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(`${iso}T12:00:00`))

/** "I have a route": add the places planned for each day, city by city, and where you sleep */
export default function BuildOwn() {
  const { state } = useTrip()
  const { trip } = state
  const legs = tripLegs(trip)
  const [city, setCity] = useState(0)
  const leg = legs[Math.min(city, legs.length - 1)]
  const [openDay, setOpenDay] = useState<string | null>(leg?.days[0]?.id ?? null)
  const [pasting, setPasting] = useState(false)

  const placed = trip.days.reduce((n, d) => n + d.stops.length, 0)
  const empty = trip.days.filter((d) => d.stops.length === 0).length

  if (!leg) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">לטיול הזה עוד אין ימים. בחרו יעד ותאריכים קודם.</p>
        <button type="button" onClick={() => navigate('/edit')} className="h-11 rounded-tile bg-accent px-5 font-semibold text-on-accent">
          עריכת הטיול
        </button>
      </div>
    )
  }

  const pickCity = (i: number) => {
    setCity(i)
    setOpenDay(legs[i].days[0]?.id ?? null)
  }
  const dayNumber = (d: Day) => trip.days.indexOf(d) + 1

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-[130px]">
      <div className="flex flex-col gap-3 px-5 pt-4">
        <header className="flex items-center gap-3">
          {/* Back to the screen you came from (editing, the city screen…); the trip editor when opened directly */}
          <IconButton label="חזרה" onClick={() => (history.length > 1 ? history.back() : navigate('/edit'))}>
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <div className="flex flex-1 flex-col gap-0.5">
            <h1 className="text-[22px] font-bold">המסלול שלי</h1>
            <span className="text-[13px] text-muted">לחצו על מקום לתמונות, דירוגים וביקורות</span>
          </div>
        </header>

        <button
          type="button"
          aria-expanded={pasting}
          onClick={() => setPasting(!pasting)}
          className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-border-strong bg-surface text-sm font-medium"
        >
          <ClipboardPaste size={18} className="text-accent" aria-hidden="true" />
          הדבקת מסלול מטקסט או מהערות
        </button>
        {pasting && openDay && <PasteRoute dayId={openDay} dayLabel={`יום ${dayNumber(trip.days.find((d) => d.id === openDay)!)}`} near={leg.destination} onDone={() => setPasting(false)} />}

        {legs.length > 1 && (
          <div role="tablist" aria-label="ערים" className={cx('grid gap-1 rounded-[14px] bg-raised p-1')} style={{ gridTemplateColumns: `repeat(${legs.length}, minmax(0, 1fr))` }}>
            {legs.map((l, i) => {
              const nights = l.days.length - (i === legs.length - 1 ? 1 : 0)
              return (
                <button
                  key={`${l.destination.id}-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === city}
                  onClick={() => pickCity(i)}
                  className={cx('h-10 truncate rounded-[11px] px-2 text-sm', i === city ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(21,24,29,0.1)]' : 'font-medium text-muted')}
                >
                  {l.destination.name} · {nights === 1 ? 'לילה' : `${nights} לילות`}
                </button>
              )
            })}
          </div>
        )}

        <LodgingRow destination={leg.destination} checkIn={leg.days[0].date} checkOut={leg.days[leg.days.length - 1].date} legIndex={Math.min(city, legs.length - 1)} />

        {leg.days.map((d) =>
          openDay === d.id ? (
            <OpenDay key={d.id} day={d} number={dayNumber(d)} near={leg.destination} onClose={() => setOpenDay(null)} />
          ) : (
            <button
              key={d.id}
              type="button"
              aria-expanded={false}
              onClick={() => setOpenDay(d.id)}
              className={cx(
                'flex h-[52px] items-center gap-2.5 rounded-2xl px-3.5 text-start',
                d.stops.length ? 'border border-border bg-surface' : 'border-[1.5px] border-dashed border-accent-2/70 bg-accent-2/6',
              )}
            >
              <span className="flex-1 text-[15px] font-semibold">
                יום {dayNumber(d)} · {formatDay(d.date)} {shortDate(d.date)}
              </span>
              <span className={cx('text-[13px]', d.stops.length ? 'text-muted' : 'text-accent-2')}>{d.stops.length ? (d.stops.length === 1 ? 'מקום אחד' : `${d.stops.length} מקומות`) : 'עוד ריק – הוספה'}</span>
              <ChevronDown size={18} className={d.stops.length ? '' : 'text-accent-2'} aria-hidden="true" />
            </button>
          ),
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[560px] flex-col gap-2 border-t border-border bg-surface px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <span className="text-center text-[13px] text-muted">
          {placed === 1 ? 'מקום אחד' : `${placed} מקומות`}
          {empty ? ` · ${empty === 1 ? 'יום אחד עוד פנוי' : `${empty} ימים עוד פנויים`}` : ''} · אפשר להשלים אחר כך
        </span>
        <button type="button" onClick={() => navigate('/trip/schedule')} className="h-[52px] rounded-2xl bg-accent text-base font-semibold text-on-accent">
          סידור הלו״ז ושמירה
        </button>
      </div>
    </div>
  )
}

/** Where you sleep in this city: the saved place, and a link to the lodging map to choose or change it */
function LodgingRow({ destination, checkIn, checkOut, legIndex }: { destination: Destination; checkIn: string; checkOut: string; legIndex: number }) {
  const { state } = useTrip()
  const stay = (state.trip.lodgings ?? []).find((l) => l.checkIn <= checkOut && l.checkOut > checkIn)
  return (
    <a href={href(`/lodging/${legIndex}`)} className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-3 py-2.5">
      <BedDouble size={20} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="flex flex-1 flex-col gap-px">
        <span className="text-xs text-muted">לינה ב{destination.name}</span>
        <span className={cx('text-[15px] font-semibold', !stay && 'text-accent-2')}>{stay ? stay.name : 'עוד לא נבחרה'}</span>
      </span>
      <span className="text-[13px] font-semibold text-accent">{stay ? 'שינוי' : 'מפה והמלצות'}</span>
    </a>
  )
}

/** An open day: its places as cards by morning, afternoon and evening; drag between them; add by recommendation or by hand */
function OpenDay({ day, number, near, onClose }: { day: Day; number: number; near: Destination; onClose: () => void }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const brief = briefOf(trip)
  const visitEditor = useVisitEditor(brief, (p) => dispatch({ type: 'setBrief', brief: { ...brief, ...p } }), trip.days, false)
  const plans = visitsOnDay(trip.brief, trip.days.indexOf(day))
  const [picker, setPicker] = useState<{ part: DayPart; tab: 'rec' | 'manual' } | null>(null)
  const [moved, setMoved] = useState<{ name: string; label: string; from: string; to: string; before: Stop[] } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const free = day.stops.filter((s) => !s.visitId)
  const ids = free.map((s) => s.id)
  const closePicker = useCallback(() => setPicker(null), [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const nameOf = (id: string | number) => day.stops.find((s) => s.id === id)?.name ?? ''
  const accessibility = {
    screenReaderInstructions: { draggable: 'לגרירה: רווח, חצים להזזה, רווח לשחרור, Escape לביטול' },
    announcements: {
      onDragStart: ({ active }: { active: { id: string | number } }) => `${nameOf(active.id)} נגרר`,
      onDragOver: () => undefined,
      onDragEnd: ({ active }: { active: { id: string | number } }) => `${nameOf(active.id)} שוחרר`,
      onDragCancel: ({ active }: { active: { id: string | number } }) => `הגרירה של ${nameOf(active.id)} בוטלה`,
    },
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const stop = day.stops.find((s) => s.id === active.id)
    if (!stop) return
    const overId = String(over.id)
    const target = overId.startsWith('part:') ? (overId.slice(5) as DayPart) : partOf(day.stops.find((s) => s.id === overId)?.start ?? stop.start)
    const next = moveToPart(day, stop.id, target, overId.startsWith('part:') ? undefined : overId)
    dispatch({ type: 'setDayStops', dayId: day.id, stops: next })
    if (target !== partOf(stop.start)) {
      const now = next.find((s) => s.id === stop.id)!
      setMoved({ name: stop.name, label: PARTS.find((p) => p.id === target)!.label, from: stop.start, to: now.start, before: day.stops })
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMoved(null), 7000)
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-card border-[1.5px] border-accent bg-surface p-2.5" aria-label={`יום ${number}`}>
      <button type="button" aria-expanded onClick={onClose} className="flex min-h-8 items-center justify-between px-0.5 text-start">
        <span className="text-base font-bold">
          יום {number} · {formatDay(day.date)} {shortDate(day.date)}
        </span>
        <ChevronUp size={18} aria-hidden="true" />
      </button>
      <DndContext sensors={sensors} accessibility={accessibility} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {PARTS.map((p) => {
              const here = free.filter((s) => partOf(s.start) === p.id)
              const blocks = plans.filter((v) => partOf(fromMin(v.leave)) === p.id)
              return (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <h3 className="mx-0.5 mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-muted">
                    {p.label}
                    <span className="text-xs font-medium">{p.hours}</span>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </h3>
                  {here.length > 0 && (
                    <ol className="flex flex-col gap-1.5">
                      {here.map((s) => (
                        <RouteCard key={s.id} stop={s} dayId={day.id} onRemove={() => dispatch({ type: 'removeStop', stopId: s.id })} />
                      ))}
                    </ol>
                  )}
                  {blocks.map((v) => (
                    <DayVisit key={v.visit.id} plan={v} day={day} onEdit={() => visitEditor.openVisit(v.visit)} />
                  ))}
                  {!here.length && !blocks.length ? <EmptyPart part={p.id} label={p.label} onOpen={() => setPicker({ part: p.id, tab: 'rec' })} /> : <PartEnd part={p.id} />}
                </div>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      {moved && (
        <div role="status" className="flex items-center gap-2.5 rounded-2xl bg-text py-2 ps-3 pe-2 text-bg">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">
              <bdi>{moved.name}</bdi> עבר ל{moved.label}
            </span>
            <span className="text-xs opacity-75">
              מ-{moved.from} ל-{moved.to}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'setDayStops', dayId: day.id, stops: moved.before })
              setMoved(null)
            }}
            className="h-9 shrink-0 rounded-[11px] bg-bg px-3 text-sm font-semibold text-text"
          >
            ביטול
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <button type="button" onClick={() => setPicker({ part: firstOpenPart(day), tab: 'rec' })} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[13px] bg-accent text-sm font-semibold text-on-accent">
          <Sparkles size={15} aria-hidden="true" />
          מקומות מומלצים
        </button>
        <button type="button" onClick={() => setPicker({ part: firstOpenPart(day), tab: 'manual' })} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-accent text-sm font-semibold text-accent">
          <Plus size={15} aria-hidden="true" />
          הוספה ידנית
        </button>
      </div>
      {picker && <RoutePicker day={day} number={number} near={near} initialPart={picker.part} initialTab={picker.tab} onClose={closePicker} />}
      {visitEditor.sheet}
    </section>
  )
}

/** The first part of the day that still has room */
const firstOpenPart = (day: Day): DayPart => {
  const open = PARTS.find((p) => !day.stops.some((s) => partOf(s.start) === p.id))
  return open?.id ?? PARTS.find((p) => nextInPart(day, p.id).free)?.id ?? 'evening'
}

/** An empty part of the day: tap to add, or drop a place here */
function EmptyPart({ part, label, onOpen }: { part: DayPart; label: string; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `part:${part}` })
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      className={cx('h-[46px] rounded-[13px] border-[1.5px] border-dashed text-sm font-semibold text-accent-2', isOver ? 'border-accent bg-accent/12 text-accent' : 'border-accent-2/60 bg-accent-2/6')}
    >
      {isOver ? `שחררו כאן · ${label}` : part === 'morning' ? 'הבוקר פנוי – מקום או בית קפה' : part === 'noon' ? 'הצהריים פנויים – מסעדה או מקום' : 'הערב פנוי – מסעדה או מקום'}
    </button>
  )
}

/** A thin target under a part's cards, for dropping a place at its end */
function PartEnd({ part }: { part: DayPart }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `part:${part}` })
  return <div ref={setNodeRef} aria-hidden="true" className={cx('rounded-lg transition-[height] duration-150', active ? 'h-7 border border-dashed border-border-strong' : 'h-0', isOver && 'border-accent bg-accent/12')} />
}

/** One place: photo, name, time, type, rating; tap for its full page */
function RouteCard({ stop, dayId, onRemove }: { stop: Stop; dayId: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id })
  const manual = stop.info?.source === 'manual'
  const photo = usePlacePhoto(manual ? undefined : stop.name, stop.info?.image, stop)
  const [failed, setFailed] = useState(false)
  const google = stop.info?.source === 'google'
  const to = google && stop.kind === 'food' ? `/restaurant/${stop.info!.ref}/${dayId}` : `/place/${stop.id}`
  const type = manual ? (stop.info?.description ?? KIND_LABEL[stop.kind]) : KIND_LABEL[stop.kind]
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('flex min-h-[84px] items-stretch overflow-hidden rounded-2xl border border-border bg-surface', isDragging && 'relative z-10 border-2 border-accent shadow-[0_16px_32px_rgba(21,24,29,0.24)]')}
    >
      <a href={href(to)} aria-label={`${stop.name} – תמונות, דירוג וביקורות`} className="flex min-w-0 flex-1 items-center gap-2.5 p-1.5">
        {photo && !failed ? (
          <img src={photo.src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-[72px] shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="size-[72px] shrink-0">
            <IconTile kind={stop.kind} size={72} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <bdi className="truncate text-[15px] font-semibold">{stop.name}</bdi>
          <span className="truncate text-xs text-muted">
            {timeRange(stop.start, stop.end)} · {type}
          </span>
          {stop.info?.rating ? (
            <span className="text-xs text-muted">
              <b className="text-text">★ {stop.info.rating.toFixed(1)}</b>
              {stop.info.ratingCount ? ` (${stop.info.ratingCount.toLocaleString('en-US')})` : ''}
            </span>
          ) : manual ? (
            <span className="truncate text-xs text-muted">{stop.note ?? (hasLocation(stop) ? 'המקום שלך' : 'המקום שלך · בלי כתובת')}</span>
          ) : null}
          {stop.kind === 'food' ? (
            <span className="self-start rounded-full bg-accent/12 px-1.5 py-px text-[11px] font-semibold text-accent">מסעדה</span>
          ) : stop.needsBooking && !stop.booked ? (
            <span className="self-start rounded-full bg-accent-2/12 px-1.5 py-px text-[11px] font-semibold text-accent-2">צריך להזמין מראש</span>
          ) : null}
        </span>
      </a>
      <span className="flex w-[38px] shrink-0 flex-col items-center justify-between border-s border-border py-1 text-muted">
        <button type="button" {...attributes} {...listeners} aria-label={`גרירה: ${stop.name}`} className="flex h-9 w-9 cursor-grab touch-none items-center justify-center">
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`הסרת ${stop.name}`} onClick={onRemove} className="flex h-9 w-9 items-center justify-center hover:text-accent-2">
          <X size={16} aria-hidden="true" />
        </button>
      </span>
    </li>
  )
}

/** Paste a list (one place per line) and add each to the open day, using the first search match */
function PasteRoute({ dayId, dayLabel, near, onDone }: { dayId: string; dayLabel: string; near: Destination; onDone: () => void }) {
  const { dispatch } = useTrip()
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const running = useRef(false)
  const lines = text
    .split(/\n|,|·|;/)
    .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter((l) => l.length > 1)
  const run = async () => {
    if (running.current) return
    running.current = true
    const missed: string[] = []
    for (const [i, line] of lines.entries()) {
      setStatus(`מחפש ${i + 1} מתוך ${lines.length}: ${line}`)
      const hit = (await searchPlaces(line, near).catch(() => []))[0]
      if (hit) dispatch({ type: 'addPlace', dayId, place: hit })
      else missed.push(line)
    }
    running.current = false
    setStatus(missed.length ? `לא נמצאו: ${missed.join(', ')}` : '')
    if (!missed.length) onDone()
  }
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
      <label htmlFor="paste-route" className="text-[13px] text-muted">
        מקום בכל שורה – הכל יתווסף ל{dayLabel}
      </label>
      <textarea
        id="paste-route"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={'כיכר הקומרסיו\nטירת סאו ז׳ורז׳ה\nTime Out Market'}
        className="rounded-xl border border-border-strong bg-surface p-3 text-sm outline-none focus:border-accent"
      />
      <div aria-live="polite" className="text-xs text-muted">
        {status}
      </div>
      <button type="button" disabled={!lines.length || running.current} onClick={run} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-40">
        {lines.length ? `הוספת ${lines.length === 1 ? 'מקום אחד' : `${lines.length} מקומות`}` : 'הוספה'}
      </button>
    </div>
  )
}
