import { useState } from 'react'
import { Drawer } from 'vaul'
import { BedDouble, ChevronDown, Plane, Plus, Ticket, TramFront, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { BottomNav, Fab, ScreenHeader, cx } from '../components/ui'
import { useTrip } from '../state/TripStore'
import { dayIndexOf } from '../data/helpers'

const ICONS: Record<string, LucideIcon> = {
  stay: BedDouble,
  flights: Plane,
  food: UtensilsCrossed,
  transport: TramFront,
  tickets: Ticket,
}

const eur = (n: number) => `€${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

export default function Budget() {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const cats = trip.budget.categories
  const spent = cats.reduce((n, c) => n + c.spent, 0)
  const planned = cats.reduce((n, c) => n + c.planned, 0)
  const left = planned - spent
  const daysLeft = Math.max(1, trip.days.length - dayIndexOf(trip, trip.progress.dayId))
  const pct = Math.min(100, Math.round((spent / planned) * 100))

  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto min-h-full max-w-[560px] px-5 pt-5 pb-[180px]">
      <div className="flex flex-col gap-5">
        <ScreenHeader
          eyebrow={`${trip.name} · ${trip.days.length} ימים`}
          title="תקציב"
          action={
            <span className="flex h-11 items-center gap-1.5 rounded-tile border border-border bg-surface px-3.5 text-sm font-semibold" aria-label="מטבע: אירו">
              EUR
              <ChevronDown size={16} className="text-muted" aria-hidden="true" />
            </span>
          }
        />

        <article className="flex flex-col gap-3.5 rounded-phone border border-border bg-surface p-5">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-muted">הוצאתם עד עכשיו</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[34px] leading-tight font-bold">{eur(spent)}</span>
              <span className="text-[15px] text-muted">מתוך {eur(planned)}</span>
            </div>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
            <span className="rounded-full bg-accent transition-[width] duration-250 ease-out" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-accent">
              {left >= 0 ? `נשארו ${eur(left)} (${100 - pct}%)` : `חריגה של ${eur(-left)}`}
            </span>
            <span className="text-muted">כ-{eur(Math.max(0, Math.round(left / daysLeft)))} ליום לשאר הטיול</span>
          </div>
        </article>

        <section className="flex flex-col gap-3" aria-labelledby="by-cat">
          <h2 id="by-cat" className="text-lg font-semibold">
            לפי קטגוריה
          </h2>
          <ul className="flex flex-col rounded-phone border border-border bg-surface px-3.5 py-1.5">
            {cats.map((c, i) => {
              const Icon = ICONS[c.id] ?? Ticket
              const p = Math.min(100, Math.round((c.spent / c.planned) * 100))
              return (
                <li key={c.id} className={cx('flex items-center gap-3 py-2.5', i < cats.length - 1 && 'border-b border-border')}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-water text-accent">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-[15px] font-medium">{c.label}</span>
                      <span className="text-[13px] text-muted">
                        <span className="font-semibold text-text">{eur(c.spent)}</span> / {eur(c.planned)}
                      </span>
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                      <span className="rounded-full bg-accent transition-[width] duration-250 ease-out" style={{ width: `${p}%` }} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <Fab label="הוספת הוצאה" onClick={() => setOpen(true)}>
        <Plus size={26} strokeWidth={2.25} aria-hidden="true" />
      </Fab>
      <BottomNav active="budget" />

      <AddExpense
        open={open}
        onOpenChange={setOpen}
        categories={cats.map((c) => ({ id: c.id, label: c.label }))}
        onSave={(categoryId, amount) => {
          dispatch({ type: 'addExpense', categoryId, amount })
          setOpen(false)
        }}
      />
    </div>
  )
}

function AddExpense({
  open,
  onOpenChange,
  categories,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  categories: { id: string; label: string }[]
  onSave: (categoryId: string, amount: number) => void
}) {
  const [cat, setCat] = useState(categories[2]?.id ?? categories[0].id)
  const [amount, setAmount] = useState('')
  const value = Number(amount.replace(',', '.'))
  const valid = Number.isFinite(value) && value > 0

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <Drawer.Content
          aria-describedby={undefined}
          dir="rtl"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-[560px] flex-col gap-4 rounded-t-sheet border-t border-border bg-surface px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] font-sans text-text shadow-sheet outline-none"
        >
          <span className="mx-auto h-[5px] w-10 rounded-full bg-handle" aria-hidden="true" />
          <Drawer.Title className="text-2xl font-bold">הוצאה חדשה</Drawer.Title>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) {
                onSave(cat, value)
                setAmount('')
              }
            }}
          >
            <label className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">סכום (€)</span>
              <input
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-[52px] rounded-2xl border border-border bg-raised px-4 text-xl font-semibold outline-none focus:border-accent"
              />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] text-muted">קטגוריה</legend>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={c.id === cat}
                    onClick={() => setCat(c.id)}
                    className={cx(
                      'h-10 rounded-full border px-4 text-[13px] transition-colors duration-200 ease-out',
                      c.id === cat ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-raised font-medium text-muted',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={!valid}
              className="h-[52px] rounded-tile bg-accent text-[15px] font-semibold text-on-accent transition-opacity duration-200 ease-out disabled:opacity-40"
            >
              שמירה
            </button>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
