import { useEffect, useRef, useState } from 'react'
import { BedDouble, Camera, Check, Minus, Pencil, Plane, Plus, SlidersHorizontal, Ticket, Trash2, TramFront, UtensilsCrossed, X, type LucideIcon } from 'lucide-react'
import { BottomNav, cx } from '../components/ui'
import {
  fromEur,
  money,
  nowTime,
  plannedByCategory,
  prepaidByCategory,
  saveCurrency,
  savedCurrency,
  shrinkPhoto,
  spentByCategory,
  toEur,
  todayIso,
  type Currency,
} from '../data/budget'
import { addDays } from '../data/brief'
import { briefOf } from '../data/tripEdit'
import type { Expense, Trip } from '../data/types'
import { useTrip } from '../state/TripStore'

const ICONS: Record<string, LucideIcon> = { stay: BedDouble, flights: Plane, food: UtensilsCrossed, transport: TramFront, tickets: Ticket }
const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`
const weekday = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00`).getDay()]

/** "היום · שישי 27.11", "אתמול · …", else "שישי 27.11 · יום 2" */
function dateLabel(iso: string, trip: Trip) {
  const today = todayIso()
  const d = trip.days.findIndex((x) => x.date === iso)
  const base = `${weekday(iso)} ${dm(iso)}`
  if (iso === today) return `היום · ${base}`
  if (iso === addDays(today, -1)) return `אתמול · ${base}`
  return d >= 0 ? `${base} · יום ${d + 1}` : base
}

/** Budget and expenses: totals against the plan, today's spending, every expense by day, and what was paid before the trip */
export default function Budget() {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const [cur, setCur] = useState<Currency>(savedCurrency)
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)
  const [editPlan, setEditPlan] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [showFilter, setShowFilter] = useState(false)
  const receiptInput = useRef<HTMLInputElement>(null)
  const m = (eur: number) => money(eur, cur)

  const cats = trip.budget.categories
  const expenses = trip.expenses ?? []
  const { planned, estimated } = plannedByCategory(trip)
  const spent = spentByCategory(trip)
  const prepaid = prepaidByCategory(expenses)
  const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0)
  const totalSpent = Object.values(spent).reduce((a, b) => a + b, 0)
  const totalPrepaid = Object.values(prepaid).reduce((a, b) => a + b, 0)
  const left = totalPlanned - totalSpent
  const pct = totalPlanned > 0 ? Math.min(100, Math.round((totalSpent / totalPlanned) * 100)) : 0

  // Today, when it's a day of the trip: what was spent against a fair share of the rest (flights and stays aside)
  const today = todayIso()
  const todayIndex = trip.days.findIndex((d) => d.date === today)
  const onTheGround = (planned.food ?? 0) + (planned.transport ?? 0) + (planned.tickets ?? 0)
  const daily = trip.days.length ? onTheGround / trip.days.length : 0
  const spentToday = expenses.filter((e) => e.date === today && !e.prepaid && !['stay', 'flights'].includes(e.categoryId)).reduce((a, e) => a + e.amount, 0)
  const last = expenses.reduce<Expense | null>((a, e) => (!a || e.createdAt > a.createdAt ? e : a), null)
  const legacy = cats.reduce((a, c) => a + c.spent, 0)

  // Every expense paid on the trip, newest day first; then what was paid before it
  const onTrip = expenses.filter((e) => !e.prepaid && (!filter || e.categoryId === filter))
  const byDate = new Map<string, Expense[]>()
  for (const e of [...onTrip].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))) {
    const k = e.date ?? ''
    byDate.set(k, [...(byDate.get(k) ?? []), e])
  }
  const paidBefore = expenses.filter((e) => e.prepaid && (!filter || e.categoryId === filter))

  // Things booked in the trip that have no price yet: one tap to add them as prepaid
  const brief = briefOf(trip)
  const people = brief.adults + brief.children.length
  const suggestions = [
    ...(trip.lodgings ?? [])
      .filter((l) => !expenses.some((e) => e.prepaid && e.title === l.name))
      .map((l) => ({ id: `l-${l.id}`, title: l.name, categoryId: 'stay', meta: `${Math.max(1, Math.round((Date.parse(l.checkOut) - Date.parse(l.checkIn)) / 86_400_000))} לילות · לינה`, amount: undefined as number | undefined })),
    ...(brief.flightsBooked && !expenses.some((e) => e.prepaid && e.categoryId === 'flights')
      ? [{ id: 'flights', title: 'טיסות הלוך-חזור', categoryId: 'flights', meta: `${people} נוסעים · טיסות`, amount: brief.flightPerPerson ? (brief.flightPerPerson * people) / 4 : undefined }]
      : []),
  ]

  const newExpense = (patch: Partial<Expense> = {}): Partial<Expense> => ({
    categoryId: 'food',
    date: todayIndex >= 0 ? today : trip.days[0]?.date,
    time: nowTime(),
    qty: 1,
    ...patch,
  })

  return (
    <div className="mx-auto min-h-full max-w-[560px] px-4 pt-4 pb-28">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[28px] leading-tight font-bold">תקציב</h1>
          <span className="text-xs text-muted">
            {trip.name}
            {last ? ` · עודכן ${dateLabel(new Date(last.createdAt).toISOString().slice(0, 10), trip).split(' · ')[0]} ב-${new Date(last.createdAt).toTimeString().slice(0, 5)}` : ''}
          </span>
        </div>
        <div role="group" aria-label="מטבע" className="flex shrink-0 rounded-xl bg-raised p-[3px]">
          {(['ILS', 'EUR'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cur === c}
              onClick={() => (setCur(c), saveCurrency(c))}
              className={cx('h-9 w-11 rounded-[9px] text-[15px]', cur === c ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(21,24,29,0.1)]' : 'font-medium text-muted')}
            >
              {c === 'ILS' ? '₪' : '€'}
            </button>
          ))}
        </div>
      </header>

      <article className="mt-4 flex flex-col gap-3 rounded-[24px] bg-text p-5 text-bg">
        <span className="text-[13px] opacity-75">הוצאתם עד עכשיו</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[36px] leading-none font-bold">{m(totalSpent)}</span>
          {totalPlanned > 0 && <span className="text-[15px] opacity-75">מתוך {m(totalPlanned)}</span>}
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
          <span className={cx('rounded-full transition-[width] duration-300 ease-out', left < 0 ? 'bg-[#F0A15E]' : 'bg-[#5FC2AE]')} style={{ width: `${pct}%` }} />
        </div>
        {totalPlanned > 0 ? (
          <div className="flex flex-col gap-0.5 text-[13px]">
            <span className="font-semibold">{left >= 0 ? `נשארו ${m(left)}` : `חריגה של ${m(-left)}`}</span>
            {totalPrepaid > 0 && <span className="opacity-75">מתוכם {m(totalPrepaid)} שולמו מראש</span>}
            {estimated && <span className="opacity-75">התקציב לפי ההערכה מיצירת הטיול – אפשר לערוך</span>}
          </div>
        ) : (
          <span className="text-[13px] opacity-75">עוד לא נקבע תקציב לטיול הזה</span>
        )}
        {daily > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2.5 text-[13px]">
            {todayIndex >= 0 ? (
              <>
                <span>
                  היום (יום {todayIndex + 1}): {m(spentToday)} מתוך ~{m(daily)}
                </span>
                <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', spentToday <= daily ? 'bg-[#5FC2AE] text-[#0E3B33]' : 'bg-[#F0A15E] text-[#4A2508]')}>
                  {spentToday <= daily ? 'בקצב טוב' : 'מעל היומי'}
                </span>
              </>
            ) : (
              <span>תקציב יומי בטיול (אוכל, נסיעות ואטרקציות): ~{m(daily)}</span>
            )}
          </div>
        )}
      </article>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setEditing(newExpense())}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold text-on-accent"
        >
          <Plus size={18} aria-hidden="true" />
          הוספת הוצאה
        </button>
        <button
          type="button"
          onClick={() => receiptInput.current?.click()}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-border-strong bg-surface text-[15px] font-semibold"
        >
          <Camera size={18} aria-hidden="true" />
          צילום קבלה
        </button>
        <input
          ref={receiptInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const receipt = await shrinkPhoto(file).catch(() => undefined)
            setEditing(newExpense({ receipt }))
          }}
        />
      </div>

      <section aria-labelledby="by-cat" className="mt-6 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 id="by-cat" className="text-lg font-bold">
            לפי קטגוריה
          </h2>
          <button type="button" onClick={() => setEditPlan(true)} className="flex items-center gap-1 text-[13px] font-semibold text-accent">
            <Pencil size={14} aria-hidden="true" />
            עריכת התקציב
          </button>
        </div>
        <ul className="flex flex-col rounded-[20px] border border-border bg-surface px-3.5 py-1">
          {cats.map((c, i) => {
            const Icon = ICONS[c.id] ?? Ticket
            const p = planned[c.id] ?? 0
            const s = spent[c.id] ?? 0
            const paid = p > 0 && (prepaid[c.id] ?? 0) >= p
            const ratio = p > 0 ? Math.min(100, Math.round((s / p) * 100)) : 0
            return (
              <li key={c.id} className={cx('flex items-center gap-3 py-3', i < cats.length - 1 && 'border-b border-border')}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-medium">{c.label}</span>
                    <span className="text-[13px] text-muted">
                      <b className="text-text">{m(s)}</b>
                      {p > 0 ? ` / ${m(p)}` : ''}
                      {paid && <b className="text-accent"> · שולם</b>}
                    </span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <span className={cx('rounded-full', s > p && p > 0 ? 'bg-accent-2' : 'bg-accent')} style={{ width: `${ratio}%` }} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="all-exp" className="mt-6 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 id="all-exp" className="text-lg font-bold">
            כל ההוצאות
          </h2>
          <button
            type="button"
            aria-expanded={showFilter}
            onClick={() => setShowFilter((v) => !v)}
            className={cx('flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium', filter ? 'border-accent text-accent' : 'border-border-strong')}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            סינון{filter ? `: ${cats.find((c) => c.id === filter)?.label}` : ''}
          </button>
        </div>
        {showFilter && (
          <div role="group" aria-label="סינון לפי קטגוריה" className="no-scrollbar flex gap-2 overflow-x-auto">
            {[{ id: null, label: 'הכל' }, ...cats].map((c) => (
              <button
                key={c.id ?? 'all'}
                type="button"
                aria-pressed={filter === c.id}
                onClick={() => setFilter(c.id)}
                className={cx('h-8 shrink-0 rounded-full border px-3 text-xs font-medium', filter === c.id ? 'border-text bg-text text-bg' : 'border-border bg-surface')}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {byDate.size === 0 && paidBefore.length === 0 && suggestions.length === 0 && (
          <p className="rounded-2xl bg-raised p-4 text-center text-sm text-muted">עוד אין הוצאות. הוסיפו הוצאה או צלמו קבלה.</p>
        )}

        {[...byDate.entries()].map(([date, list]) => (
          <div key={date} className="flex flex-col gap-1.5">
            <h3 className="px-1 pt-1 text-xs font-semibold text-muted">{date ? dateLabel(date, trip) : 'ללא תאריך'}</h3>
            <ul className="flex flex-col rounded-[20px] border border-border bg-surface px-3 py-0.5">
              {list.map((e, i) => (
                <ExpenseRow key={e.id} e={e} trip={trip} m={m} divider={i < list.length - 1} onOpen={() => setEditing(e)} />
              ))}
            </ul>
          </div>
        ))}

        {(paidBefore.length > 0 || (suggestions.length > 0 && !filter)) && (
          <div className="flex flex-col gap-1.5">
            <h3 className="px-1 pt-1 text-xs font-semibold text-muted">שולם מראש</h3>
            <ul className="flex flex-col rounded-[20px] border border-border bg-surface px-3 py-0.5">
              {paidBefore.map((e, i) => (
                <ExpenseRow key={e.id} e={e} trip={trip} m={m} divider={i < paidBefore.length - 1 || (!filter && suggestions.length > 0)} onOpen={() => setEditing(e)} />
              ))}
              {!filter &&
                suggestions.map((s, i) => (
                  <li key={s.id} className={cx(i < suggestions.length - 1 && 'border-b border-border')}>
                    <button
                      type="button"
                      onClick={() => setEditing(newExpense({ title: s.title, categoryId: s.categoryId, prepaid: true, date: undefined, time: undefined, amount: s.amount }))}
                      className="flex w-full items-center gap-3 py-3 text-start"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-dashed border-accent text-accent">
                        <Plus size={17} aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-medium">{s.title}</span>
                        <span className="text-xs text-muted">{s.meta}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold text-accent">הוספת מחיר</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {legacy > 0 && !filter && <p className="px-1 text-xs text-muted">ועוד {m(legacy)} שנרשמו כסכומים לפי קטגוריה, בלי פירוט.</p>}
      </section>

      <BottomNav active="budget" />

      {editing && (
        <ExpenseSheet
          key={editing.id ?? 'new'}
          initial={editing}
          trip={trip}
          cur={cur}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            if (editing.id) dispatch({ type: 'updateExpense', id: editing.id, patch: e })
            else dispatch({ type: 'addExpense', expense: { ...e, id: `x-${Date.now().toString(36)}`, createdAt: Date.now() } as Expense })
            setEditing(null)
          }}
          onDelete={
            editing.id
              ? () => {
                  dispatch({ type: 'removeExpense', id: editing.id! })
                  setEditing(null)
                }
              : undefined
          }
        />
      )}
      {editPlan && (
        <PlanSheet
          trip={trip}
          cur={cur}
          planned={planned}
          onClose={() => setEditPlan(false)}
          onSave={(p) => {
            dispatch({ type: 'setPlanned', planned: p })
            setEditPlan(false)
          }}
        />
      )}
    </div>
  )
}

function ExpenseRow({ e, trip, m, divider, onOpen }: { e: Expense; trip: Trip; m: (eur: number) => string; divider: boolean; onOpen: () => void }) {
  const Icon = ICONS[e.categoryId] ?? Ticket
  const cat = trip.budget.categories.find((c) => c.id === e.categoryId)?.label ?? ''
  const day = trip.days.find((d) => d.stops.some((s) => s.id === e.stopId))
  const stopN = day ? day.stops.findIndex((s) => s.id === e.stopId) + 1 : 0
  const fresh = Date.now() - e.createdAt < 10 * 60_000
  const meta = [e.time, `${cat}${(e.qty ?? 1) > 1 ? ` ×${e.qty}` : ''}`, stopN ? `עצירה ${stopN}` : undefined].filter(Boolean).join(' · ')
  return (
    <li className={cx(divider && 'border-b border-border')}>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-3 text-start">
        {e.receipt ? (
          <img src={e.receipt} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-muted">
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{e.title}</span>
            {fresh && <span className="shrink-0 rounded-full bg-accent/12 px-1.5 py-px text-[10px] font-semibold text-accent">חדש</span>}
          </span>
          <span className="truncate text-xs text-muted">{meta}</span>
        </span>
        <b className="shrink-0 text-[15px]">{m(e.amount)}</b>
      </button>
    </li>
  )
}

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-[rgba(21,24,29,0.45)]" />
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[92vh] w-full max-w-[560px] flex-col rounded-t-[28px] bg-bg outline-none">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" aria-label="סגירה" onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-raised">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">{children}</div>
        <div className="border-t border-border px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">{footer}</div>
      </section>
    </div>
  )
}

const field = 'h-11 rounded-xl border border-border-strong bg-surface px-3 text-[15px] outline-none focus:border-accent'

function ExpenseSheet({
  initial,
  trip,
  cur,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Partial<Expense>
  trip: Trip
  cur: Currency
  onClose: () => void
  onSave: (e: Omit<Expense, 'id' | 'createdAt'>) => void
  onDelete?: () => void
}) {
  const [currency, setCurrency] = useState<Currency>(cur)
  const [amount, setAmount] = useState(initial.amount ? String(Math.round(fromEur(initial.amount, cur) * 100) / 100) : '')
  const [title, setTitle] = useState(initial.title ?? '')
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? 'food')
  const [prepaid, setPrepaid] = useState(!!initial.prepaid)
  const [date, setDate] = useState(initial.date ?? trip.days[0]?.date ?? todayIso())
  const [time, setTime] = useState(initial.time ?? nowTime())
  const [qty, setQty] = useState(initial.qty ?? 1)
  const [stopId, setStopId] = useState(initial.stopId ?? '')
  const [receipt, setReceipt] = useState(initial.receipt)
  const photo = useRef<HTMLInputElement>(null)
  const value = Number(amount.replace(',', '.'))
  const day = trip.days.find((d) => d.date === date)
  const valid = value > 0 && title.trim().length > 0

  const save = () => {
    if (!valid) return
    onSave({
      title: title.trim(),
      categoryId,
      amount: Math.round(toEur(value, currency) * 100) / 100,
      qty: qty > 1 ? qty : undefined,
      prepaid: prepaid || undefined,
      date: prepaid ? undefined : date,
      time: prepaid ? undefined : time,
      stopId: !prepaid && stopId ? stopId : undefined,
      receipt,
    })
  }

  return (
    <Sheet
      title={initial.id ? 'עריכת הוצאה' : 'הוצאה חדשה'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" disabled={!valid} onClick={save} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-40">
            <Check size={18} aria-hidden="true" />
            שמירה
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete} aria-label="מחיקת ההוצאה" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong text-accent-2">
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-2">
        <label className="flex h-14 flex-1 items-center gap-2 rounded-2xl border-2 border-accent bg-surface px-3.5">
          <span className="sr-only">סכום</span>
          <span className="text-xl font-bold text-muted">{currency === 'ILS' ? '₪' : '€'}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder="0"
            autoFocus={!initial.id}
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none"
          />
        </label>
        <div role="group" aria-label="מטבע ההוצאה" className="flex shrink-0 rounded-xl bg-raised p-[3px]">
          {(['ILS', 'EUR'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={currency === c}
              onClick={() => setCurrency(c)}
              className={cx('h-10 w-11 rounded-[9px] text-[15px]', currency === c ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(21,24,29,0.1)]' : 'font-medium text-muted')}
            >
              {c === 'ILS' ? '₪' : '€'}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        על מה?
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: כרטיסים למנזר" className={cx(field, 'text-text')} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">קטגוריה</span>
        <div className="flex flex-wrap gap-1.5">
          {trip.budget.categories.map((c) => {
            const Icon = ICONS[c.id] ?? Ticket
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                className={cx('flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium', categoryId === c.id ? 'border-text bg-text text-bg' : 'border-border bg-surface')}
              >
                <Icon size={14} aria-hidden="true" />
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-[15px] font-medium">שולם מראש</span>
          <span className="text-xs text-muted">טיסות, מלון או כרטיסים ששילמתם לפני הטיול</span>
        </span>
        <input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
      </label>

      {!prepaid && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              יום
              <select value={date} onChange={(e) => (setDate(e.target.value), setStopId(''))} className={cx(field, 'text-text')}>
                {trip.days.map((d, i) => (
                  <option key={d.id} value={d.date}>
                    יום {i + 1} · {dm(d.date)}
                  </option>
                ))}
                {!trip.days.some((d) => d.date === date) && <option value={date}>{dm(date)}</option>}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              שעה
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={cx(field, 'text-text')} />
            </label>
          </div>
          {day && day.stops.length > 0 && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              איפה (לא חובה)
              <select value={stopId} onChange={(e) => setStopId(e.target.value)} className={cx(field, 'text-text')}>
                <option value="">—</option>
                {day.stops.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {i + 1}. {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">כמות</span>
        <span className="flex items-center gap-2.5">
          <button type="button" aria-label="פחות" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex size-9 items-center justify-center rounded-[10px] border border-border-strong">
            <Minus size={16} aria-hidden="true" />
          </button>
          <b className="min-w-6 text-center" aria-live="polite">
            {qty}
          </b>
          <button type="button" aria-label="יותר" onClick={() => setQty((q) => Math.min(20, q + 1))} className="flex size-9 items-center justify-center rounded-[10px] border border-border-strong">
            <Plus size={16} aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {receipt ? (
          <>
            <img src={receipt} alt="הקבלה" className="size-16 rounded-xl object-cover" />
            <button type="button" onClick={() => setReceipt(undefined)} className="text-[13px] font-medium text-accent-2">
              הסרת הקבלה
            </button>
          </>
        ) : (
          <button type="button" onClick={() => photo.current?.click()} className="flex h-10 items-center gap-2 rounded-xl border border-border-strong px-3 text-[13px] font-medium">
            <Camera size={16} aria-hidden="true" />
            צירוף צילום קבלה
          </button>
        )}
        <input
          ref={photo}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) setReceipt(await shrinkPhoto(file).catch(() => undefined))
          }}
        />
      </div>
    </Sheet>
  )
}

function PlanSheet({
  trip,
  cur,
  planned,
  onClose,
  onSave,
}: {
  trip: Trip
  cur: Currency
  planned: Record<string, number>
  onClose: () => void
  onSave: (p: Record<string, number>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(trip.budget.categories.map((c) => [c.id, String(Math.round(fromEur(planned[c.id] ?? 0, cur)))])),
  )
  const total = Object.values(values).reduce((a, v) => a + (Number(v) || 0), 0)
  return (
    <Sheet
      title="עריכת התקציב"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => onSave(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(toEur(Number(v) || 0, cur))])))}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold text-on-accent"
        >
          <Check size={18} aria-hidden="true" />
          שמירה · סה״כ {cur === 'ILS' ? '₪' : '€'}
          {Math.round(total).toLocaleString('en-US')}
        </button>
      }
    >
      <p className="text-[13px] text-muted">כמה אתם מתכננים להוציא בכל קטגוריה, לכל הנוסעים יחד.</p>
      {trip.budget.categories.map((c) => {
        const Icon = ICONS[c.id] ?? Ticket
        return (
          <label key={c.id} className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="flex-1 text-[15px] font-medium">{c.label}</span>
            <span className="flex h-11 w-36 items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 focus-within:border-accent">
              <span className="text-muted">{cur === 'ILS' ? '₪' : '€'}</span>
              <input
                value={values[c.id]}
                onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value.replace(/\D/g, '') }))}
                inputMode="numeric"
                aria-label={`תקציב ${c.label}`}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
            </span>
          </label>
        )
      })}
    </Sheet>
  )
}
