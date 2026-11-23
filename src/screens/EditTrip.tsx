import { Fragment, useEffect, useState } from 'react'
import { BedDouble, Car, ChevronLeft, Clock, GripVertical, MapPin, Minus, Plus, RefreshCw, Route, TrainFront, Trash2 } from 'lucide-react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AddCity, RoundStepper } from '../components/TripFields'
import { useVisitEditor } from '../components/VisitParts'
import { visitBetween, visitsWithReplacedLeg, visitsWithoutLeg } from '../data/visits'
import { useCityPhoto } from '../data/cityPhoto'
import { cx } from '../components/ui'
import { addDays, totalNights } from '../data/brief'
import { MAX_TRIP_DAYS, isoInDays, shortDate, tripLegs } from '../data/helpers'
import { applyEdit, loadEditDraft, newDraft, routeChanged, saveEditDraft, clearEditDraft, stopsLost, type EditDraft } from '../data/tripEdit'
import type { Destination, TripBrief } from '../data/types'
import { useTrip } from '../state/TripStore'
import { href, navigate } from '../router'

/** How people get around inside a city (the edit screen's four choices) */
export const CITY_MODES = ['ציבורית', 'רכב', 'מוניות', 'ברגל'] as const
const FROM_WIZARD: Record<string, string> = { 'תחבורה ציבורית': 'ציבורית', 'רכב שכור': 'רכב', מוניות: 'מוניות' }

export const cityModeOf = (b: TripBrief, destId: string) => b.cityTransport?.[destId] ?? FROM_WIZARD[b.localTransport[0]] ?? 'ציבורית'

const box = 'rounded-[14px] border border-border-strong bg-surface'

export default function EditTrip() {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const [draft, setDraft] = useState<EditDraft>(() => loadEditDraft(trip.id) ?? newDraft(trip))
  const [who, setWho] = useState(false)
  const [adding, setAdding] = useState(false)
  // The city being swapped for another
  const [replacing, setReplacing] = useState<string | null>(null)

  // Keep the draft in session storage so the transfer and rental screens see it
  useEffect(() => saveEditDraft(draft), [draft])

  const b = draft.brief
  const savedLegs = tripLegs(trip)
  /** The saved city's index and where you sleep there (lodging is picked on the saved trip) */
  const lodgingOf = (destId: string) => {
    const i = savedLegs.findIndex((l) => l.destination.id === destId)
    if (i < 0) return { index: -1, name: undefined }
    const days = savedLegs[i].days
    const from = days[0].date
    const to = days[days.length - 1].date
    const stay = (trip.lodgings ?? []).find((l) => l.checkIn <= to && l.checkOut > from)
    return { index: i, name: stay?.name }
  }
  const legs = b.legs
  const ids = legs.map((l) => l.destination.id)
  const patchBrief = (p: Partial<TripBrief>) => setDraft((d) => ({ ...d, brief: { ...d.brief, ...p } }))
  const setLegs = (next: TripBrief['legs'], transfers = b.transfers ?? []) => patchBrief({ legs: next, transfers: transfers.slice(0, Math.max(0, next.length - 1)) })

  /** Transfers next to a changed city no longer apply: they go back to "to choose" */
  const removeLeg = (i: number) => {
    const t = Array.from({ length: Math.max(0, legs.length - 1) }, (_, k) => b.transfers?.[k] ?? '')
    if (i === 0) t.shift()
    else if (i === legs.length - 1) t.splice(i - 1, 1)
    else t.splice(i - 1, 2, '')
    patchBrief({ legs: legs.filter((_, k) => k !== i), transfers: t.slice(0, Math.max(0, legs.length - 2)), visits: visitsWithoutLeg(b, i) })
  }
  const visitsUi = useVisitEditor(b, patchBrief, trip.days)
  const replaceLeg = (i: number, destination: Destination) => {
    const t = Array.from({ length: Math.max(0, legs.length - 1) }, (_, k) => (k === i || k === i - 1 ? '' : (b.transfers?.[k] ?? '')))
    patchBrief({ legs: legs.map((l, k) => (k === i ? { ...l, destination } : l)), transfers: t.slice(0, Math.max(0, legs.length - 1)), visits: visitsWithReplacedLeg(b, i, destination) })
    setReplacing(null)
  }

  const nights = totalNights(b)
  const end = draft.start ? addDays(draft.start, nights) : ''
  const lost = stopsLost(trip, draft)
  const changed = routeChanged(trip, draft)
  const tooLong = nights + 1 > MAX_TRIP_DAYS
  const canSave = legs.length > 0 && !!draft.start && !tooLong

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setLegs(arrayMove(legs, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  // Leaving the editor returns to the screen it was opened from (the overview, the trip details…)
  const goBack = () => (history.length > 1 ? history.back() : navigate('/overview'))
  const cancel = () => {
    clearEditDraft(trip.id)
    goBack()
  }
  // A self-built trip continues to its days after saving; others go back to where editing started
  const save = (then?: string) => {
    applyEdit(trip, draft, dispatch)
    if (then) navigate(then)
    else if (trip.brief?.selfBuild) navigate('/build')
    else goBack()
  }

  let cursor = 0
  const legDates = legs.map((l) => {
    const from = draft.start ? addDays(draft.start, cursor) : ''
    cursor += l.nights
    return { from, to: draft.start ? addDays(draft.start, cursor) : '' }
  })

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col gap-3.5 px-5 pt-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <button type="button" onClick={cancel} className="flex h-11 min-w-11 items-center text-[15px] text-muted">
          ביטול
        </button>
        <h1 className="text-lg font-bold">עריכת הטיול</h1>
        <button type="button" disabled={!canSave} onClick={() => save()} className="h-10 rounded-xl bg-accent px-4 text-[15px] font-semibold text-on-accent disabled:opacity-40">
          שמירה
        </button>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">שם הטיול</span>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className={cx(box, 'h-12 px-3.5 text-base outline-none focus:border-accent')}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className={cx(box, 'relative flex h-16 flex-col justify-center gap-0.5 px-3.5 focus-within:border-accent')}>
          <span className="text-xs text-muted">תאריכים</span>
          <span className="text-[15px] font-semibold">{draft.start ? `${shortDate(draft.start)} – ${shortDate(end)}` : 'בחירה'}</span>
          <input
            type="date"
            aria-label="תאריך יציאה"
            min={isoInDays(0)}
            value={draft.start}
            onChange={(e) => e.target.value && setDraft((d) => ({ ...d, start: e.target.value }))}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button type="button" aria-expanded={who} onClick={() => setWho(!who)} className={cx(box, 'flex h-16 flex-col items-start justify-center gap-0.5 px-3.5 text-start')}>
          <span className="text-xs text-muted">נוסעים</span>
          <span className="text-[15px] font-semibold">
            {b.adults} מבוגרים{b.children.length ? ` + ${b.children.length} ילדים` : ''}
          </span>
        </button>
      </div>

      {who && (
        <section className="rounded-card border border-border bg-surface px-3.5 py-1" aria-label="נוסעים">
          <div className="flex items-center justify-between border-b border-border py-2">
            <span className="text-[15px] font-medium">מבוגרים</span>
            <RoundStepper value={b.adults} min={1} max={12} label="מבוגרים" onChange={(adults) => patchBrief({ adults, rooms: Math.max(1, Math.ceil(adults / 2)) })} />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[15px] font-medium">ילדים</span>
            <RoundStepper value={b.children.length} min={0} max={8} label="ילדים" onChange={(n) => patchBrief({ children: Array.from({ length: n }, (_, i) => b.children[i] ?? 7) })} />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">ערים, לילות והתניידות</h2>
          <span className="text-xs text-muted">גררו לשינוי סדר</span>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-2">
              {legs.map((leg, i) => (
                <Fragment key={leg.destination.id}>
                  {i > 0 && !visitBetween(b, legs[i - 1].destination.id, leg.destination.name) && (
                    <li>
                      <a
                        href={href(`/transfer/${i - 1}`)}
                        className="mx-6 flex h-9 items-center gap-2 border-s-2 border-dashed border-accent/40 ps-3 text-[13px] font-medium text-accent"
                      >
                        <TrainFront size={16} aria-hidden="true" />
                        <span className="flex-1">
                          מעבר {legs[i - 1].destination.name} ← {leg.destination.name}: {b.transfers?.[i - 1] ?? 'לבחירה'}
                          {legDates[i].from && ` · ${shortDate(legDates[i].from)}`}
                        </span>
                        <span className="font-semibold">{b.transfers?.[i - 1] ? 'שינוי' : 'בחירה'}</span>
                      </a>
                    </li>
                  )}
                  <CityCard
                    dest={leg.destination}
                    nights={leg.nights}
                    dates={legDates[i]}
                    mode={cityModeOf(b, leg.destination.id)}
                    rental={b.rentals?.[leg.destination.id]?.company}
                    lodging={lodgingOf(leg.destination.id)}
                    onNights={(n) => setLegs(legs.map((l, k) => (k === i ? { ...l, nights: n } : l)))}
                    onRemove={() => removeLeg(i)}
                    canRemove={legs.length > 1}
                    replacing={replacing === leg.destination.id}
                    onReplace={() => (setAdding(false), setReplacing(replacing === leg.destination.id ? null : leg.destination.id))}
                    picker={<AddCity onPick={(d) => replaceLeg(i, d)} onCancel={() => setReplacing(null)} autoFocus skip={ids} placeholder={`במה להחליף את ${leg.destination.name}?`} browseOpen />}
                    onToVisit={i > 0 ? () => visitsUi.convertLeg(i) : undefined}
                  />
                  {visitsUi.cardsAfter(leg.destination.id)}
                </Fragment>
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        {adding ? (
          <AddCity
            onPick={(d: Destination) => {
              if (!ids.includes(d.id)) setLegs([...legs, { destination: d, nights: 3 }])
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
            autoFocus
            skip={ids}
            browseOpen
          />
        ) : (
          <button type="button" onClick={() => (setReplacing(null), setAdding(true))} className="h-12 rounded-[14px] border-[1.5px] border-dashed border-border-strong text-[14px] font-semibold text-accent">
            + הוספת עיר
          </button>
        )}
        {visitsUi.adder}
        {visitsUi.sheet}
      </section>

      {tooLong && (
        <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
          אפשר לתכנן עד {MAX_TRIP_DAYS} ימים בטיול אחד. הפחיתו כמה לילות.
        </p>
      )}
      {changed && lost > 0 && (
        <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
          {lost === 1 ? 'עצירה אחת' : `${lost} עצירות`} של ימים או יעדים שיצאו מהטיול יימחקו בשמירה. אפשר ללחוץ ״ביטול״ כדי להשאיר הכול.
        </p>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={() => save('/build')}
        className="mt-auto flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-start disabled:opacity-40"
      >
        <Route size={20} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">עריכת הימים והעצירות ידנית</span>
          <span className="text-xs text-muted">{changed ? 'השינויים יישמרו קודם' : 'מה עושים בכל יום, ואיפה ישנים'}</span>
        </span>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

function CityCard({
  dest,
  nights,
  dates,
  mode,
  rental,
  onNights,
  onRemove,
  canRemove,
  lodging,
  replacing,
  onReplace,
  picker,
  onToVisit,
}: {
  lodging: { index: number; name?: string }
  dest: Destination
  nights: number
  dates: { from: string; to: string }
  mode: string
  rental?: string
  onNights: (n: number) => void
  onRemove: () => void
  canRemove: boolean
  replacing: boolean
  onReplace: () => void
  picker: React.ReactNode
  /** At one night, the minus offers a visit of a few hours instead */
  onToVisit?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dest.id })
  const small = 'flex size-9 items-center justify-center rounded-full bg-raised transition-opacity duration-200 ease-out disabled:opacity-35'
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('flex flex-col gap-2.5 overflow-hidden rounded-[20px] border border-border bg-surface pb-3', isDragging && 'relative z-10 shadow-[var(--float-shadow)]')}
    >
      <CityPhoto dest={dest} nights={nights} />
      <div className="flex items-center gap-2.5 px-3">
        <button type="button" {...attributes} {...listeners} aria-label={`גרירה לשינוי סדר: ${dest.name}`} className="flex h-11 w-7 cursor-grab touch-none items-center justify-center text-muted">
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-base font-semibold">{dest.name}</span>
          <span className="text-xs text-muted">{dates.from ? `${shortDate(dates.from)} – ${shortDate(dates.to)}` : dest.country}</span>
        </span>
        <div className="flex items-center gap-0.5" role="group" aria-label={`לילות ב${dest.name}`}>
          {nights <= 1 && onToVisit ? (
            <button type="button" aria-label={`${dest.name} לכמה שעות, בלי לינה`} title="כמה שעות, בלי לינה" onClick={onToVisit} className={cx(small, 'text-accent-2')}>
              <Clock size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" aria-label={`פחות לילות ב${dest.name}`} disabled={nights <= 1} onClick={() => onNights(nights - 1)} className={small}>
              <Minus size={16} aria-hidden="true" />
            </button>
          )}
          <span className="min-w-[42px] text-center text-sm font-semibold" aria-live="polite">
            {nights === 1 ? 'לילה 1' : `${nights} לילות`}
          </span>
          <button type="button" aria-label={`עוד לילות ב${dest.name}`} disabled={nights >= 30} onClick={() => onNights(nights + 1)} className={small}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3">
        <button type="button" aria-expanded={replacing} onClick={onReplace} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border-strong text-[13px] font-semibold">
          <RefreshCw size={14} aria-hidden="true" />
          החלפת יעד
        </button>
        <button
          type="button"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={`מחיקת ${dest.name} מהטיול`}
          className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border-strong text-[13px] font-semibold text-accent-2 disabled:opacity-40"
        >
          <Trash2 size={14} aria-hidden="true" />
          מחיקת יעד
        </button>
      </div>
      {replacing && <div className="px-3">{picker}</div>}

      {lodging.index >= 0 ? (
        <a href={href(`/city/${lodging.index}`)} className="mx-3 flex items-center gap-2.5 rounded-[14px] border border-border bg-raised px-3 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-semibold">לינה, התניידות ורכב ב{dest.name}</span>
            <span className="flex flex-wrap gap-1.5 text-xs">
              <span className={cx('flex items-center gap-1', lodging.name ? 'text-muted' : 'font-semibold text-accent-2')}>
                <BedDouble size={13} aria-hidden="true" />
                <bdi className="max-w-[150px] truncate">{lodging.name ?? 'אין לינה עדיין'}</bdi>
              </span>
              <span className="text-muted" aria-hidden="true">
                ·
              </span>
              <span className={cx('flex items-center gap-1', mode === 'רכב' && !rental ? 'font-semibold text-accent-2' : 'text-muted')}>
                {mode === 'רכב' && <Car size={13} aria-hidden="true" />}
                {mode === 'רכב' ? (rental ? `רכב: ${rental}` : 'רכב – בלי חברה') : mode}
              </span>
            </span>
          </span>
          <ChevronLeft size={18} className="text-muted" aria-hidden="true" />
        </a>
      ) : (
        <p className="mx-3 rounded-[14px] border border-dashed border-border-strong px-3 py-2.5 text-[13px] text-muted">שמרו את השינויים כדי לבחור לינה, התניידות ורכב ב{dest.name}</p>
      )}
    </li>
  )
}

/** A wide photo of the city across the top of its card (a tinted map pin while it loads or if none exists) */
function CityPhoto({ dest, nights }: { dest: Destination; nights: number }) {
  const photo = useCityPhoto(dest)
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative h-[150px] bg-water">
      {photo && !failed ? (
        <img src={photo.src} alt={`תמונה של ${dest.name}`} onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-accent" aria-hidden="true">
          <MapPin size={36} />
        </span>
      )}
      <span className="absolute top-2.5 right-2.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold shadow-sm">
        {dest.kind === 'country' ? 'כל המדינה' : dest.country}
      </span>
      <span className="absolute top-2.5 left-2.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-on-accent shadow-sm">
        {nights === 1 ? 'לילה 1' : `${nights} לילות`}
      </span>
    </div>
  )
}
