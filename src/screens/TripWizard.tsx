import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, ExternalLink, Minus, Plus, Search, Sparkles, X } from 'lucide-react'
import { DestinationPicker } from '../components/PlanSections'
import { IconButton, cx } from '../components/ui'
import { DESTINATIONS } from '../data/destinations'
import {
  INTERCITY_TRANSPORT,
  INTERESTS,
  LOCAL_TRANSPORT,
  PACE_HINT,
  PACE_LABEL,
  TIER_HINT,
  TIER_LABEL,
  addDays,
  briefMessage,
  emptyBrief,
  endDateOf,
  estimate,
  legDates,
  legsWithNights,
  lodgingLinks,
  money,
  roomsText,
  skeletonOps,
  summaryChips,
  totalNights,
  travelers,
} from '../data/brief'
import { MAX_TRIP_DAYS, isoInDays, shortDate, tripLength } from '../data/helpers'
import type { Destination, TripBrief } from '../data/types'
import { useTrip } from '../state/TripStore'
import { navigate } from '../router'

/**
 * New trip, five steps: where, who, when, how, how much. The answers become a brief that either goes to the
 * assistant (which proposes the whole trip for approval in the chat) or creates an empty trip with the route and dates.
 */

export const WIZARD_KEY = 'trip-planner:wizard'
export const CHAT_SEED_KEY = 'trip-planner:chat-seed'

const STEPS = ['לאן', 'מי', 'מתי', 'איך', 'כמה']

interface Draft {
  brief: TripBrief
  step: number
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(WIZARD_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Draft
      if (d?.brief && typeof d.step === 'number') return { brief: { ...emptyBrief(), ...d.brief }, step: Math.min(Math.max(d.step, 0), 4) }
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
  const brief = destination ? { ...d.brief, legs: [{ destination, nights: 3 }], multi: false } : d.brief
  saveDraft({ brief, step: destination ? 1 : d.step })
  navigate('/new')
}

const card = 'rounded-card border border-border bg-surface p-4'
const field =
  'h-11 w-full min-w-0 rounded-tile border border-border bg-raised px-3 text-[15px] text-text outline-none placeholder:text-muted focus:border-accent'

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
  const multi = brief.multi && brief.legs.length > 1
  const days = brief.start && end ? tripLength(brief.start, end) : 0
  const datesOk = !!brief.start && brief.start >= today && days > 0 && days <= MAX_TRIP_DAYS
  const ready = [brief.legs.length > 0, true, datesOk, true, true][step]
  const chips = summaryChips(brief, step)

  const back = () => (step === 0 ? navigate('/') : go(step - 1))

  /** Creates the trip: with the assistant (it proposes the plan in the chat) or just the route and dates */
  const finish = (withAssistant: boolean) => {
    dispatch({ type: 'createTrip', id: `trip-${Date.now().toString(36)}` })
    dispatch({ type: 'setBrief', brief })
    if (withAssistant) {
      try {
        sessionStorage.setItem(CHAT_SEED_KEY, briefMessage(brief))
      } catch {
        /* ignore */
      }
      clearDraft()
      navigate('/chat')
    } else {
      dispatch({ type: 'applyPlan', ops: skeletonOps(brief), newTripId: '' })
      clearDraft()
      navigate('/trip')
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-[110px]">
      <header className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex items-center gap-3">
          <IconButton label={step === 0 ? 'חזרה למסך הבית' : 'לשלב הקודם'} onClick={back}>
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <span className="flex-1 text-[17px] font-semibold">תכנון טיול</span>
        </div>
        <ol className="flex gap-2" aria-label="שלבי התכנון">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined} className="flex flex-1 flex-col gap-1.5">
              <span className={cx('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-border-strong')} />
              <span className={cx('text-xs', i === step ? 'font-semibold text-text' : i < step ? 'text-accent' : 'text-muted')}>
                {label}
                {i < step && <span className="sr-only"> (הושלם)</span>}
                {i < step && ' ✓'}
              </span>
            </li>
          ))}
        </ol>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-[13px]">
                {c}
              </span>
            ))}
          </div>
        )}
      </header>

      <main className="flex flex-col gap-4 px-4 pt-5">
        {step === 0 && <WhereStep brief={brief} patch={patch} />}
        {step === 1 && <WhoStep brief={brief} patch={patch} />}
        {step === 2 && <WhenStep brief={brief} patch={patch} multi={multi} end={end} days={days} datesOk={datesOk} today={today} />}
        {step === 3 && <HowStep brief={brief} patch={patch} />}
        {step === 4 && <BudgetStep brief={brief} patch={patch} />}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[560px] flex-col gap-2 border-t border-border bg-bg px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {step === 4 ? (
          <>
            <button type="button" onClick={() => finish(true)} className="flex h-[52px] items-center justify-center gap-2 rounded-tile bg-accent text-[16px] font-semibold text-on-accent">
              <Sparkles size={18} aria-hidden="true" />
              בנו את הטיול
            </button>
            <button type="button" onClick={() => finish(false)} className="h-11 rounded-tile border border-border-strong bg-surface text-[14px] font-medium">
              יצירת טיול ריק עם היעדים והתאריכים
            </button>
          </>
        ) : (
          <div className="flex gap-3">
            {step > 0 && (
              <IconButton label="לשלב הקודם" onClick={back} className="!size-[52px]">
                <ChevronRight size={22} aria-hidden="true" />
              </IconButton>
            )}
            <button
              type="button"
              disabled={!ready}
              onClick={() => go(step + 1)}
              className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-tile bg-accent text-[16px] font-semibold text-on-accent transition-opacity duration-200 ease-out disabled:opacity-40"
            >
              {step === 0 && !ready ? 'בחרו יעד כדי להמשיך' : step === 2 && !datesOk ? 'בדקו את התאריכים' : 'המשך'}
              {ready && <ArrowLeft size={20} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

type StepProps = { brief: TripBrief; patch: (p: Partial<TripBrief>) => void }

function Title({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[26px] leading-tight font-bold">{title}</h1>
      {sub && <p className="text-[14px] leading-relaxed text-muted">{sub}</p>}
    </div>
  )
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const btn = 'flex size-11 items-center justify-center rounded-full border-[1.5px] border-border-strong bg-surface transition-opacity duration-200 ease-out disabled:opacity-35'
  return (
    <div className="flex items-center gap-2.5" role="group" aria-label={label}>
      <button type="button" aria-label={`הוספה: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>
        <Plus size={18} aria-hidden="true" />
      </button>
      <span className="min-w-7 text-center text-xl font-bold" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label={`הפחתה: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>
        <Minus size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (v: boolean) => void; title: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cx(card, 'flex w-full items-center gap-3 text-start')}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-semibold">{title}</span>
        {hint && <span className="text-[13px] leading-relaxed text-muted">{hint}</span>}
      </span>
      <span className={cx('relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors duration-200 ease-out', on ? 'bg-accent' : 'bg-border-strong')} aria-hidden="true">
        <span className={cx('absolute top-[3px] size-6 rounded-full bg-white transition-all duration-200 ease-out', on ? 'start-[25px]' : 'start-[3px]')} />
      </span>
    </button>
  )
}

function Chip({ on, onClick, children, small }: { on?: boolean; onClick?: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-4 font-medium transition-colors duration-200 ease-out',
        small ? 'h-9 text-[13px]' : 'h-10 text-[14px]',
        on ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border-strong bg-surface hover:border-accent',
      )}
    >
      {children}
    </button>
  )
}

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/* ---------- 1. where ---------- */

function WhereStep({ brief, patch }: StepProps) {
  const first = brief.legs[0]?.destination
  const [changing, setChanging] = useState(!first)
  const [adding, setAdding] = useState(false)
  const nightsDefault = 3
  // Quick picks: the other built-in places in the same country as the first destination
  const inCountry = useMemo(
    () => (first ? DESTINATIONS.filter((d) => d.kind !== 'country' && d.country === first.country && !brief.legs.some((l) => l.destination.id === d.id)) : []),
    [first, brief.legs],
  )

  const pickFirst = (d: Destination) => {
    patch({ legs: [{ destination: d, nights: brief.legs[0]?.nights || nightsDefault }, ...brief.legs.slice(1)] })
    setChanging(false)
  }
  const addLeg = (d: Destination) => {
    const only = brief.legs[0]?.destination
    // A place inside the whole country picked first replaces that country: the route is made of its cities
    const replaces = brief.legs.length === 1 && only?.kind === 'country' && d.kind !== 'country' && d.country === only.country
    patch({ legs: replaces ? [{ destination: d, nights: brief.legs[0].nights || nightsDefault }] : [...brief.legs, { destination: d, nights: nightsDefault }] })
    setAdding(false)
  }
  const setNights = (i: number, n: number) => patch({ legs: brief.legs.map((l, k) => (k === i ? { ...l, nights: n } : l)) })
  const removeLeg = (i: number) => patch({ legs: brief.legs.filter((_, k) => k !== i) })
  const move = (i: number, d: -1 | 1) => {
    const legs = [...brief.legs]
    ;[legs[i], legs[i + d]] = [legs[i + d], legs[i]]
    patch({ legs })
  }

  return (
    <>
      <Title title="לאן טסים?" sub="בוחרים עיר, אזור או מדינה. כדי לעבור בין כמה יעדים ברצף, מפעילים ״יש לי מסלול״." />

      {changing || !first ? (
        <DestinationPicker value={first ?? null} onChange={pickFirst} />
      ) : (
        <>
          <div className={cx(card, 'flex items-center gap-3 border-2 border-accent bg-accent/8')}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] text-muted">לאן</span>
              <span className="truncate text-[18px] font-semibold">{brief.multi && brief.legs.length > 1 ? brief.legs.map((l) => l.destination.name).join(' · ') : first.name}</span>
            </span>
            {first.kind === 'country' && !(brief.multi && brief.legs.length > 1) && <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-semibold text-accent">כל המדינה</span>}
            <button type="button" onClick={() => setChanging(true)} className="h-9 rounded-full border border-border-strong bg-surface px-3.5 text-[13px] font-medium">
              שינוי
            </button>
          </div>

          <Toggle
            on={brief.multi}
            onChange={(multi) => patch({ multi, legs: multi && brief.legs.length === 1 && brief.legs[0].nights === 0 ? [{ ...brief.legs[0], nights: nightsDefault }] : brief.legs })}
            title="יש לי מסלול"
            hint="הכניסו יעדים לפי הסדר וכמה לילות בכל אחד"
          />

          {brief.multi && (
            <section className="flex flex-col gap-3" aria-label="המסלול">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[16px] font-semibold">המסלול שלכם</h2>
                <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  {totalNights(brief)} לילות · {brief.legs.length} יעדים
                </span>
              </div>
              <ol className="flex flex-col gap-2">
                {brief.legs.map((leg, i) => (
                  <li key={`${leg.destination.id}-${i}`} className="flex items-center gap-2.5 rounded-card border border-border bg-surface py-2.5 ps-3 pe-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-semibold text-on-accent">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[16px] font-semibold">{leg.destination.name}</span>
                      <span className="truncate text-[12px] text-muted">{leg.destination.kind === 'country' ? 'כל המדינה' : leg.destination.country}</span>
                    </span>
                    <div className="flex flex-col">
                      <button type="button" aria-label="הזזה למעלה" disabled={i === 0} onClick={() => move(i, -1)} className="flex h-6 w-7 items-center justify-center text-muted disabled:opacity-30">
                        <ChevronUp size={16} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label="הזזה למטה" disabled={i === brief.legs.length - 1} onClick={() => move(i, 1)} className="flex h-5 items-center justify-center text-muted disabled:opacity-30">
                        <ChevronDown size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <Stepper value={leg.nights} min={1} max={30} label={`לילות ב${leg.destination.name}`} onChange={(n) => setNights(i, n)} />
                    <button type="button" aria-label={`הסרת ${leg.destination.name}`} disabled={brief.legs.length === 1} onClick={() => removeLeg(i)} className="flex size-9 items-center justify-center rounded-tile text-muted hover:text-accent-2 disabled:opacity-30">
                      <X size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>

              {adding ? (
                <div className={cx(card, 'flex flex-col gap-3')}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold">הוספת עיר, עיירה, כפר, מחוז או מדינה</h3>
                    <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-full px-3 text-[13px] text-muted">
                      ביטול
                    </button>
                  </div>
                  {inCountry.length > 0 && (
                    <div className="flex flex-wrap gap-2" role="group" aria-label={`מקומות ב${first?.country ?? ''}`}>
                      {inCountry.map((d) => (
                        <Chip key={d.id} onClick={() => addLeg(d)} small>
                          {d.name}
                        </Chip>
                      ))}
                    </div>
                  )}
                  <DestinationPicker value={null} onChange={addLeg} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-11 items-center justify-center gap-2 rounded-tile border border-dashed border-accent/60 text-[15px] font-medium text-accent hover:bg-accent/8"
                >
                  <Plus size={18} aria-hidden="true" />
                  הוספת יעד
                </button>
              )}
              {brief.legs.length > 1 && totalNights(brief) + 1 > MAX_TRIP_DAYS && (
                <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
                  אפשר לתכנן עד {MAX_TRIP_DAYS} ימים בטיול אחד. הפחיתו כמה לילות.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}

/* ---------- 2. who ---------- */

const AGE_BANDS = [
  { age: 1, label: 'עד 2' },
  { age: 4, label: '3–5' },
  { age: 7, label: '6–8' },
  { age: 10, label: '9–12' },
]

function WhoStep({ brief, patch }: StepProps) {
  const setKids = (n: number) => patch({ children: Array.from({ length: n }, (_, i) => brief.children[i] ?? 7) })
  return (
    <>
      <Title title="מי נוסע?" sub="זה מה שקובע חדרים, קצב, ומה נכנס ליום." />
      <div className={cx(card, 'flex flex-col gap-4')}>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-col">
            <span className="text-[18px] font-semibold">מבוגרים</span>
            <span className="text-[13px] text-muted">בני 12 ומעלה</span>
          </div>
          <Stepper value={brief.adults} min={1} max={12} label="מבוגרים" onChange={(adults) => patch({ adults })} />
        </div>
        <hr className="border-border" />
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-col">
            <span className="text-[18px] font-semibold">ילדים</span>
            <span className="text-[13px] text-muted">עד גיל 12</span>
          </div>
          <Stepper value={brief.children.length} min={0} max={8} label="ילדים" onChange={setKids} />
        </div>
        <hr className="border-border" />
        <div className="flex items-center gap-3">
          <span className="flex-1 text-[18px] font-semibold">חדרים</span>
          <Stepper value={brief.rooms} min={1} max={8} label="חדרים" onChange={(rooms) => patch({ rooms })} />
        </div>
      </div>

      {brief.children.map((age, i) => (
        <div key={i} className={cx(card, 'flex flex-col gap-3')} role="group" aria-label={`גיל ילד ${i + 1}`}>
          <span className="text-[15px] font-semibold">{brief.children.length > 1 ? `בן כמה ילד ${i + 1}?` : 'בן כמה הילד?'}</span>
          <div className="flex flex-wrap gap-2">
            {AGE_BANDS.map((b) => (
              <Chip key={b.age} on={age === b.age} onClick={() => patch({ children: brief.children.map((a, k) => (k === i ? b.age : a)) })}>
                {b.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {brief.children.length > 0 && <p className="text-[13px] leading-relaxed text-muted">הגיל משפיע על מחירי כרטיסים, על מה כדאי לתכנן ליום, ועל סוג החדר.</p>}
      {travelers(brief) / brief.rooms > 4 && (
        <p className="rounded-card border border-accent-2/40 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">יותר מארבעה נוסעים בחדר? כדאי להוסיף חדר.</p>
      )}
    </>
  )
}

/* ---------- 3. when ---------- */

function WhenStep({
  brief,
  patch,
  multi,
  end,
  days,
  datesOk,
  today,
}: StepProps & { multi: boolean; end: string; days: number; datesOk: boolean; today: string }) {
  const month = brief.start.slice(0, 7)
  const setMonth = (m: string) => {
    if (!m) return
    const first = `${m}-01`
    const start = first < today ? addDays(today, 1) : first
    patch({ start, end: addDays(start, Math.max(1, totalNights(brief) || 4)) })
  }
  return (
    <>
      <Title title="מתי?" sub="יש תאריכים? בוחרים אותם. אין? בוחרים חודש, ונתחיל מהתחלה שלו." />
      <div className="flex gap-1 rounded-tile bg-raised p-1" role="tablist" aria-label="סוג תאריכים">
        {[
          { id: false, label: 'תאריכים מדויקים' },
          { id: true, label: 'עוד לא, רק חודש' },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="tab"
            aria-selected={brief.monthOnly === o.id}
            onClick={() => patch({ monthOnly: o.id })}
            className={cx(
              'h-11 flex-1 rounded-[11px] text-[14px] font-medium transition-colors duration-200 ease-out',
              brief.monthOnly === o.id ? 'bg-surface font-semibold text-accent shadow-sm' : 'text-muted',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {brief.monthOnly ? (
        <div className={cx(card, 'flex flex-col gap-2')}>
          <label htmlFor="wiz-month" className="text-[13px] text-muted">
            באיזה חודש?
          </label>
          <input id="wiz-month" type="month" min={today.slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} className={field} />
          {brief.start && <p className="text-[13px] text-muted">נתחיל ב-{shortDate(brief.start)}. אפשר לשנות לתאריך מדויק בכל רגע.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className={cx(card, 'flex flex-col gap-1.5 p-3')}>
            <label htmlFor="wiz-start" className="text-[13px] text-muted">
              יציאה
            </label>
            <input
              id="wiz-start"
              type="date"
              min={today}
              value={brief.start}
              onChange={(e) => e.target.value && patch({ start: e.target.value, end: brief.end && brief.end >= e.target.value ? brief.end : addDays(e.target.value, 4) })}
              className={field}
            />
          </div>
          <div className={cx(card, 'flex flex-col gap-1.5 p-3')}>
            <label htmlFor="wiz-end" className="text-[13px] text-muted">
              חזרה
            </label>
            <input
              id="wiz-end"
              type="date"
              min={brief.start || today}
              disabled={multi}
              value={end}
              onChange={(e) => e.target.value && patch({ end: e.target.value })}
              className={cx(field, 'disabled:opacity-60')}
            />
          </div>
        </div>
      )}

      {multi && <p className="text-[13px] text-muted">{totalNights(brief)} לילות, כמו במסלול שבחרתם. התאריך האחרון נקבע לפיהם.</p>}
      {!multi && datesOk && <p className="text-[13px] text-muted">{days - 1} לילות · {days} ימים</p>}
      {brief.start && days > MAX_TRIP_DAYS && (
        <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
          אפשר לתכנן עד {MAX_TRIP_DAYS} ימים בטיול אחד.
        </p>
      )}
      {brief.start && brief.start < today && (
        <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
          תאריך היציאה כבר עבר.
        </p>
      )}

      <Toggle on={brief.flightsBooked} onChange={(flightsBooked) => patch({ flightsBooked })} title="כבר הזמנתי טיסות" hint="נקבע את התאריכים לפיהן" />
      <p className="text-[13px] leading-relaxed text-muted">
        מחירי טיסות לפי יום עדיין לא מוצגים: הם דורשים ספק נתוני טיסות. בשלב התקציב אפשר להזין מחיר טיסה לאדם, והוא ייכלל בסכום.
      </p>
    </>
  )
}

/* ---------- 4. how ---------- */

function HowStep({ brief, patch }: StepProps) {
  const [draft, setDraft] = useState('')
  const addMust = () => {
    const v = draft.trim()
    if (v && !brief.mustSee.includes(v)) patch({ mustSee: [...brief.mustSee, v] })
    setDraft('')
  }
  const multi = brief.multi && brief.legs.length > 1
  return (
    <>
      <Title title="איך נראה יום טוב?" sub="בכל יום יש אותו מספר אטרקציות ומסעדות. הקצב קובע איזה סוג." />

      <div role="radiogroup" aria-label="קצב" className="flex flex-col gap-2.5">
        {(['relaxed', 'balanced', 'packed'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={brief.pace === p}
            onClick={() => patch({ pace: p })}
            className={cx(card, 'flex items-center gap-3 text-start transition-colors duration-200 ease-out', brief.pace === p && 'border-2 border-accent bg-accent/8')}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[17px] font-semibold">{PACE_LABEL[p]}</span>
              <span className="text-[13px] leading-relaxed text-muted">{PACE_HINT[p]}</span>
            </span>
            <span className={cx('size-6 shrink-0 rounded-full border-2', brief.pace === p ? 'border-[7px] border-accent' : 'border-border-strong')} aria-hidden="true" />
          </button>
        ))}
      </div>

      <Toggle on={brief.kosher} onChange={(kosher) => patch({ kosher })} title="מסעדות כשרות" hint="נשבץ מסעדה כשרה בכל ארוחה. איפה שאין, צמחוני או טבעוני." />

      <section className="flex flex-col gap-2.5" aria-labelledby="must-title">
        <div className="flex items-center justify-between">
          <h2 id="must-title" className="text-[16px] font-semibold">
            מקומות שחייבים לבקר בהם
          </h2>
          <span className="text-[13px] text-muted">לא חובה</span>
        </div>
        <p className="text-[13px] leading-relaxed text-muted">כל מה שאתם לא מוכנים לפספס: אטרקציה, מסעדה, פעילות או הופעה. נשבץ אותם בימים הנכונים.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addMust()
          }}
        >
          <label className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 text-muted focus-within:border-accent">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">מקום שחייבים לבקר בו</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="אטרקציה, מסעדה או הופעה" className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted" />
          </label>
          <button type="submit" disabled={!draft.trim()} aria-label="הוספה לרשימה" className="flex size-[52px] items-center justify-center rounded-2xl bg-accent text-on-accent disabled:opacity-40">
            <Plus size={20} aria-hidden="true" />
          </button>
        </form>
        {brief.mustSee.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {brief.mustSee.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patch({ mustSee: brief.mustSee.filter((x) => x !== m) })}
                aria-label={`הסרת ${m}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-accent bg-accent px-4 text-[14px] font-semibold text-on-accent"
              >
                {m}
                <X size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>

      <ChipGroup title="מה מעניין אתכם" items={INTERESTS} chosen={brief.interests} onToggle={(v) => patch({ interests: toggleIn(brief.interests, v) })} />
      <ChipGroup title="איך מתניידים בתוך הערים" items={LOCAL_TRANSPORT} chosen={brief.localTransport} onToggle={(v) => patch({ localTransport: toggleIn(brief.localTransport, v) })} />
      {multi && (
        <ChipGroup
          title="איך עוברים בין הערים"
          items={INTERCITY_TRANSPORT}
          chosen={brief.intercity}
          onToggle={(v) => patch({ intercity: toggleIn(brief.intercity, v) })}
          note="לכל מעבר נציג זמן ומחיר משוער, ואפשר להחליף אותו בכל רגע."
        />
      )}
    </>
  )
}

function ChipGroup({ title, items, chosen, onToggle, note }: { title: string; items: string[]; chosen: string[]; onToggle: (v: string) => void; note?: string }) {
  return (
    <section className="flex flex-col gap-2.5" role="group" aria-label={title}>
      <h2 className="text-[13px] font-medium text-muted">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <Chip key={i} on={chosen.includes(i)} onClick={() => onToggle(i)}>
            {i}
          </Chip>
        ))}
      </div>
      {note && <p className="text-[13px] leading-relaxed text-muted">{note}</p>}
    </section>
  )
}

/* ---------- 5. how much ---------- */

function BudgetStep({ brief, patch }: StepProps) {
  const tiers = (['budget', 'comfort', 'premium'] as const).map((t) => ({ id: t, est: estimate(brief, t) }))
  const chosen = brief.tier === 'custom' ? 'comfort' : brief.tier
  const est = estimate(brief, chosen)
  const people = travelers(brief)
  const legs = legDates(brief)
  const [city, setCity] = useState(0)
  const current = legs[Math.min(city, legs.length - 1)]
  const links = current ? lodgingLinks(brief, current.leg.destination.name, current.checkIn, current.checkOut) : []
  const nights = legsWithNights(brief).reduce((n, l) => n + l.nights, 0)

  return (
    <>
      <Title title="כמה תרצו להוציא?" sub={`סכום כולל לכל ${people} הנוסעים. נבנה טיול שמתאים לו, ונכוון לסגור קצת מתחתיו.`} />

      <p className="rounded-card border border-accent-2/40 bg-accent-2/6 px-3.5 py-3 text-[13px] leading-relaxed text-[#7A3A06]">
        הסכומים הם הערכה כללית לפי רמת מחירים של המדינה, לא מחירי מלונות וטיסות בזמן אמת. כך הם גם נשלחים לעוזר.
      </p>

      <div role="radiogroup" aria-label="רמת תקציב" className="flex flex-col gap-2.5">
        {tiers.map(({ id, est: e }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={brief.tier === id}
            onClick={() => patch({ tier: id })}
            className={cx(card, 'flex items-center gap-3 text-start transition-colors duration-200 ease-out', brief.tier === id && 'border-2 border-accent bg-accent/8')}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[17px] font-semibold">{TIER_LABEL[id]}</span>
              <span className="text-[13px] text-muted">{TIER_HINT[id]}</span>
            </span>
            <span className="text-[16px] font-semibold">בערך {money(e.total)}</span>
            <span className={cx('size-6 shrink-0 rounded-full border-2', brief.tier === id ? 'border-[7px] border-accent' : 'border-border-strong')} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className={cx(card, 'grid grid-cols-2 gap-3')}>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          תקציב משלכם (₪)
          <input
            inputMode="numeric"
            value={brief.customBudget ?? ''}
            placeholder="לא חובה"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ''))
              patch(n > 0 ? { customBudget: n, tier: 'custom' } : { customBudget: undefined, tier: chosen })
            }}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          טיסה לאדם (₪)
          <input
            inputMode="numeric"
            value={brief.flightPerPerson ?? ''}
            placeholder="אם ידוע"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ''))
              patch({ flightPerPerson: n > 0 ? n : undefined })
            }}
            className={field}
          />
        </label>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="incl-title">
        <div className="flex items-center justify-between">
          <h2 id="incl-title" className="text-[16px] font-semibold">
            הכל כלול בסכום
          </h2>
          <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-semibold text-accent">{TIER_LABEL[chosen]}</span>
        </div>
        <dl className={cx(card, 'flex flex-col gap-3.5')}>
          <Line title="לינה" detail={`${nights} לילות · ${roomsText(brief.rooms)} · כ-${money(est.nightly)} ללילה לחדר`} value={est.lodging} />
          <Line title="אוכל" detail={`${nights + 1} ימים · ${people} נוסעים`} value={est.food} />
          {est.intercity > 0 && <Line title="מעברים בין היעדים" detail={`${legs.length - 1} מעברים · ${people} נוסעים`} value={est.intercity} />}
          <Line title="אטרקציות וכרטיסים" detail="לפי המקומות בתוכנית" value={est.attractions} />
          {est.flights > 0 ? <Line title="טיסות" detail={`${money(brief.flightPerPerson ?? 0)} לאדם · ${people} נוסעים`} value={est.flights} /> : <Line title="טיסות" detail="לא כלולות. אפשר להזין מחיר טיסה לאדם למעלה." />}
          <hr className="border-border" />
          <div className="flex items-center gap-3">
            <dt className="flex-1 text-[17px] font-semibold">סה״כ משוער</dt>
            <dd className="text-xl font-bold text-accent">{brief.tier === 'custom' && brief.customBudget ? money(brief.customBudget) : money(est.total)}</dd>
          </div>
        </dl>
      </section>

      {current && (
        <section className="flex flex-col gap-3" aria-labelledby="lodge-title">
          <div className="flex flex-col gap-1">
            <h2 id="lodge-title" className="text-[16px] font-semibold">
              יחידות לינה
            </h2>
            <p className="text-[13px] leading-relaxed text-muted">פותחים את האתר עם היעד, התאריכים והנוסעים שבחרתם כבר מוזנים. המחירים והזמינות בזמן אמת באתר עצמו, וההזמנה נעשית שם.</p>
          </div>
          {legs.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="עיר">
              {legs.map((l, i) => (
                <Chip key={`${l.leg.destination.id}-${i}`} on={i === Math.min(city, legs.length - 1)} onClick={() => setCity(i)}>
                  {l.leg.destination.name} · {l.leg.nights} לילות
                </Chip>
              ))}
            </div>
          )}
          <div className={cx(card, 'flex flex-col gap-3')}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[16px] font-semibold">לינה ב{current.leg.destination.name}</span>
              <span className="text-[13px] text-muted">
                {current.checkIn ? `${shortDate(current.checkIn)} – ${shortDate(current.checkOut)} · ` : ''}
                {current.leg.nights} לילות · {brief.adults + brief.children.length} נוסעים · {roomsText(brief.rooms)}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center justify-between rounded-tile border border-border-strong bg-surface px-4 text-[15px] font-medium hover:border-accent"
                >
                  {l.label}
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        אחרי ״בנו את הטיול״ העוזר מציג הצעה מלאה, והיא נשמרת רק אחרי אישור שלכם.
      </p>
    </>
  )
}

function Line({ title, detail, value }: { title: string; detail: string; value?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <dt className="text-[15px] font-semibold">{title}</dt>
        <dd className="text-[13px] text-muted">{detail}</dd>
      </div>
      {value !== undefined && <span className="font-semibold">{money(value)}</span>}
    </div>
  )
}
