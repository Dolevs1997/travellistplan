import { useMemo, useState } from 'react'
import { ArrowRight, Clock, Map as MapIcon, Plus, Search } from 'lucide-react'
import { IconButton, IconTile, MODE_ICON, cx } from '../components/ui'
import { useTrip } from '../state/TripStore'
import { durationLabel, freeSlot, slotPartLabel, timeRange, transitLabel } from '../data/helpers'
import type { StopKind } from '../data/types'
import { href, navigate } from '../router'

const FILTERS: { id: 'all' | StopKind; label: string }[] = [
  { id: 'all', label: 'קרוב למסלול' },
  { id: 'food', label: 'אוכל' },
  { id: 'heritage', label: 'תרבות ומורשת' },
  { id: 'market', label: 'שווקים' },
  { id: 'museum', label: 'מוזיאונים' },
  { id: 'nature', label: 'טבע' },
]

export default function AddStop({ dayId, highlight }: { dayId: string; highlight?: string }) {
  const { state, dispatch } = useTrip()
  const day = state.trip.days.find((d) => d.id === dayId) ?? state.trip.days.find((d) => d.id === state.activeDayId)!
  const dayIndex = state.trip.days.indexOf(day)
  const slot = freeSlot(day)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')

  const list = useMemo(
    () =>
      day.suggestions.filter(
        (g) => (filter === 'all' || g.kind === filter) && (!q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [day.suggestions, filter, q],
  )
  const last = day.stops[day.stops.length - 1]

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col gap-4 px-5 pt-4 pb-6">
      <header className="flex items-center gap-3">
        <IconButton label="חזרה ללו״ז" to="/trip/schedule">
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <h1 className="text-2xl font-bold">הוספת עצירה</h1>
      </header>

      <div className="flex items-center gap-3 rounded-card border-[1.5px] border-dashed border-accent-2 bg-accent-2/6 px-3.5 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent-2/14 text-accent-2">
          <Clock size={20} aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-accent-2">
            {slot
              ? `${slot.wholeDay ? 'יום פנוי' : `${slotPartLabel(slot.start)} פנוי`} · ${timeRange(slot.start, slot.end)}`
              : 'היום כבר מלא'}
          </span>
          <span className="text-[13px] text-muted">
            יום {dayIndex + 1} · {last ? `אחרי ${last.name}` : day.city}
          </span>
        </div>
      </div>

      <label className="flex h-[52px] shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 text-muted focus-within:border-accent">
        <Search size={20} aria-hidden="true" />
        <span className="sr-only">חיפוש מקום</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חפשו מקום, מסעדה או אטרקציה"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
        />
      </label>

      <div role="group" aria-label="סינון הצעות" className="no-scrollbar -mx-5 flex shrink-0 gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cx(
              'h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors duration-200 ease-out',
              filter === f.id ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-raised font-medium text-muted hover:text-text',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2.5" aria-labelledby="sugg">
        <div className="flex items-center justify-between">
          <h2 id="sugg" className="text-lg font-semibold">
            הצעות שמתאימות לזמן
          </h2>
          <span className="text-xs text-muted" aria-live="polite">
            {list.length} מקומות
          </span>
        </div>
        {list.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-4 text-[15px] text-muted">
            {day.suggestions.length === 0 ? 'אין עוד הצעות ליום הזה.' : 'לא מצאנו הצעות שמתאימות לסינון.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((g) => {
              const Icon = MODE_ICON[g.travel.mode]
              return (
                <li
                  key={g.id}
                  className={cx(
                    'flex items-center gap-3 rounded-[20px] border bg-surface p-3',
                    g.id === highlight ? 'border-accent-2' : 'border-border',
                  )}
                >
                  <IconTile kind={g.kind} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="text-base font-semibold">{g.name}</h3>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
                      <Icon size={14} aria-hidden="true" />
                      {transitLabel(g.travel)} · {durationLabel(g.durationMin)}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`הוספת ${g.name} ללו״ז`}
                    onClick={() => {
                      dispatch({ type: 'addFromSuggestion', dayId: day.id, suggestionId: g.id })
                      navigate('/trip/schedule')
                    }}
                    className="flex size-11 shrink-0 items-center justify-center rounded-tile border-[1.5px] border-accent-2 text-accent-2 transition-colors duration-200 ease-out hover:bg-accent-2/12"
                  >
                    <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <a
        href={href('/trip')}
        onClick={() => dispatch({ type: 'setDay', dayId: day.id })}
        className="mt-auto flex h-12 shrink-0 items-center justify-center gap-2 rounded-tile border border-border-strong text-[15px] font-medium"
      >
        <MapIcon size={18} className="text-accent" aria-hidden="true" />
        הצגת ההצעות על המפה
      </a>
    </div>
  )
}
