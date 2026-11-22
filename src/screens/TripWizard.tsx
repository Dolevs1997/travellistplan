import { Fragment, useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Coffee, Footprints, Info, MapPin, Minus, Plus, Route, TrainFront, Trash2, X, Zap } from 'lucide-react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AddCity, Chip, RoundStepper } from '../components/TripFields'
import { useCityPhoto } from '../data/cityPhoto'
import { estimateFlight } from '../data/flightEstimate'
import { IconButton, cx } from '../components/ui'
import {
  INTERESTS,
  LOCAL_TRANSPORT,
  PACE_HINT,
  PACE_LABEL,
  TIER_LABEL,
  addDays,
  emptyBrief,
  endDateOf,
  estimate,
  money,
  skeletonOps,
  totalNights,
  travelers,
} from '../data/brief'
import { MAX_TRIP_DAYS, isoInDays, shortDate, tripLength } from '../data/helpers'
import type { Destination, TripBrief } from '../data/types'
import { useTrip } from '../state/TripStore'
import { navigate } from '../router'

/**
 * New trip, five steps: where, who, when, how, how much. The answers become a brief that either goes to the
 * trip with the route and dates.
 */

export const WIZARD_KEY = 'trip-planner:wizard'

const STEPS = ['לאן', 'מתי', 'איך', 'כמה']

interface Draft {
  brief: TripBrief
  step: number
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(WIZARD_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Draft
      if (d?.brief && typeof d.step === 'number') return { brief: { ...emptyBrief(), ...d.brief }, step: Math.min(Math.max(d.step, 0), STEPS.length - 1) }
    }
  } catch {
    /* ignore */
  }
  return { brief: emptyBrief(), step: 0 }
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(WIZARD_KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
}

export const clearDraft = () => {
  try {
    localStorage.removeItem(WIZARD_KEY)
  } catch {
    /* ignore */
  }
}

/** Home: start the wizard, optionally with a destination already chosen */
export function startWizard(destination?: Destination) {
  const d = loadDraft()
  const brief = destination ? { ...d.brief, legs: [{ destination, nights: 3 }], multi: true, transfers: [] } : d.brief
  saveDraft({ brief, step: destination ? 0 : d.step })
  navigate('/new')
}

export default function TripWizard() {
  const { dispatch } = useTrip()
  const [{ brief, step }, setDraft] = useState<Draft>(loadDraft)
  const today = isoInDays(0)

  useEffect(() => {
    saveDraft({ brief, step })
  }, [brief, step])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  const patch = (p: Partial<TripBrief>) => setDraft((d) => ({ ...d, brief: { ...d.brief, ...p } }))
  const go = (n: number) => setDraft((d) => ({ ...d, step: n }))

  const end = endDateOf(brief)
  const days = brief.start && end ? tripLength(brief.start, end) : 0
  const datesOk = !!brief.start && brief.start >= today && days > 0 && days <= MAX_TRIP_DAYS
  const ready = [brief.legs.length > 0 && totalNights(brief) + 1 <= MAX_TRIP_DAYS, datesOk, true, true][step]
  const who = `${brief.adults} מבוגרים${brief.children.length ? ` + ${brief.children.length} ילדים` : ''}`
  const where = brief.legs.map((l) => l.destination.name).join(' ו')
  // What's chosen so far, in the header's middle (step 1 just says "new trip")
  const headline =
    step === 0 || !where
      ? 'טיול חדש'
      : step === 1
        ? `${where} · ${who}`
        : step === 2
          ? `${brief.start ? `${shortDate(brief.start)} – ${shortDate(end)}` : where} · ${who}`
          : `קצב ${PACE_LABEL[brief.pace]}${brief.interests.length ? ` · ${brief.interests.length === 1 ? 'תחום עניין אחד' : `${brief.interests.length} תחומי עניין`}` : ''}`
  const footerSummary = `${brief.legs.length === 1 ? 'יעד אחד' : `${brief.legs.length} ערים`} · ${totalNights(brief)} לילות · ${who}`

  const back = () => (step === 0 ? navigate('/') : go(step - 1))

  /** Creates the trip with the route and dates from the answers */
  const finish = () => {
    dispatch({ type: 'createTrip', id: `trip-${Date.now().toString(36)}` })
    dispatch({ type: 'setBrief', brief })
    dispatch({ type: 'applyPlan', ops: skeletonOps(brief), newTripId: '' })
    clearDraft()
    navigate(brief.selfBuild ? '/build' : '/trip')
  }

  /** "I already have a route": create the trip from the cities so far and go straight to editing it */
  const startSelfBuild = () => {
    if (!brief.legs.length) return
    // No dates yet: start two weeks from today; the edit screen changes it
    const start = brief.start && brief.start > today ? brief.start : addDays(today, 14)
    const b: TripBrief = { ...brief, multi: true, selfBuild: true, start, end: addDays(start, totalNights(brief)) }
    dispatch({ type: 'createTrip', id: `trip-${Date.now().toString(36)}` })
    dispatch({ type: 'setBrief', brief: b })
    dispatch({ type: 'applyPlan', ops: skeletonOps(b), newTripId: '' })
    clearDraft()
    navigate('/edit')
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-[130px]">
      <header className="flex flex-col gap-4 px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <IconButton label="סגירה" onClick={() => navigate('/')}>
            <X size={20} aria-hidden="true" />
          </IconButton>
          <span className="min-w-0 truncate text-center text-[15px] font-semibold">{headline}</span>
          <span className="w-11 text-start text-[13px] text-muted" aria-hidden="true" dir="ltr">
            {step + 1}/{STEPS.length}
          </span>
        </div>
        <ol className="grid grid-cols-4 gap-1.5" aria-label={`שלב ${step + 1} מתוך ${STEPS.length}: ${STEPS[step]}`}>
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined} className={cx('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-border-strong')}>
              <span className="sr-only">
                {label}
                {i < step && ' (הושלם)'}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <main className="flex flex-col gap-4 px-5 pt-4">
        {step === 0 && <WhereStep brief={brief} patch={patch} onSelfBuild={startSelfBuild} />}
        {step === 1 && <WhenStep brief={brief} patch={patch} end={end} days={days} today={today} />}
        {step === 2 && <HowStep brief={brief} patch={patch} />}
        {step === 3 && <BudgetStep brief={brief} patch={patch} />}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[560px] flex-col gap-2 border-t border-border bg-surface px-5 pt-3.5 pb-[max(20px,env(safe-area-inset-bottom))]">
        {step === 0 && brief.legs.length > 0 && <span className="text-center text-[13px] text-muted">{footerSummary}</span>}
        {step === 1 && brief.start && (
          <div className="flex items-center justify-between text-[14px]">
            <span className="font-semibold">
              {brief.monthOnly ? `מתחילים ב-${shortDate(brief.start)}` : `${shortDate(brief.start)} – ${shortDate(end)}`} · {totalNights(brief)} לילות
            </span>
            <span className="text-muted">
              טיסה משוערת <strong className="font-semibold text-accent">₪{brief.flightPerPerson ?? 0}</strong> לאדם
            </span>
          </div>
        )}
        <div className="flex gap-2">
          {step > 0 && (
            <IconButton label="לשלב הקודם" onClick={back} className="!size-[52px] !rounded-2xl">
              <ChevronRight size={22} aria-hidden="true" />
            </IconButton>
          )}
          {step === STEPS.length - 1 ? (
            <button type="button" onClick={finish} className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-on-accent shadow-[0_10px_24px_var(--glow-accent)]">
              בנו לי את הטיול
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready}
              onClick={() => go(step + 1)}
              className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-on-accent transition-opacity duration-200 ease-out disabled:opacity-40"
            >
              {step === 0 ? (ready ? 'המשך לתאריכים' : brief.legs.length ? 'יותר מדי לילות' : 'הוסיפו יעד כדי להמשיך') : step === 1 && !datesOk ? 'בחרו תאריכים' : step === 2 ? 'המשך לתקציב' : 'המשך'}
              {ready && <ArrowLeft size={20} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type StepProps = { brief: TripBrief; patch: (p: Partial<TripBrief>) => void }


const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/* ---------- 1. where and who ---------- */

const TRANSFER_MODES = ['רכבת', 'אוטובוס', 'טיסה', 'רכב', 'מעבורת'] as const

function WhereStep({ brief, patch, onSelfBuild }: StepProps & { onSelfBuild: () => void }) {
  const [adding, setAdding] = useState(false)
  const [openTransfer, setOpenTransfer] = useState<number | null>(null)
  const legs = brief.legs
  const transfers = brief.transfers ?? []

  // Every change to the route keeps nights-based dates (the return date follows the nights)
  const setLegs = (next: TripBrief['legs'], nextTransfers = transfers) =>
    patch({ legs: next, multi: true, transfers: nextTransfers.slice(0, Math.max(0, next.length - 1)), intercity: [...new Set(nextTransfers.filter(Boolean))] })

  const addLeg = (d: Destination) => {
    if (!legs.some((l) => l.destination.id === d.id)) setLegs([...legs, { destination: d, nights: 3 }])
    setAdding(false)
  }
  const setNights = (i: number, n: number) => setLegs(legs.map((l, k) => (k === i ? { ...l, nights: n } : l)))
  const removeLeg = (i: number) => setLegs(legs.filter((_, k) => k !== i), transfers.filter((_, k) => k !== Math.max(0, i - 1)))
  const setTransfer = (i: number, mode: string) => {
    const next = [...transfers]
    next[i] = mode
    setLegs(legs, next)
    setOpenTransfer(null)
  }
  const setKids = (n: number) => patch({ children: Array.from({ length: n }, (_, i) => brief.children[i] ?? 7) })
  const setAdults = (adults: number) => patch({ adults, rooms: Math.max(1, Math.ceil(adults / 2)) })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = legs.map((l) => l.destination.id)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setLegs(arrayMove(legs, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold">לאן נוסעים?</h1>
        <p className="text-[15px] leading-[1.45] text-muted">הוסיפו ערים לפי הסדר וכמה לילות בכל אחת. אפשר לגרור כדי לשנות סדר.</p>
      </div>

      <button
        type="button"
        disabled={!legs.length}
        onClick={onSelfBuild}
        className="flex items-center gap-3 rounded-2xl bg-accent/12 px-3.5 py-2.5 text-start text-accent transition-colors duration-200 ease-out hover:bg-accent/16 disabled:opacity-60"
      >
        <Route size={20} aria-hidden="true" />
        <span className="flex flex-1 flex-col gap-px">
          <span className="text-[15px] font-semibold">כבר יש לי מסלול</span>
          <span className="text-xs">{legs.length ? 'אבנה את הימים בעצמי, בלי הצעות אוטומטיות' : 'הוסיפו קודם את הערים במסלול'}</span>
        </span>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2" aria-label="היעדים בטיול">
            {legs.map((leg, i) => (
              <Fragment key={leg.destination.id}>
                {i > 0 && (
                  <li>
                    <button
                      type="button"
                      aria-expanded={openTransfer === i - 1}
                      onClick={() => setOpenTransfer(openTransfer === i - 1 ? null : i - 1)}
                      className="mx-[26px] flex h-9 w-[calc(100%-52px)] items-center gap-2 border-s-2 border-dashed border-accent/40 ps-3 text-start text-[13px] font-medium text-accent"
                    >
                      <TrainFront size={16} aria-hidden="true" />
                      <span className="flex-1">{transfers[i - 1] ? `מעבר: ${transfers[i - 1]}` : 'מעבר: איך עוברים?'}</span>
                      <span className="font-semibold">{transfers[i - 1] ? 'שינוי' : 'בחירה'}</span>
                    </button>
                    {openTransfer === i - 1 && (
                      <div className="flex flex-wrap gap-2 px-[26px] pt-1 pb-2" role="group" aria-label={`מעבר מ${legs[i - 1].destination.name} ל${leg.destination.name}`}>
                        {TRANSFER_MODES.map((m) => (
                          <Chip key={m} small on={transfers[i - 1] === m} onClick={() => setTransfer(i - 1, m)}>
                            {m}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </li>
                )}
                <LegRow leg={leg} onNights={(n) => setNights(i, n)} onRemove={() => removeLeg(i)} />
              </Fragment>
            ))}
            <li>
              {adding || legs.length === 0 ? (
                <AddCity onPick={addLeg} onCancel={legs.length ? () => setAdding(false) : undefined} autoFocus={adding} skip={ids} />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-[52px] w-full items-center gap-2.5 rounded-card border-[1.5px] border-dashed border-border-strong px-4 text-[15px] text-muted"
                >
                  <Plus size={20} className="text-accent" strokeWidth={2.25} aria-hidden="true" />
                  הוספת עיר או מדינה
                </button>
              )}
            </li>
          </ol>
        </SortableContext>
      </DndContext>

      {totalNights(brief) + 1 > MAX_TRIP_DAYS && (
        <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
          אפשר לתכנן עד {MAX_TRIP_DAYS} ימים בטיול אחד. הפחיתו כמה לילות.
        </p>
      )}

      <section className="rounded-[20px] border border-border bg-surface px-3.5 py-1">
        <h2 className="mt-3 mb-1 text-base font-semibold">מי נוסע?</h2>
        <div className="flex items-center justify-between border-b border-border py-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium">מבוגרים</span>
            <span className="text-xs text-muted">גיל 12 ומעלה</span>
          </div>
          <RoundStepper value={brief.adults} min={1} max={12} label="מבוגרים" onChange={setAdults} />
        </div>
        <div className="flex items-center justify-between pt-2 pb-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium">ילדים</span>
            <span className="text-xs text-muted">עד גיל 12</span>
          </div>
          <RoundStepper value={brief.children.length} min={0} max={8} label="ילדים" onChange={setKids} />
        </div>
      </section>
    </>
  )
}

/** One destination: photo, name, and a nights counter; drag the row to reorder. At one night the minus removes it. */
function LegRow({ leg, onNights, onRemove }: { leg: TripBrief['legs'][number]; onNights: (n: number) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: leg.destination.id })
  const photo = useCityPhoto(leg.destination)
  const [failed, setFailed] = useState(false)
  const name = leg.destination.name
  const small = 'flex size-9 items-center justify-center rounded-full bg-raised text-text transition-opacity duration-200 ease-out disabled:opacity-35'
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('flex items-center gap-2.5 rounded-card border border-border bg-surface p-2', isDragging && 'relative z-10 shadow-[var(--float-shadow)]')}
    >
      <span {...attributes} {...listeners} aria-label={`גרירה לשינוי סדר: ${name}`} className="flex shrink-0 cursor-grab touch-none items-center gap-2.5 rounded-tile">
        {photo && !failed ? (
          <img src={photo.src} alt="" onError={() => setFailed(true)} className="size-[52px] rounded-tile object-cover" />
        ) : (
          <span className="flex size-[52px] items-center justify-center rounded-tile bg-water text-accent" aria-hidden="true">
            <MapPin size={22} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base font-semibold">{name}</span>
        <span className="truncate text-xs text-muted">{leg.destination.kind === 'country' ? 'כל המדינה' : leg.destination.country}</span>
      </span>
      <div className="flex items-center gap-1" role="group" aria-label={`לילות ב${name}`}>
        {leg.nights <= 1 ? (
          <button type="button" aria-label={`הסרת ${name}`} onClick={onRemove} className={cx(small, 'text-accent-2')}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" aria-label={`פחות לילות ב${name}`} onClick={() => onNights(leg.nights - 1)} className={small}>
            <Minus size={16} aria-hidden="true" />
          </button>
        )}
        <span className="min-w-11 text-center text-sm font-semibold" aria-live="polite">
          {leg.nights === 1 ? 'לילה 1' : `${leg.nights} לילות`}
        </span>
        <button type="button" aria-label={`עוד לילות ב${name}`} disabled={leg.nights >= 30} onClick={() => onNights(leg.nights + 1)} className={small}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

/* ---------- 2. when ---------- */

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const monthTitle = (ym: string) => new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(`${ym}-01T12:00:00`))
const shiftMonth = (ym: string, n: number) => addDays(`${ym}-15`, n * 30).slice(0, 7)
const monthDays = (ym: string) => {
  const first = new Date(`${ym}-01T12:00:00`)
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return { lead: first.getDay(), dates: Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`) }
}

function WhenStep({ brief, patch, end, days, today }: StepProps & { end: string; days: number; today: string }) {
  const dest = brief.legs[0]?.destination
  const nights = totalNights(brief)
  const [view, setView] = useState((brief.start || addDays(today, 1)).slice(0, 7))
  const { lead, dates } = monthDays(view)
  const price = (iso: string) => (dest ? estimateFlight(dest, iso, today) : 0)

  // The cheapest quarter of this month's bookable days get the teal "cheap" price
  const bookable = dates.filter((d) => d > today)
  const sorted = bookable.map(price).sort((a, b) => a - b)
  const cheapLine = sorted[Math.floor(sorted.length / 4)] ?? 0

  const pick = (iso: string) => patch({ start: iso, end: addDays(iso, nights), monthOnly: false, flightPerPerson: price(iso) })
  // Flexible: the month's cheapest day stands in until exact dates are chosen
  const pickMonth = (ym: string) => {
    const options = monthDays(ym).dates.filter((d) => d > today)
    if (!options.length) return
    const best = options.reduce((a, b) => (price(b) < price(a) ? b : a))
    patch({ start: best, end: addDays(best, nights), monthOnly: true, flightPerPerson: price(best) })
  }
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(addDays(today, 1).slice(0, 7), i))
  const inTrip = (iso: string) => !!brief.start && iso > brief.start && iso <= end

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold">מתי יוצאים?</h1>
        <p className="text-[15px] leading-[1.45] text-muted">
          מתחת לכל יום מופיע מחיר טיסה משוער לאדם. בחרו יום יציאה – החזרה מחושבת לפי {nights === 1 ? 'הלילה' : `${nights} הלילות`}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-tile bg-raised p-1" role="tablist" aria-label="סוג בחירה">
        {[
          { id: false, label: 'תאריכים מדויקים' },
          { id: true, label: 'גמיש – רק חודש' },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="tab"
            aria-selected={brief.monthOnly === o.id}
            onClick={() => patch({ monthOnly: o.id })}
            className={cx(
              'h-10 rounded-[11px] text-[14px] transition-colors duration-200 ease-out',
              brief.monthOnly === o.id ? 'bg-surface font-semibold text-text shadow-[0_1px_3px_rgba(21,24,29,0.1)]' : 'font-medium text-muted',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {brief.monthOnly ? (
        <ul className="grid grid-cols-2 gap-2" aria-label="בחירת חודש">
          {months.map((ym) => {
            const options = monthDays(ym).dates.filter((d) => d > today)
            const from = options.length ? Math.min(...options.map(price)) : 0
            const on = brief.start.slice(0, 7) === ym
            return (
              <li key={ym}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickMonth(ym)}
                  className={cx('flex w-full flex-col items-start gap-0.5 rounded-card border px-4 py-3 text-start', on ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface')}
                >
                  <span className="text-[15px] font-semibold">{monthTitle(ym)}</span>
                  <span className={cx('text-xs', on ? 'text-on-accent/85' : 'text-muted')}>טיסה מ-₪{from} לאדם</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <section className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface px-2.5 py-3" aria-label="לוח שנה">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[17px] font-semibold">{monthTitle(view)}</h2>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="חודש קודם"
                disabled={view <= today.slice(0, 7)}
                onClick={() => setView(shiftMonth(view, -1))}
                className="flex size-11 items-center justify-center rounded-full border border-border-strong bg-surface disabled:opacity-35"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button type="button" aria-label="חודש הבא" onClick={() => setView(shiftMonth(view, 1))} className="flex size-11 items-center justify-center rounded-full border border-border-strong bg-surface">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div aria-hidden="true" className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {dates.map((iso) => {
              const day = Number(iso.slice(8))
              if (iso <= today) {
                return (
                  <button key={iso} type="button" disabled aria-label={`${day}, לא זמין`} className="h-[50px] rounded-xl text-[15px] text-border-strong">
                    {day}
                  </button>
                )
              }
              const p = price(iso)
              const start = iso === brief.start
              const within = inTrip(iso)
              const cheap = p <= cheapLine
              return (
                <button
                  key={iso}
                  type="button"
                  aria-pressed={start}
                  aria-label={`${day} ב${monthTitle(view)}, טיסה משוערת ₪${p}${cheap ? ', זול' : ''}${start ? ', יום יציאה' : within ? ', בתוך הטיול' : ''}`}
                  onClick={() => pick(iso)}
                  className={cx(
                    'flex h-[50px] flex-col items-center justify-center gap-px rounded-xl transition-colors duration-200 ease-out',
                    start ? 'bg-accent text-on-accent' : within ? 'bg-accent/12' : 'hover:bg-raised',
                  )}
                >
                  <span className="text-[15px] font-semibold">{day}</span>
                  <span className={cx('text-[10px]', start ? 'font-medium text-on-accent/85' : cheap ? 'font-semibold text-accent' : 'font-medium text-muted')}>₪{p}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3.5 px-1 pt-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-accent">₪</span>מחיר זול לתאריך
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded bg-accent/12" />
              ימי הטיול
            </span>
          </div>
        </section>
      )}

      <p className="text-xs leading-relaxed text-muted">המחירים הם הערכה לפי מרחק, יום בשבוע ומועד ההזמנה – המחיר האמיתי ייקבע בהזמנה.</p>
      {brief.start && days > MAX_TRIP_DAYS && (
        <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
          אפשר לתכנן עד {MAX_TRIP_DAYS} ימים בטיול אחד.
        </p>
      )}
    </>
  )
}

/* ---------- 3. how ---------- */

const PACE_ICON = { relaxed: Coffee, balanced: Footprints, packed: Zap } as const

function HowStep({ brief, patch }: StepProps) {
  const transport = brief.localTransport[0] ?? LOCAL_TRANSPORT[0]
  const heading = 'text-[14px] font-semibold text-muted'
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold">איך אתם מטיילים?</h1>
        <p className="text-[15px] leading-[1.45] text-muted">לפי זה נבנה כל יום – כמה עצירות, איזה סוג, ואיך מגיעים ביניהן.</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>קצב</h2>
        <div role="radiogroup" aria-label="קצב הטיול" className="grid grid-cols-3 gap-2">
          {(['relaxed', 'balanced', 'packed'] as const).map((p) => {
            const on = brief.pace === p
            const Icon = PACE_ICON[p]
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => patch({ pace: p })}
                className={cx(
                  'flex flex-col items-center gap-1.5 rounded-card px-2 py-3 transition-colors duration-200 ease-out',
                  on ? 'border-2 border-accent bg-accent/12 py-[11px]' : 'border border-border bg-surface hover:border-border-strong',
                )}
              >
                <Icon size={22} className={on ? 'text-accent' : 'text-muted'} aria-hidden="true" />
                <span className="text-[15px] font-semibold">{PACE_LABEL[p]}</span>
                <span className={cx('text-xs', on ? 'text-accent' : 'text-muted')}>{PACE_HINT[p]}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2" role="group" aria-label="תחומי עניין">
        <h2 className={heading}>
          מה מעניין אתכם? <span className="font-normal">(אפשר כמה)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <Chip key={i} on={brief.interests.includes(i)} onClick={() => patch({ interests: toggleIn(brief.interests, i) })}>
              {i}
            </Chip>
          ))}
        </div>
      </section>

      <section className="rounded-[20px] border border-border bg-surface px-3.5 py-0.5">
        <SwitchRow on={brief.kosher} onChange={(kosher) => patch({ kosher })} title="מסעדות כשרות" hint="ואם אין בסביבה – צמחוני" divider />
        <SwitchRow on={brief.shortWalks ?? true} onChange={(shortWalks) => patch({ shortWalks })} title="בלי הליכות ארוכות" hint="עד 15 דק׳ הליכה בין עצירות" />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>איך מתניידים?</h2>
        <div role="radiogroup" aria-label="תחבורה בתוך הערים" className="flex flex-wrap gap-2">
          {LOCAL_TRANSPORT.map((t) => {
            const on = transport === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => patch({ localTransport: [t] })}
                className={cx(
                  'h-10 rounded-full border px-3.5 text-[14px] transition-colors duration-200 ease-out',
                  on ? 'border-accent bg-accent/12 font-semibold text-accent' : 'border-border-strong bg-surface font-medium hover:border-accent',
                )}
              >
                {t}
              </button>
            )
          })}
        </div>
      </section>
    </>
  )
}

/** A row with a title, a hint and an on/off switch */
function SwitchRow({ on, onChange, title, hint, divider }: { on: boolean; onChange: (v: boolean) => void; title: string; hint: string; divider?: boolean }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 py-2.5', divider && 'border-b border-border')}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={cx('relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200 ease-out', on ? 'bg-accent' : 'bg-border-strong')}
      >
        <span className={cx('absolute top-[3px] size-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all duration-200 ease-out', on ? 'end-[3px]' : 'start-[3px]')} />
      </button>
    </div>
  )
}

/* ---------- 4. how much ---------- */

/** Approximate shekels per euro, for the ₪ / € switch (estimates only) */
const ILS_PER_EUR = 4
const BAR_COLORS = ['bg-accent', 'bg-[#5FC2AE]', 'bg-[#D8C7A6]', 'bg-[#9AA1AB]']
const TIER_DESC = { budget: 'הוסטל או גסטהאוס · אוכל רחוב', comfort: 'מלון 3–4 כוכבים במרכז', premium: 'מלון בוטיק · מסעדות שף' } as const

function BudgetStep({ brief, patch }: StepProps) {
  const [eur, setEur] = useState(false)
  const people = travelers(brief)
  const chosen = brief.tier === 'custom' ? 'comfort' : brief.tier
  const fmt = (ils: number) => (eur ? `€${(Math.round(ils / ILS_PER_EUR / 10) * 10).toLocaleString('en-US')}` : money(ils))

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-bold">כמה להוציא?</h1>
          <p className="text-[15px] leading-[1.45] text-muted">
            סה״כ ל-{people} נוסעים, כולל {brief.flightPerPerson ? 'טיסות ולינה' : 'לינה'}.
          </p>
        </div>
        <div role="group" aria-label="מטבע" className="flex shrink-0 rounded-xl bg-raised p-[3px]">
          {[
            { on: !eur, label: '₪', set: false },
            { on: eur, label: '€', set: true },
          ].map((c) => (
            <button
              key={c.label}
              type="button"
              aria-pressed={c.on}
              onClick={() => setEur(c.set)}
              className={cx('h-9 w-11 rounded-[9px] text-[15px]', c.on ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(21,24,29,0.1)]' : 'font-medium text-muted')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div role="radiogroup" aria-label="רמת תקציב" className="flex flex-col gap-2">
        {(['budget', 'comfort', 'premium'] as const).map((t) => {
          const e = estimate(brief, t)
          const on = chosen === t
          const parts = [
            { label: 'לינה', value: e.lodging },
            { label: 'טיסות', value: e.flights },
            { label: 'אוכל', value: e.food },
            { label: 'אטרקציות ונסיעות', value: e.attractions + e.intercity },
          ].filter((p) => p.value > 0)
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => patch({ tier: t })}
              className={cx(
                'flex flex-col gap-3 rounded-card bg-surface text-start transition-colors duration-200 ease-out',
                on ? 'border-2 border-accent p-[13px] shadow-[0_6px_18px_rgba(11,127,109,0.12)]' : 'border border-border p-3.5 hover:border-border-strong',
              )}
            >
              <span className="flex w-full items-center gap-3">
                <span className={cx('flex size-[22px] shrink-0 items-center justify-center rounded-full border-2', on ? 'border-accent' : 'border-border-strong')} aria-hidden="true">
                  {on && <span className="size-2.5 rounded-full bg-accent" />}
                </span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-base font-semibold">{TIER_LABEL[t]}</span>
                  <span className="text-[13px] text-muted">{TIER_DESC[t]}</span>
                </span>
                <span className={cx('text-[17px] font-bold', on && 'text-accent')}>{fmt(e.total)}</span>
              </span>
              {on && (
                <>
                  <span aria-hidden="true" className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                    {parts.map((p, i) => (
                      <span key={p.label} className={BAR_COLORS[i]} style={{ width: `${(p.value / e.total) * 100}%` }} />
                    ))}
                  </span>
                  <span className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                    {parts.map((p, i) => (
                      <span key={p.label} className="flex items-center gap-1.5">
                        <span className={cx('size-2.5 shrink-0 rounded-[3px]', BAR_COLORS[i])} />
                        {p.label}
                        <strong className="ms-auto font-semibold">{fmt(p.value)}</strong>
                      </span>
                    ))}
                  </span>
                  {!e.flights && <span className="text-xs text-muted">טיסות לא כלולות – בחרו יום יציאה בשלב התאריכים כדי לכלול הערכה.</span>}
                </>
              )}
            </button>
          )
        })}
      </div>

      <p className="flex items-start gap-2 text-[13px] leading-[1.45] text-muted">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        הסכומים הם הערכה לפי רמת המחירים ביעד{eur ? ' (בשער משוער)' : ''}. המחיר הסופי ייקבע בהזמנה, ותוכלו לעקוב אחריו במסך התקציב.
      </p>
    </>
  )
}
