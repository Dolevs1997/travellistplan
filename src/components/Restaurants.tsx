import { dayDestination } from '../data/helpers'
import { ExternalLink, Plus, UtensilsCrossed } from 'lucide-react'
import type { Day } from '../data/types'
import { CITY_LABEL, RESTAURANTS, googleSearchUrl, restaurantCityForDay, restaurantsNearUrl } from '../data/restaurants'
import { useTrip } from '../state/TripStore'
import { href } from '../router'

const linkBtn =
  'flex h-11 shrink-0 items-center gap-1.5 rounded-tile border border-border-strong px-3 text-[13px] font-medium transition-colors duration-200 ease-out hover:bg-surface'

/**
 * Restaurants for the day's own city. The curated list exists only for Lisbon, Sintra and Porto;
 * anywhere else this shows the user's saved restaurants and a Google Maps search for that area,
 * never another city's list.
 */
export default function Restaurants({ day }: { day: Day }) {
  const { state } = useTrip()
  const { trip } = state
  const city = restaurantCityForDay(day)
  const dest = dayDestination(trip, day)
  const cityName = dest?.name ?? day.city
  const saved = (trip.restaurants ?? []).filter((r) => !r.dayId || r.dayId === day.id)

  // Center of the day's places, else the destination
  const n = day.stops.length
  const center = n
    ? { lat: day.stops.reduce((a, s) => a + s.lat, 0) / n, lng: day.stops.reduce((a, s) => a + s.lng, 0) / n }
    : dest
      ? { lat: dest.lat, lng: dest.lng }
      : null

  return (
    <section aria-labelledby="restaurants-title" className="flex flex-col gap-2.5 pt-2">
      <div className="flex flex-col gap-0.5">
        <h3 id="restaurants-title" className="text-lg font-semibold">
          {city ? `מסעדות מומלצות ב${CITY_LABEL[city]}` : `מסעדות ב${cityName}`}
        </h3>
        <p className="text-[13px] text-muted">ביקורות ותמונות – בגוגל מפות</p>
      </div>

      {saved.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="המסעדות ששמרת">
          {saved.map((r) => (
            <Row key={r.id} name={r.name} meta={r.cuisine ?? 'שמרת בפרטי הטיול'} url={googleSearchUrlFor(r.name, cityName)} />
          ))}
        </ul>
      )}

      {city && (
        <ul className="flex flex-col gap-2">
          {RESTAURANTS[city].map((r) => (
            <Row key={r.id} name={r.name} meta={`${r.cuisine} · ${r.area}`} url={googleSearchUrl(r, city)} />
          ))}
        </ul>
      )}

      {!city && (
        <div className="flex flex-col gap-2">
          {center && (
            <a href={restaurantsNearUrl(center.lat, center.lng)} target="_blank" rel="noopener noreferrer" className={`${linkBtn} justify-center`}>
              <UtensilsCrossed size={16} aria-hidden="true" />
              מסעדות מומלצות באזור – בגוגל מפות
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          <a href={href(`/day/${day.id}`)} className={`${linkBtn} justify-center text-accent`}>
            <Plus size={16} aria-hidden="true" />
            הוספת מסעדה ליום
          </a>
        </div>
      )}
    </section>
  )
}

const googleSearchUrlFor = (name: string, city: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`

function Row({ name, meta, url }: { name: string; meta: string; url: string }) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-raised p-2.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-water text-accent" aria-hidden="true">
        <UtensilsCrossed size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold" dir="auto">
          {name}
        </span>
        <span className="truncate text-[13px] text-muted">{meta}</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`פתיחת ${name} בגוגל מפות (בכרטיסייה חדשה)`} className={linkBtn}>
        פתיחה בגוגל
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </li>
  )
}
