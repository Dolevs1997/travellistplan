import { useEffect, useRef, useState } from 'react'
import { Bus, Car, Clock, Minus, Plane, Plus, Ship, TrainFront, Trash2, UtensilsCrossed, X, type LucideIcon } from 'lucide-react'
import { addDays, legsWithNights } from '../data/brief'
import { fromMin, timeRange, toMin } from '../data/helpers'
import type { Day, Destination, TripBrief, Visit } from '../data/types'
import type { TransferMode } from '../data/transport'
import { newVisit, onDay, planVisits, stayToVisit, travelChoices, visitDayIndex, visitToStay, type VisitPlan } from '../data/visits'
import { href } from '../router'
import { AddCity } from './TripFields'
import { cx } from './ui'

const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HOURS = [2, 3, 4, 5, 6]
export const hoursText = (h: number) => (h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`)
const driveText = (m: number) =>
  m < 60 ? `כ-${m} דק׳` : m === 60 ? 'כשעה' : m === 120 ? 'כשעתיים' : m % 60 === 0 ? `כ-${m / 60} שעות` : `כ-${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שע׳`
const MODE: Record<TransferMode, { Icon: LucideIcon; word: string }> = {
  רכבת: { Icon: TrainFront, word: 'רכבת' },
  אוטובוס: { Icon: Bus, word: 'אוטובוס' },
  טיסה: { Icon: Plane, word: 'טיסה' },
  רכב: { Icon: Car, word: 'נסיעה' },
  מעבורת: { Icon: Ship, word: 'מעבורת' },
}
const travelText = (mode: TransferMode, m: number) => `${MODE[mode].word} · ${driveText(m)}`
const withMi = (prefix: string, name: string) => (/^[\u0590-\u05FF]/.test(name) ? `${prefix}${name}` : `${prefix}-${name}`)

function ModeIcon({ mode, className }: { mode: TransferMode; className?: string }) {
  const { Icon } = MODE[mode]
  return <Icon size={16} className={className} aria-hidden="true" />
}

/** The orange card in the route: a destination for a few hours */
export function VisitCard({ plan, onHours, onOpen }: { plan: VisitPlan; onHours: (h: number) => void; onOpen: () => void }) {
  const { visit: v } = plan
  const small = 'flex size-9 items-center justify-center rounded-full bg-surface text-text disabled:opacity-35'
  return (
    <li className="flex flex-col gap-1.5">
      <span className="mx-[26px] flex h-8 items-center gap-2 border-s-2 border-dashed border-accent/40 ps-3 text-[13px] font-medium text-accent">
        <ModeIcon mode={plan.modeIn} />
        {travelText(plan.modeIn, plan.driveIn)}
      </span>
      <div className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-accent-2 bg-accent-2/6 p-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-[52px] shrink-0 items-center justify-center rounded-tile bg-accent-2/80 text-white" aria-hidden="true">
            <Clock size={24} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <bdi className="truncate text-base font-semibold">{v.destination.name}</bdi>
            <span className="truncate text-xs font-semibold text-accent-2">ביקור בלי לינה · יום {plan.dayIndex + 1}</span>
          </span>
          <div className="flex items-center gap-1" role="group" aria-label={`שעות ב-${v.destination.name}`}>
            <button type="button" aria-label="פחות שעות" disabled={v.hours <= 1} onClick={() => onHours(v.hours - 1)} className={small}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <span className="min-w-12 text-center text-sm font-bold text-accent-2" aria-live="polite">
              {hoursText(v.hours)}
            </span>
            <button type="button" aria-label="עוד שעות" disabled={v.hours >= 12} onClick={() => onHours(v.hours + 1)} className={small}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <button type="button" onClick={onOpen} className="h-9 rounded-[11px] bg-surface text-[13px] font-semibold text-accent-2">
          שעות הביקור: {timeRange(fromMin(plan.arrive), fromMin(plan.depart))}
        </button>
      </div>
      <span className="mx-[26px] flex h-8 items-center gap-2 border-s-2 border-dashed border-accent/40 ps-3 text-[13px] font-medium text-accent">
        <ModeIcon mode={plan.modeOut} />
        <span>
          ממשיכים <bdi>{withMi('ל', plan.to.name)}</bdi> · {travelText(plan.modeOut, plan.driveOut)}
        </span>
      </span>
    </li>
  )
}

/** Choose how long, which day and when to leave, with a preview of the day */
function VisitSheet({
  brief,
  initial,
  isNew,
  days,
  onSave,
  onRemove,
  onMakeStay,
  onClose,
}: {
  brief: TripBrief
  initial: Visit
  isNew: boolean
  days?: Day[]
  onSave: (v: Visit) => void
  onRemove?: () => void
  onMakeStay?: () => void
  onClose: () => void
}) {
  const [hours, setHours] = useState(initial.hours)
  const [other, setOther] = useState(!HOURS.includes(initial.hours))
  const [leave, setLeave] = useState(initial.leave)
  const [modeIn, setModeIn] = useState(initial.modeIn)
  const [modeOut, setModeOut] = useState(initial.modeOut)
  const withThis = (x: Visit): TripBrief => ({ ...brief, visits: [...(brief.visits ?? []).filter((o) => o.id !== x.id), x] })
  const [day, setDay] = useState(() => visitDayIndex(withThis(initial), initial))
  const total = legsWithNights(brief).reduce((a, l) => a + l.nights, 0)
  const draft = onDay(brief, { ...initial, hours, leave: leave || initial.leave, modeIn, modeOut }, day)
  const plan = planVisits(withThis(draft)).find((p) => p.visit.id === draft.id)
  const ref = useRef<HTMLElement>(null)
  const name = initial.destination.name
  const date = (d: number) => (brief.start ? addDays(brief.start, d) : '')
  const label = (d: number) => {
    const iso = date(d)
    return iso ? `${WEEKDAY[new Date(`${iso}T12:00:00`).getDay()]} ${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}` : ''
  }
  // Regular stops already planned in the hours this takes
  const clash =
    plan && days?.[plan.dayIndex]
      ? days[plan.dayIndex].stops.find((s) => s.visitId !== draft.id && !s.visitId && toMin(s.start) < plan.reach && toMin(s.end) > plan.leave)
      : undefined
  const late = !!plan && plan.reach >= 24 * 60

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-[rgba(21,24,29,0.45)]" />
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`כמה זמן ב-${name}`} className="relative flex max-h-[94vh] w-full max-w-[560px] flex-col rounded-t-[28px] bg-bg outline-none">
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-[22px] font-bold">
            כמה זמן <bdi>{withMi('ב', name)}</bdi>?
          </h2>
          <button type="button" aria-label="סגירה" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-3.5 overflow-x-hidden overflow-y-auto px-4 pt-3 pb-4">
          <div role="group" aria-label="סוג השהייה" className="flex rounded-[13px] bg-raised p-[3px]">
            <button type="button" aria-pressed={false} onClick={onMakeStay} disabled={!onMakeStay} className="h-10 flex-1 rounded-[10px] text-sm font-medium text-muted disabled:opacity-40">
              לילות
            </button>
            <button type="button" aria-pressed className="h-10 flex-1 rounded-[10px] bg-surface text-sm font-bold shadow-[0_1px_3px_rgba(21,24,29,0.1)]">
              כמה שעות, בלי לינה
            </button>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold text-muted">כמה שעות?</legend>
            <div className="flex gap-1.5">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={!other && hours === h}
                  onClick={() => (setOther(false), setHours(h))}
                  className={cx('h-11 flex-1 rounded-[13px] text-sm', !other && hours === h ? 'border-2 border-accent-2 bg-accent-2/8 font-bold text-accent-2' : 'border border-border-strong bg-surface font-medium')}
                >
                  {h}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={other}
                onClick={() => setOther(true)}
                className={cx('h-11 flex-[1.3] rounded-[13px] text-sm', other ? 'border-2 border-accent-2 bg-accent-2/8 font-bold text-accent-2' : 'border border-border-strong bg-surface font-medium')}
              >
                אחר
              </button>
            </div>
            {other && (
              <label className="flex items-center justify-between gap-3 rounded-[14px] border border-border-strong bg-surface px-3 py-2 text-sm">
                מספר שעות
                <input
                  type="number"
                  min={1}
                  max={12}
                  step={0.5}
                  value={hours}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (n >= 1 && n <= 12) setHours(n)
                  }}
                  className="h-9 w-20 rounded-lg border border-border-strong bg-surface px-2 text-center font-semibold"
                />
              </label>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold text-muted">באיזה יום?</legend>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {Array.from({ length: total + 1 }, (_, d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={day === d}
                  onClick={() => setDay(d)}
                  className={cx('flex h-[54px] min-w-[76px] shrink-0 flex-col items-center justify-center gap-px rounded-[14px] px-2', day === d ? 'border-2 border-accent-2 bg-accent-2/8' : 'border border-border bg-surface')}
                >
                  <b className="text-[13px] font-semibold">יום {d + 1}</b>
                  {label(d) && <span className="text-[11px] text-muted">{label(d)}</span>}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex h-12 shrink-0 items-center justify-between gap-3 rounded-[14px] border border-border-strong bg-surface px-3 text-sm">
            <span>
              מתי יוצאים <bdi>{withMi('מ', plan?.from.name ?? '')}</bdi>?
            </span>
            <input type="time" step={300} value={leave} onChange={(e) => e.target.value && setLeave(e.target.value)} className="bg-transparent text-[17px] font-bold outline-none" />
          </label>

          {plan && (
            <>
              <ModePicker label={<>איך מגיעים <bdi>{withMi('ל', name)}</bdi>?</>} choices={travelChoices(brief, plan.from, initial.destination)} value={plan.modeIn} onPick={setModeIn} />
              <ModePicker label={<>איך ממשיכים <bdi>{withMi('ל', plan.to.name)}</bdi>?</>} choices={travelChoices(brief, initial.destination, plan.to)} value={plan.modeOut} onPick={setModeOut} />
            </>
          )}

          {plan && (
            <div className="flex shrink-0 flex-col rounded-2xl border border-border bg-surface px-3 py-2">
              <span className="pt-1 pb-0.5 text-[13px] font-semibold text-muted">כך ייראה היום</span>
              <ol>
                <PreviewRow time={plan.leave} text={<>יוצאים <bdi>{withMi('מ', plan.from.name)}</bdi></>} sub={travelText(plan.modeIn, plan.driveIn)} />
                <PreviewRow time={plan.arrive} strong text={<>מגיעים <bdi>{withMi('ל', name)}</bdi></>} sub={`${hoursText(hours)} לטייל ולאכול`} />
                <PreviewRow time={plan.depart} text="ממשיכים" sub={travelText(plan.modeOut, plan.driveOut)} />
                <PreviewRow time={plan.reach} text={<>מגיעים <bdi>{withMi('ל', plan.to.name)}</bdi></>} sub="הלינה נשארת ביעד עם הלילה" last />
              </ol>
              <span className="pb-1 text-[11px] text-muted">
                הזמנים הם הערכה לפי מרחק{plan.modeIn === 'טיסה' || plan.modeOut === 'טיסה' ? '. בטיסה: זמן באוויר בלבד, בלי הדרך לשדה וההמתנה' : ''}.
              </span>
            </div>
          )}
          {clash && (
            <p role="alert" className="rounded-xl bg-accent-2/8 px-3 py-2 text-[13px] text-accent-2">
              ביום הזה כבר מתוכנן <bdi>{clash.name}</bdi> בשעות האלה ({timeRange(clash.start, clash.end)}). אפשר לבחור יום או שעה אחרים, או להזיז אותו בלו״ז.
            </p>
          )}
          {late && (
            <p role="alert" className="rounded-xl bg-accent-2/8 px-3 py-2 text-[13px] text-accent-2">
              הביקור מסתיים אחרי חצות. בחרו שעת יציאה מוקדמת יותר או פחות שעות.
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t border-border px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button type="button" disabled={late} onClick={() => onSave(draft)} className="h-[52px] flex-1 rounded-2xl bg-accent text-base font-semibold text-on-accent disabled:opacity-40">
            {isNew ? 'הוספת הביקור' : 'שמירת הביקור'}
          </button>
          {onRemove && (
            <button type="button" aria-label={`הסרת הביקור ב-${name}`} onClick={onRemove} className="flex size-[52px] items-center justify-center rounded-2xl border border-border-strong text-accent-2">
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

/** How to get between two places: each way that fits this route, with its time */
function ModePicker({ label, choices, value, onPick }: { label: React.ReactNode; choices: { mode: TransferMode; minutes: number }[]; value: TransferMode; onPick: (m: TransferMode) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-semibold text-muted">{label}</legend>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {choices.map((c) => (
          <button
            key={c.mode}
            type="button"
            aria-pressed={value === c.mode}
            onClick={() => onPick(c.mode)}
            className={cx(
              'flex h-[54px] min-w-[82px] shrink-0 flex-col items-center justify-center gap-px rounded-[14px] px-2',
              value === c.mode ? 'border-2 border-accent bg-accent/8 text-accent' : 'border border-border bg-surface',
            )}
          >
            <span className="flex items-center gap-1 text-[13px] font-semibold">
              <ModeIcon mode={c.mode} />
              {c.mode}
            </span>
            <span className="text-[11px] text-muted">{driveText(c.minutes)}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function PreviewRow({ time, text, sub, strong, last }: { time: number; text: React.ReactNode; sub: string; strong?: boolean; last?: boolean }) {
  return (
    <li className={cx('flex items-start gap-3 py-2', !last && 'border-b border-border')}>
      <b dir="ltr" className={cx('w-12 shrink-0 text-sm', strong && 'text-accent-2')}>
        {fromMin(time)}
      </b>
      <span className="flex min-w-0 flex-col gap-px">
        <span className={cx('text-sm font-semibold', strong && 'text-accent-2')}>{text}</span>
        <span className="text-xs text-muted">{sub}</span>
      </span>
    </li>
  )
}

type Editing = { visit: Visit; isNew: boolean; fromLeg?: number }

/**
 * Adding and editing visits on a route (the wizard and the edit screen share it). `apply` merges a change into
 * the brief being edited.
 */
export function useVisitEditor(brief: TripBrief, apply: (p: Partial<TripBrief>) => void, days?: Day[], canChangeRoute = true) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [picking, setPicking] = useState(false)
  const visits = brief.visits ?? []
  const plans = planVisits(brief)
  const close = () => setEditing(null)
  const save = (v: Visit) => {
    if (editing?.fromLeg !== undefined) apply(stayToVisit(brief, editing.fromLeg, v))
    else apply({ visits: [...visits.filter((x) => x.id !== v.id), v] })
    close()
  }
  const setHours = (v: Visit, hours: number) => apply({ visits: visits.map((x) => (x.id === v.id ? { ...x, hours } : x)) })
  const skip = [...brief.legs.map((l) => l.destination.id), ...visits.map((v) => v.destination.id)]

  const cardsAfter = (legId: string) =>
    plans
      .filter((p) => p.visit.afterId === legId)
      .map((p) => <VisitCard key={p.visit.id} plan={p} onHours={(h) => setHours(p.visit, h)} onOpen={() => setEditing({ visit: p.visit, isNew: false })} />)

  /** The last stay turned into a visit from its nights counter; not the first, which has nothing before it */
  const convertLeg = (i: number) => {
    const leg = brief.legs[i]
    if (i < 1 || !leg) return
    setEditing({ visit: { id: `visit-${Date.now().toString(36)}`, destination: leg.destination, afterId: brief.legs[i - 1].destination.id, hours: 4, leave: '09:30', modeIn: brief.transfers?.[i - 1] || undefined, modeOut: brief.transfers?.[i] || undefined }, isNew: true, fromLeg: i })
  }

  const adder = picking ? (
    <AddCity
      onPick={(d: Destination) => {
        setPicking(false)
        setEditing({ visit: newVisit(brief, d), isNew: true })
      }}
      onCancel={() => setPicking(false)}
      autoFocus
      skip={skip}
      placeholder="לאן קופצים לכמה שעות?"
    />
  ) : (
    <button
      type="button"
      disabled={!brief.legs.length}
      onClick={() => setPicking(true)}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-accent-2/70 bg-accent-2/6 text-[14px] font-semibold text-accent-2 disabled:opacity-40"
    >
      <Clock size={17} aria-hidden="true" />
      ביקור של כמה שעות, בלי לינה
    </button>
  )

  // While a stay is being converted the sheet plans it on the route without that stay
  const sheetBrief = editing?.fromLeg !== undefined ? { ...brief, ...stayToVisit(brief, editing.fromLeg, editing.visit) } : brief
  const sheet = editing ? (
    <VisitSheet
      key={editing.visit.id}
      brief={sheetBrief}
      initial={editing.visit}
      isNew={editing.isNew}
      days={days}
      onSave={save}
      onClose={close}
      onRemove={
        editing.fromLeg !== undefined
          ? () => {
              // At one night the minus opens this sheet, so removing the destination stays one tap away
              const p = stayToVisit(brief, editing.fromLeg!, editing.visit)
              apply({ ...p, visits: (p.visits ?? []).filter((x) => x.id !== editing.visit.id) })
              close()
            }
          : editing.isNew
            ? undefined
            : () => (apply({ visits: visits.filter((x) => x.id !== editing.visit.id) }), close())
      }
      onMakeStay={
        !canChangeRoute
          ? undefined
          : editing.fromLeg !== undefined
            ? close
            : editing.isNew
              ? () => (apply({ legs: [...brief.legs, { destination: editing.visit.destination, nights: 1 }] }), close())
              : () => (apply(visitToStay(brief, editing.visit)), close())
      }
    />
  ) : null

  return { cardsAfter, adder, sheet, convertLeg, openVisit: (v: Visit) => setEditing({ visit: v, isNew: false }) }
}

/** A visit inside the day's schedule: the drive, its stops, adding places and restaurants, and the drive onward */
export function DayVisit({ plan, day, onEdit }: { plan: VisitPlan; day: Day; onEdit: () => void }) {
  const stops = day.stops.filter((s) => s.visitId === plan.visit.id)
  const name = plan.visit.destination.name
  return (
    <section aria-label={`ביקור ב-${name}`} className="flex flex-col">
      <TravelLine mode={plan.modeIn} time={plan.leave} title={<>{MODE[plan.modeIn].word} <bdi>{withMi('ל', name)}</bdi></>} sub={<><bdi>{withMi('מ', plan.from.name)}</bdi> · {driveText(plan.driveIn)}</>} />
      <div className="flex flex-col gap-1.5 rounded-[20px] border-[1.5px] border-accent-2/60 bg-accent-2/6 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-col gap-px">
            <span className="text-xs font-semibold text-accent-2">ביקור בלי לינה</span>
            <bdi className="truncate text-[19px] font-bold">{name}</bdi>
          </span>
          <button type="button" onClick={onEdit} aria-label={`עריכת הביקור ב-${name}`} className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-surface px-2.5 text-[13px] font-semibold text-accent-2">
            <Clock size={14} aria-hidden="true" />
            {timeRange(fromMin(plan.arrive), fromMin(plan.depart))}
          </button>
        </div>
        {stops.length > 0 ? (
          <ol className="rounded-[14px] bg-surface px-2.5">
            {stops.map((s, i) => (
              <li key={s.id} className={cx(i < stops.length - 1 && 'border-b border-border')}>
                <a href={href(`/place/${s.id}`)} className="flex items-start gap-3 py-2.5">
                  <b dir="ltr" className="w-11 shrink-0 text-sm">
                    {s.start}
                  </b>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <bdi className="truncate text-[15px] font-semibold">{s.name}</bdi>
                    <span className="truncate text-xs text-muted">{timeRange(s.start, s.end)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-[14px] bg-surface px-3 py-2.5 text-[13px] text-muted">עוד אין כאן עצירות. הוסיפו מקומות או מסעדה לביקור.</p>
        )}
        <div className="flex gap-1.5 pt-0.5">
          <a href={href(`/add/${day.id}/${plan.visit.id}`)} className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent-2 px-2 text-[13px] font-semibold text-on-accent-2">
            <Plus size={15} className="shrink-0" aria-hidden="true" />
            <span className="truncate">
              מקומות <bdi>{withMi('ב', name)}</bdi>
            </span>
          </a>
          <a href={href(`/eat/${day.id}/lunch/${plan.visit.id}`)} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-accent-2/60 bg-surface px-3 text-[13px] font-semibold text-accent-2">
            <UtensilsCrossed size={14} aria-hidden="true" />
            מסעדות
          </a>
        </div>
      </div>
      <TravelLine mode={plan.modeOut} time={plan.depart} title={<>{MODE[plan.modeOut].word} <bdi>{withMi('ל', plan.to.name)}</bdi></>} sub={driveText(plan.driveOut)} />
    </section>
  )
}

function TravelLine({ mode, time, title, sub }: { mode: TransferMode; time: number; title: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-0.5 py-2">
      <b dir="ltr" className="w-11 shrink-0 text-sm">
        {fromMin(time)}
      </b>
      <ModeIcon mode={mode} className="shrink-0 text-accent" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-accent">{title}</span>
        <span className="truncate text-xs text-muted">{sub}</span>
      </span>
    </div>
  )
}
