import { ExternalLink, UtensilsCrossed } from 'lucide-react'
import type { Day } from '../data/types'
import { CITY_LABEL, RESTAURANTS, googleSearchUrl, restaurantCityForDay } from '../data/restaurants'

/** Restaurants for the day's city; reviews and photos are on Google Maps. */
export default function Restaurants({ day }: { day: Day }) {
  const city = restaurantCityForDay(day)
  const list = RESTAURANTS[city]

  return (
    <section aria-labelledby="restaurants-title" className="flex flex-col gap-2.5 pt-2">
      <div className="flex flex-col gap-0.5">
        <h3 id="restaurants-title" className="text-lg font-semibold">
          מסעדות מומלצות ב{CITY_LABEL[city]}
        </h3>
        <p className="text-[13px] text-muted">ביקורות ותמונות – בגוגל מפות</p>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-card border border-border bg-raised p-2.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-water text-accent" aria-hidden="true">
              <UtensilsCrossed size={20} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold" dir="auto">
                {r.name}
              </span>
              <span className="text-[13px] text-muted">
                {r.cuisine} · {r.area}
              </span>
            </div>
            <a
              href={googleSearchUrl(r, city)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`פתיחת ${r.name} בגוגל מפות (בכרטיסייה חדשה)`}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-tile border border-border-strong px-3 text-[13px] font-medium transition-colors duration-200 ease-out hover:bg-surface"
            >
              פתיחה בגוגל
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
