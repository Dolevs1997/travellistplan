import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  BedDouble,
  Check,
  ExternalLink,
  Flag,
  Globe,
  Landmark,
  MapPin,
  Music,
  Plus,
  Search,
  Ship,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trees,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Activity, ActivityKind, Destination, Lodging, SavedRestaurant } from '../data/types'
import { DESTINATIONS, REGION_LABEL, type Region } from '../data/destinations'
import { MAX_TRIP_DAYS, shortDate, tripLength } from '../data/helpers'
import { searchCities, type CityHit } from '../data/citySearch'
import { cx } from './ui'

/* ---------- shared bits ---------- */

/** "14.12 – 18.12" isolated as LTR so it doesn't flip inside Hebrew text */
const dateRange = (a: string, b: string) => `⁦${shortDate(a)} – ${shortDate(b)}⁩`

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const mapsSearch = (name: string, city: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`

const inputCls =
  'h-11 w-full min-w-0 rounded-tile border border-border bg-raised px-3 text-[15px] text-text [color-scheme:dark] outline-none placeholder:text-muted focus:border-accent'

function Field({ label, children, className }: { label: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

export function Section({
  icon: Icon,
  title,
  hint,
  count,
  children,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-phone border border-border bg-surface p-4">
      <header className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-water text-accent" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-lg font-semibold">
            {title}
            {!!count && <span className="ms-2 text-[13px] font-medium text-muted">({count})</span>}
          </h2>
          {hint && <p className="text-[13px] text-muted">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function ItemRow({
  title,
  meta,
  href,
  onRemove,
  icon: Icon,
}: {
  title: string
  meta?: string
  href: string
  onRemove: () => void
  icon: LucideIcon
}) {
  return (
    <li className="flex items-center gap-2 rounded-card border border-border bg-raised py-1.5 ps-3 pe-1.5">
      <Icon size={18} className="shrink-0 text-accent" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <span className="truncate text-[15px] font-semibold" dir="auto">
          {title}
        </span>
        {meta && <span className="truncate text-[13px] text-muted">{meta}</span>}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`פתיחת ${title} בגוגל מפות`}
        className="flex size-11 shrink-0 items-center justify-center rounded-tile text-muted hover:text-text"
      >
        <ExternalLink size={18} aria-hidden="true" />
      </a>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`הסרת ${title}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-tile text-muted hover:text-accent-2"
      >
        <Trash2 size={18} aria-hidden="true" />
      </button>
    </li>
  )
}

/** "+ add" button that opens an inline form */
function AddToggle({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cx(
        'flex h-11 items-center justify-center gap-2 rounded-tile border border-dashed text-[15px] font-medium transition-colors duration-200 ease-out',
        open ? 'border-border-strong text-muted' : 'border-accent/60 text-accent hover:bg-accent/8',
      )}
    >
      {open ? 'ביטול' : (
        <>
          <Plus size={18} aria-hidden="true" />
          {label}
        </>
      )}
    </button>
  )
}

function SaveButton({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-11 rounded-tile bg-accent text-[15px] font-semibold text-on-accent transition-opacity duration-200 ease-out disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export interface DayOption {
  id: string
  label: string
}

function DaySelect({ id, days, value, onChange }: { id: string; days: DayOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">בלי יום מסוים</option>
      {days.map((d) => (
        <option key={d.id} value={d.id}>
          {d.label}
        </option>
      ))}
    </select>
  )
}

/* ---------- destination ---------- */

const REGIONS: ('all' | Region)[] = ['all', 'areas', 'europe', 'mediterranean', 'asia', 'americas', 'africa-me']

type WorldState = { status: 'idle' | 'loading' | 'done' | 'error'; hits: CityHit[] }

/** Debounced world-wide search for the typed text (2+ characters). */
function useWorldSearch(term: string): WorldState {
  const [state, setState] = useState<WorldState>({ status: 'idle', hits: [] })
  useEffect(() => {
    if (term.length < 2) {
      setState({ status: 'idle', hits: [] })
      return
    }
    const ctrl = new AbortController()
    setState((s) => ({ status: 'loading', hits: s.hits }))
    const t = window.setTimeout(() => {
      searchCities(term, ctrl.signal)
        .then((hits) => setState({ status: 'done', hits }))
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setState({ status: 'error', hits: [] })
        })
    }, 300)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [term])
  return state
}

export function DestinationPicker({ value, onChange }: { value: Destination | null; onChange: (d: Destination) => void }) {
  const [q, setQ] = useState('')
  const [region, setRegion] = useState<'all' | Region>('all')
  const term = q.trim()

  const list = useMemo(
    () =>
      DESTINATIONS.filter(
        (d) => (region === 'all' || d.region === region) && (!term || d.name.includes(term) || d.country.includes(term)),
      ),
    [term, region],
  )
  const world = useWorldSearch(term)
  // Don't repeat cities already shown in the popular grid
  const worldHits = world.hits.filter((h) => !list.some((d) => d.name === h.name && d.country === h.country))

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-[52px] items-center gap-2.5 rounded-2xl border border-border bg-raised px-4 text-muted focus-within:border-accent">
        <Search size={20} aria-hidden="true" />
        <span className="sr-only">חיפוש יעד</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חפשו כל עיר בעולם"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
        />
      </label>

      <div role="group" aria-label="אזור" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={region === r}
            onClick={() => setRegion(r)}
            className={cx(
              'h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors duration-200 ease-out',
              region === r ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-raised font-medium text-muted',
            )}
          >
            {r === 'all' ? 'הכל' : REGION_LABEL[r]}
          </button>
        ))}
      </div>

      {term.length >= 2 && (
        // Shown after the popular matches (DOM order kept for the live status region)
        <div className="order-last flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-muted">מכל העולם</h3>
          <div role="status" aria-live="polite" className="text-[13px] text-muted">
            {world.status === 'loading' && worldHits.length === 0 && 'מחפשים…'}
            {world.status === 'error' && 'החיפוש העולמי לא זמין כרגע. אפשר לבחור מהערים הפופולריות.'}
            {world.status === 'done' && worldHits.length === 0 && (list.length ? 'אין תוצאות נוספות.' : 'לא מצאנו עיר בשם הזה.')}
          </div>
          {worldHits.length > 0 && (
            <div role="radiogroup" aria-label="תוצאות חיפוש מכל העולם" className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto overscroll-contain">
              {worldHits.map((h) => {
                const on = value?.id === h.id
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ id: h.id, name: h.name, country: h.country, lat: h.lat, lng: h.lng, zoom: h.zoom })}
                    className={cx(
                      'flex min-h-[52px] shrink-0 items-center gap-2.5 rounded-card border px-2.5 py-1.5 text-start transition-colors duration-200 ease-out',
                      on ? 'border-accent bg-accent/10' : 'border-border bg-raised hover:border-border-strong',
                    )}
                  >
                    <span
                      className={cx('flex size-8 shrink-0 items-center justify-center rounded-full', on ? 'bg-accent text-on-accent' : 'bg-water text-accent')}
                      aria-hidden="true"
                    >
                      {on ? <Check size={16} /> : <Globe size={16} />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] leading-tight font-semibold" dir="auto">
                        {h.name}
                      </span>
                      <span className="truncate text-xs text-muted" dir="auto">
                        {[h.admin, h.country].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {term.length >= 2 && list.length > 0 && <h3 className="text-[13px] font-semibold text-muted">יעדים פופולריים</h3>}

      {/* Two-column grid, scrolls inside its own box so the rest of the form stays reachable */}
      <div
        role="radiogroup"
        aria-label="ערים פופולריות"
        className={cx('grid max-h-[300px] grid-cols-2 gap-2 overflow-y-auto overscroll-contain rounded-card pe-0.5', list.length === 0 && 'hidden')}
      >
        {list.map((d) => {
          const on = value?.id === d.id
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(d)}
              className={cx(
                'flex min-h-[60px] items-center gap-2 rounded-card border px-2.5 py-2 text-start transition-colors duration-200 ease-out',
                on ? 'border-accent bg-accent/10' : 'border-border bg-raised hover:border-border-strong',
              )}
            >
              <span
                className={cx('flex size-8 shrink-0 items-center justify-center rounded-full', on ? 'bg-accent text-on-accent' : 'bg-water text-accent')}
                aria-hidden="true"
              >
                {on ? <Check size={16} /> : <MapPin size={16} />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] leading-tight font-semibold">{d.name}</span>
                <span className="truncate text-xs text-muted">{d.country}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- dates ---------- */

export function DateRangeFields({
  start,
  end,
  onChange,
  minStart,
  note,
}: {
  start: string
  end: string
  onChange: (start: string, end: string) => void
  minStart?: string
  note?: ReactNode
}) {
  const n = tripLength(start, end)
  const error = !n ? 'תאריך החזרה צריך להיות אחרי היציאה' : n > MAX_TRIP_DAYS ? `אפשר לתכנן עד ${MAX_TRIP_DAYS} ימים` : ''
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך יציאה">
          {(id) => (
            <input
              id={id}
              type="date"
              value={start}
              min={minStart}
              onChange={(e) => {
                const s = e.target.value
                if (!s) return
                // Keep the return date after the departure date
                onChange(s, end && end >= s ? end : s)
              }}
              className={inputCls}
            />
          )}
        </Field>
        <Field label="תאריך חזרה">
          {(id) => (
            <input id={id} type="date" value={end} min={start} onChange={(e) => e.target.value && onChange(start, e.target.value)} className={inputCls} />
          )}
        </Field>
      </div>
      <p className={cx('text-[13px]', error ? 'text-accent-2' : 'text-muted')} role={error ? 'alert' : undefined}>
        {error || `${n} ימים · ${dateRange(start, end)}`}
      </p>
      {note}
    </div>
  )
}

export const validRange = (start: string, end: string) => {
  const n = tripLength(start, end)
  return n > 0 && n <= MAX_TRIP_DAYS
}

/* ---------- lodging ---------- */

export function LodgingSection({
  items,
  onAdd,
  onRemove,
  city,
  defaultIn,
  defaultOut,
}: {
  items: Lodging[]
  onAdd: (l: Lodging) => void
  onRemove: (id: string) => void
  city: string
  defaultIn: string
  defaultOut: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [checkIn, setCheckIn] = useState(defaultIn)
  const [checkOut, setCheckOut] = useState(defaultOut)

  const toggle = () => {
    setOpen((o) => !o)
    setCheckIn(defaultIn)
    setCheckOut(defaultOut)
  }

  return (
    <Section icon={BedDouble} title="לינה" hint="מלונות, דירות או אכסניות" count={items.length}>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((l) => (
            <ItemRow
              key={l.id}
              icon={BedDouble}
              title={l.name}
              meta={`${l.area ? `${l.area} · ` : ''}${dateRange(l.checkIn, l.checkOut)}`}
              href={mapsSearch(l.name, city)}
              onRemove={() => onRemove(l.id)}
            />
          ))}
        </ul>
      )}
      <AddToggle label="הוספת מקום לינה" open={open} onToggle={toggle} />
      {open && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onAdd({ id: newId('lodging'), name: name.trim(), area: area.trim() || undefined, checkIn, checkOut: checkOut < checkIn ? checkIn : checkOut })
            setName('')
            setArea('')
            setOpen(false)
          }}
        >
          <Field label="שם המקום">
            {(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: Hotel Avenida" className={inputCls} autoComplete="off" />}
          </Field>
          <Field label="שכונה או אזור (לא חובה)">
            {(id) => <input id={id} value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} autoComplete="off" />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="צ׳ק-אין">{(id) => <input id={id} type="date" value={checkIn} onChange={(e) => e.target.value && setCheckIn(e.target.value)} className={inputCls} />}</Field>
            <Field label="צ׳ק-אאוט">{(id) => <input id={id} type="date" value={checkOut} min={checkIn} onChange={(e) => e.target.value && setCheckOut(e.target.value)} className={inputCls} />}</Field>
          </div>
          <SaveButton disabled={!name.trim()}>שמירת מקום הלינה</SaveButton>
        </form>
      )}
    </Section>
  )
}

/* ---------- restaurants ---------- */

export function RestaurantSection({
  items,
  onAdd,
  onRemove,
  city,
  days,
}: {
  items: SavedRestaurant[]
  onAdd: (r: SavedRestaurant) => void
  onRemove: (id: string) => void
  city: string
  days: DayOption[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [dayId, setDayId] = useState('')
  const dayLabel = (id?: string) => days.find((d) => d.id === id)?.label

  return (
    <Section icon={UtensilsCrossed} title="מסעדות" hint="מקומות שרוצים לאכול בהם" count={items.length}>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <ItemRow
              key={r.id}
              icon={UtensilsCrossed}
              title={r.name}
              meta={[r.cuisine, dayLabel(r.dayId)].filter(Boolean).join(' · ') || undefined}
              href={mapsSearch(r.name, city)}
              onRemove={() => onRemove(r.id)}
            />
          ))}
        </ul>
      )}
      <AddToggle label="הוספת מסעדה" open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onAdd({ id: newId('rest'), name: name.trim(), cuisine: cuisine.trim() || undefined, dayId: dayId || undefined })
            setName('')
            setCuisine('')
            setDayId('')
            setOpen(false)
          }}
        >
          <Field label="שם המסעדה">
            {(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="off" />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="סוג מטבח (לא חובה)">
              {(id) => <input id={id} value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="איטלקי, דגים…" className={inputCls} autoComplete="off" />}
            </Field>
            <Field label="יום">{(id) => <DaySelect id={id} days={days} value={dayId} onChange={setDayId} />}</Field>
          </div>
          <SaveButton disabled={!name.trim()}>שמירת המסעדה</SaveButton>
        </form>
      )}
    </Section>
  )
}

/* ---------- activities ---------- */

export const ACTIVITY_KINDS: { id: ActivityKind; label: string; icon: LucideIcon }[] = [
  { id: 'museum', label: 'מוזיאון', icon: Landmark },
  { id: 'shopping', label: 'קניות', icon: ShoppingBag },
  { id: 'extreme', label: 'אקסטרים', icon: Zap },
  { id: 'cruise', label: 'שייט', icon: Ship },
  { id: 'tour', label: 'סיור מודרך', icon: Flag },
  { id: 'nature', label: 'טבע', icon: Trees },
  { id: 'show', label: 'מופע', icon: Music },
  { id: 'other', label: 'אחר', icon: Sparkles },
]

const kindOf = (k: ActivityKind) => ACTIVITY_KINDS.find((x) => x.id === k) ?? ACTIVITY_KINDS[ACTIVITY_KINDS.length - 1]

export function ActivitySection({
  items,
  onAdd,
  onRemove,
  city,
  days,
}: {
  items: Activity[]
  onAdd: (a: Activity) => void
  onRemove: (id: string) => void
  city: string
  days: DayOption[]
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ActivityKind>('museum')
  const [name, setName] = useState('')
  const [dayId, setDayId] = useState('')
  const dayLabel = (id?: string) => days.find((d) => d.id === id)?.label

  return (
    <Section icon={Sparkles} title="פעילויות" hint="מוזיאונים, קניות, אקסטרים, שייט ועוד" count={items.length}>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((a) => {
            const k = kindOf(a.kind)
            return (
              <ItemRow
                key={a.id}
                icon={k.icon}
                title={a.name}
                meta={[k.label, dayLabel(a.dayId)].filter(Boolean).join(' · ')}
                href={mapsSearch(a.name, city)}
                onRemove={() => onRemove(a.id)}
              />
            )
          })}
        </ul>
      )}
      <AddToggle label="הוספת פעילות" open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onAdd({ id: newId('act'), name: name.trim(), kind, dayId: dayId || undefined })
            setName('')
            setDayId('')
            setOpen(false)
          }}
        >
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-xs text-muted">סוג הפעילות</legend>
            <div role="radiogroup" aria-label="סוג הפעילות" className="grid grid-cols-4 gap-2">
              {ACTIVITY_KINDS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={kind === id}
                  onClick={() => setKind(id)}
                  className={cx(
                    'flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-card border px-1 text-xs transition-colors duration-200 ease-out',
                    kind === id ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-border bg-raised font-medium text-muted',
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="שם הפעילות">
            {(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: שייט בשקיעה" className={inputCls} autoComplete="off" />}
          </Field>
          <Field label="יום">{(id) => <DaySelect id={id} days={days} value={dayId} onChange={setDayId} />}</Field>
          <SaveButton disabled={!name.trim()}>שמירת הפעילות</SaveButton>
        </form>
      )}
    </Section>
  )
}
