import { useState } from 'react'
import { ArrowRight, BedDouble, CalendarDays, Car, ChevronLeft, ExternalLink, LocateFixed, Map as MapIcon, MapPin, Pencil, Plus, TrainFront, UtensilsCrossed } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import { addDays, travelers } from '../data/brief'
import { useCityPhoto } from '../data/cityPhoto'
import { visitsOnDay } from '../data/visits'
import { countdownLabel, daysUntil, shortDate, tripLegs, tripRange } from '../data/helpers'
import { briefOf } from '../data/tripEdit'
import type { Day, Destination } from '../data/types'
import { useTrip } from '../state/TripStore'
import { href, navigate } from '../router'
import { cityModeOf } from './EditTrip'

const weekday = (iso: string) => new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(`${iso}T12:00:00`))
const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

/** The whole trip on one page: its days, where you sleep, restaurants and how you get around in each city */
export default function Overview() {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const legs = tripLegs(trip)
  const brief = briefOf(trip)
  const first = legs[0]?.destination ?? trip.destination
  const photo = useCityPhoto(first)
  const [photoFailed, setPhotoFailed] = useState(false)
  const people = travelers(brief)
  const countdown = trip.days[0] ? countdownLabel(daysUntil(trip.days[0].date)) : ''
  const stopsCount = trip.days.reduce((n, d) => n + d.stops.length, 0)

  const openDay = (d: Day) => {
    dispatch({ type: 'setDay', dayId: d.id })
    navigate('/trip/schedule')
  }
  const legRange = (i: number) => {
    const days = legs[i].days
    const nights = Math.max(1, days.length - (i === legs.length - 1 ? 1 : 0))
    return { from: days[0].date, to: addDays(days[0].date, nights), nights }
  }
  const dayName = (dayId?: string) => {
    const i = trip.days.findIndex((d) => d.id === dayId)
    return i >= 0 ? `יום ${i + 1}` : ''
  }

  const sectionTitle = 'text-lg font-semibold'
  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-10">
      <div className="relative h-[280px] bg-water">
        {photo && !photoFailed ? (
          <img src={photo.src} alt={first ? `תמונה של ${first.name}` : ''} onError={() => setPhotoFailed(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-accent" aria-hidden="true">
            <MapPin size={40} />
          </span>
        )}
        <div className="absolute inset-x-4 top-4 flex justify-between">
          <IconButton label="חזרה למסך הבית" to="/" className="!rounded-full !border-0 shadow-[var(--float-shadow)]">
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <IconButton label="עריכת הטיול" to="/edit" className="!rounded-full !border-0 shadow-[var(--float-shadow)]">
            <Pencil size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <main className="relative -mt-9 flex flex-col gap-6 rounded-t-sheet bg-bg px-5 pt-5">
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-[26px] leading-tight font-bold">{trip.name}</h1>
              <span className="text-[13px] text-muted">
                {tripRange(trip)} · {trip.days.length} ימים · {people} נוסעים
                {stopsCount ? ` · ${stopsCount} עצירות` : ''}
              </span>
            </div>
            {countdown && <span className="shrink-0 rounded-full bg-accent/12 px-3 py-1.5 text-xs font-semibold text-accent">{countdown}</span>}
          </div>
          <nav aria-label="קפיצה לחלק" className="flex flex-wrap gap-1.5">
            {[
              { id: 'ov-days', label: 'ימים' },
              { id: 'ov-stay', label: 'לינה' },
              { id: 'ov-food', label: 'מסעדות' },
              { id: 'ov-move', label: 'התניידות' },
            ].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => document.getElementById(l.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="h-9 rounded-full border border-border bg-surface px-3.5 text-[13px]"
              >
                {l.label}
              </button>
            ))}
          </nav>
          <div className="flex gap-2">
            <a href={href('/days')} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-tile bg-accent text-[15px] font-semibold text-on-accent">
              <CalendarDays size={18} aria-hidden="true" />
              לו״ז מלא
            </a>
            <a href={href('/trip')} className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong bg-surface px-5 text-[15px] font-medium">
              <MapIcon size={18} className="text-accent" aria-hidden="true" />
              מפה
            </a>
          </div>
        </header>

        <section id="ov-days" className="flex scroll-mt-4 flex-col gap-2.5" aria-labelledby="ov-days-t">
          <h2 id="ov-days-t" className={sectionTitle}>
            ימי הטיול
          </h2>
          <ul className="flex flex-col gap-1.5">
            {trip.days.map((d, i) => (
              <li key={d.id}>
                <DayRow day={d} n={i + 1} dest={d.destination ?? trip.destination} visitName={visitsOnDay(trip.brief, i)[0]?.visit.destination.name} onOpen={() => openDay(d)} />
              </li>
            ))}
          </ul>
        </section>

        <section id="ov-stay" className="flex scroll-mt-4 flex-col gap-2.5" aria-labelledby="ov-stay-t">
          <h2 id="ov-stay-t" className={sectionTitle}>
            לינה
          </h2>
          {legs.map((leg, i) => {
            const r = legRange(i)
            const stay = (trip.lodgings ?? []).find((l) => l.checkIn < r.to && l.checkOut > r.from)
            return (
              <a
                key={`${leg.destination.id}-${i}`}
                href={href(`/lodging/${i}`)}
                className={cx('flex items-center gap-3 rounded-card p-3', stay ? 'border border-border bg-surface' : 'border-[1.5px] border-dashed border-accent-2/70 bg-accent-2/6')}
              >
                <span className={cx('flex size-12 shrink-0 items-center justify-center rounded-tile', stay ? 'bg-accent/12 text-accent' : 'bg-accent-2/12 text-accent-2')}>
                  <BedDouble size={22} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-base font-semibold">{stay ? `${stay.name} · ${leg.destination.name}` : `לינה ב${leg.destination.name}`}</span>
                  <span className={cx('text-[13px]', stay ? 'text-muted' : 'text-accent-2')}>
                    {shortDate(r.from)} – {shortDate(r.to)} · {r.nights === 1 ? 'לילה 1' : `${r.nights} לילות`}
                    {stay ? '' : ' · עוד לא נבחרה'}
                  </span>
                </span>
                {stay ? (
                  <ChevronLeft size={18} className="text-muted" aria-hidden="true" />
                ) : (
                  <span className="shrink-0 rounded-xl border-[1.5px] border-accent-2/70 px-3 py-2 text-[13px] font-semibold text-accent-2">בחירה</span>
                )}
              </a>
            )
          })}
        </section>

        <section id="ov-food" className="flex scroll-mt-4 flex-col gap-2.5" aria-labelledby="ov-food-t">
          <div className="flex items-center justify-between gap-2">
            <h2 id="ov-food-t" className={sectionTitle}>
              מסעדות
            </h2>
            <a
              href="https://www.google.com/maps/search/restaurants/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-full bg-accent/12 px-3 text-[13px] font-semibold text-accent"
            >
              <LocateFixed size={15} aria-hidden="true" />
              מסעדות לידי
            </a>
          </div>
          {(trip.restaurants ?? []).length ? (
            <ul className="flex flex-col rounded-card border border-border bg-surface px-3.5">
              {(trip.restaurants ?? []).map((r, i, all) => (
                <li key={r.id} className={cx('flex items-center gap-3 py-2.5', i < all.length - 1 && 'border-b border-border')}>
                  <UtensilsCrossed size={18} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{r.name}</span>
                    <span className="text-xs text-muted">{[r.cuisine, dayName(r.dayId)].filter(Boolean).join(' · ') || 'בלי יום קבוע'}</span>
                  </span>
                  <a
                    href={mapsSearch(`${r.name} ${first?.name ?? ''}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${r.name} בגוגל מפות`}
                    className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-border-strong px-3 text-[13px]"
                  >
                    גוגל
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">עוד לא שמרתם מסעדות.</p>
          )}
          <a href={href('/plan')} className="flex h-12 items-center justify-center gap-1.5 rounded-tile border-[1.5px] border-dashed border-border-strong text-sm font-semibold text-accent">
            <Plus size={16} aria-hidden="true" />
            הוספת מסעדה
          </a>
        </section>

        <section id="ov-move" className="flex scroll-mt-4 flex-col gap-2.5" aria-labelledby="ov-move-t">
          <h2 id="ov-move-t" className={sectionTitle}>
            התניידות בערים
          </h2>
          <ul className="flex flex-col gap-2">
            {legs.map((leg, i) => {
              const mode = cityModeOf(brief, leg.destination.id)
              const rental = brief.rentals?.[leg.destination.id]
              const next = legs[i + 1]
              const ti = brief.legs.findIndex((l) => l.destination.id === leg.destination.id)
              const transfer = ti >= 0 ? brief.transfers?.[ti] : undefined
              return (
                <li key={`${leg.destination.id}-${i}`} className="flex flex-col gap-2">
                  <a href={href(`/city/${i}`)} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-accent/12 text-accent">
                      {mode === 'רכב' ? <Car size={20} aria-hidden="true" /> : <TrainFront size={20} aria-hidden="true" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold">
                        {leg.destination.name} · {mode === 'רכב' ? 'רכב שכור' : mode === 'ציבורית' ? 'תחבורה ציבורית' : mode}
                      </span>
                      <span className={cx('text-xs', mode === 'רכב' && !rental ? 'text-accent-2' : 'text-muted')}>
                        {mode === 'רכב' ? (rental ? `${rental.company} · איסוף: ${rental.pickup}` : 'עדיין לא נבחרה חברת השכרה') : `ימים ${trip.days.indexOf(leg.days[0]) + 1}–${trip.days.indexOf(leg.days[leg.days.length - 1]) + 1}`}
                      </span>
                    </span>
                    <ChevronLeft size={18} className="text-muted" aria-hidden="true" />
                  </a>
                  {next && ti >= 0 && (
                    <a href={href(`/transfer/${ti}`)} className="mx-6 flex h-9 items-center gap-2 border-s-2 border-dashed border-accent/40 ps-3 text-[13px] font-medium text-accent">
                      <TrainFront size={15} aria-hidden="true" />
                      <span className="flex-1">
                        {leg.destination.name} ← {next.destination.name}: {transfer ?? 'איך עוברים?'}
                      </span>
                      <span className="font-semibold">{transfer ? 'שינוי' : 'בחירה'}</span>
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </main>
    </div>
  )
}

function DayRow({ day, n, dest, visitName, onOpen }: { day: Day; n: number; dest: Destination | null | undefined; visitName?: string; onOpen: () => void }) {
  const photo = useCityPhoto(dest)
  const [failed, setFailed] = useState(false)
  const free = day.stops.length === 0 && !visitName
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx('flex w-full items-center gap-3 rounded-2xl p-1.5 text-start', free ? 'border-[1.5px] border-dashed border-accent-2/70 bg-accent-2/6' : 'border border-border bg-surface')}
    >
      {free ? (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-2/12 text-accent-2" aria-hidden="true">
          <Plus size={20} />
        </span>
      ) : photo && !failed ? (
        <img src={photo.src} alt="" onError={() => setFailed(true)} className="size-12 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-water text-accent" aria-hidden="true">
          <MapPin size={20} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cx('text-xs', free ? 'text-accent-2' : 'text-muted')}>
          יום {n} · {weekday(day.date)} {shortDate(day.date)}
        </span>
        <span className={cx('truncate text-[15px] font-semibold', free && 'text-accent-2')}>{free ? 'יום פנוי – תכננו משהו' : visitName ? <>דרך <bdi>{visitName}</bdi></> : day.title || day.city}</span>
      </span>
      {!free && <span className="shrink-0 ps-1.5 text-xs text-muted">{visitName && !day.stops.length ? 'ביקור' : day.stops.length === 1 ? 'עצירה 1' : `${day.stops.length} עצירות`}</span>}
    </button>
  )
}
