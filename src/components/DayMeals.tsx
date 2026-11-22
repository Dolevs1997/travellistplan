import { ChevronLeft, UtensilsCrossed } from 'lucide-react'
import { MEALS, MEAL_IDS, plannedMeal } from '../data/eat'
import { timeRange } from '../data/helpers'
import type { Day } from '../data/types'
import { href } from '../router'

/** The day's meals in the schedule: what's planned for each, and a way to choose where to eat */
export default function DayMeals({ day }: { day: Day }) {
  return (
    <section aria-labelledby={`meals-${day.id}`} className="flex flex-col gap-2.5 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`meals-${day.id}`} className="text-lg font-semibold">
          איפה אוכלים היום?
        </h3>
        <a href={href(`/eat/${day.id}`)} className="flex items-center gap-0.5 text-[13px] font-semibold text-accent">
          מסעדות מומלצות
          <ChevronLeft size={15} aria-hidden="true" />
        </a>
      </div>
      <ul className="flex flex-col gap-2">
        {MEAL_IDS.map((id) => {
          const s = plannedMeal(day, id)
          const to = s?.info?.source === 'google' ? `/restaurant/${s.info.ref}/${day.id}/${id}` : s ? `/place/${s.id}` : `/eat/${day.id}/${id}`
          return (
            <li key={id}>
              <a href={href(to)} className="flex min-h-14 items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <UtensilsCrossed size={18} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs text-muted">{MEALS[id].label}</span>
                  <span className={s ? 'truncate text-[15px] font-semibold' : 'text-[15px] text-accent'}>{s ? s.name : 'בחירת מסעדה'}</span>
                </span>
                {s && <span className="shrink-0 text-xs text-muted">{timeRange(s.start, s.end)}</span>}
                <ChevronLeft size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
