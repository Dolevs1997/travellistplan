import { useState } from 'react'
import { ArrowLeft, Bell, MapPin, Plus, Search } from 'lucide-react'
import MiniRoute from '../components/MiniRoute'
import { BottomNav, Fab, IconButton, ScreenHeader, Tag, cx } from '../components/ui'
import { otherTrips } from '../data/mockTrip'
import { countdownLabel, daysUntil, tripRange, tripStats } from '../data/helpers'
import { useTrip } from '../state/TripStore'
import { navigate } from '../router'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  if (h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

export default function Home() {
  const { state, dispatch } = useTrip()
  // The featured card shows the example trip (or the first trip that has a destination)
  const trip = state.trips.find((t) => t.id === 'lisbon-porto') ?? state.trips.find((t) => t.destination && t.days.length) ?? state.trips[0]
  const myTrips = state.trips.filter((t) => t.id !== trip.id)
  const stats = tripStats(trip)
  const hasRoute = trip.days.some((d) => d.stops.length > 0)

  const openTrip = (id: string) => {
    dispatch({ type: 'setActiveTrip', tripId: id })
    navigate('/trip')
  }
  const newTrip = () => {
    dispatch({ type: 'createTrip', id: `trip-${Date.now().toString(36)}` })
    navigate('/trip')
  }
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2200)
  }

  return (
    <div className="mx-auto min-h-full max-w-[560px] px-5 pt-5 pb-[180px]">
      <div className="flex flex-col gap-5">
        <ScreenHeader
          eyebrow={greeting()}
          title="לאן הפעם?"
          action={
            <IconButton label="התראות – יש חדשות" onClick={() => flash('אין התראות חדשות מלבד תזכורת: כרטיסים למגדל בלם')} className="relative">
              <Bell size={20} aria-hidden="true" />
              <span className="absolute top-2.5 left-[11px] size-2 rounded-full bg-accent-2 ring-2 ring-surface" />
            </IconButton>
          }
        />

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) flash(`החיפוש של "${query.trim()}" יגיע בקרוב`)
          }}
        >
          <label className="flex h-[52px] items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 text-muted focus-within:border-accent">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">חיפוש יעד</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חפשו עיר, מדינה או מקום"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
            />
          </label>
        </form>

        <article className="overflow-hidden rounded-phone border border-border bg-surface">
          {hasRoute && trip.days.length > 0 && (
            <div className="relative">
              <MiniRoute trip={trip} />
              <span className="absolute top-3 right-3 flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-surface/92 px-3 text-xs font-medium">
                <span className="size-1.5 rounded-full bg-accent" />
                {countdownLabel(daysUntil(trip.days[0].date))}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-muted">הטיול הבא</span>
                <h2 className="text-[17px] font-semibold">{trip.name}</h2>
                <span className="text-[13px] text-muted">
                  {trip.days.length ? `${tripRange(trip)} · ${trip.days.length} ימים` : 'עוד לא נבחר יעד'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => openTrip(trip.id)}
                aria-label={`פתיחת הטיול ${trip.name}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-accent text-on-accent transition-transform duration-200 ease-out hover:scale-105"
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <Stat value={stats.stops} label="עצירות" />
              <Stat value={stats.cities} label="ערים" />
              <Stat value={stats.unplanned} label="ימים פנויים" orange />
            </dl>
          </div>
        </article>

        <section className="flex flex-col gap-3" aria-labelledby="other-trips">
          <div className="flex items-center justify-between">
            <h2 id="other-trips" className="text-lg font-semibold">
              טיולים נוספים
            </h2>
            <button type="button" onClick={() => flash('אין עוד טיולים מעבר לאלה')} className="flex min-h-11 items-center text-[13px] font-medium text-accent">
              הכל
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {myTrips.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTrip(t.id)}
                  className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-2.5 text-start transition-colors duration-200 ease-out hover:border-border-strong"
                >
                  <span
                    className={cx(
                      'flex size-11 shrink-0 items-center justify-center rounded-tile',
                      t.destination ? 'bg-water text-accent' : 'border-[1.5px] border-dashed border-accent-2 text-accent-2',
                    )}
                  >
                    <MapPin size={20} aria-hidden="true" />
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-base font-semibold">{t.name}</span>
                    <span className={cx('text-[13px]', t.destination ? 'text-muted' : 'text-accent-2')}>
                      {t.destination ? `${t.destination.country} · ${t.days.length} ימים` : 'עוד לא נבחר יעד'}
                    </span>
                  </span>
                  <Tag tone="muted">טיוטה</Tag>
                </button>
              </li>
            ))}
            {otherTrips.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => flash(`${t.name} עדיין בטיוטה`)}
                  className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-2.5 text-start transition-colors duration-200 ease-out hover:border-border-strong"
                >
                  <span
                    className={cx(
                      'flex size-11 shrink-0 items-center justify-center rounded-tile',
                      t.tile === 'water' ? 'bg-water text-accent' : 'bg-park text-[#7FD9A8]',
                    )}
                  >
                    <MapPin size={20} aria-hidden="true" />
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-base font-semibold">{t.name}</span>
                    <span className="text-[13px] text-muted">{t.meta}</span>
                  </span>
                  <Tag tone="muted">{t.status}</Tag>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[176px] z-40 flex justify-center px-6">
        {notice && <span className="rounded-full border border-border bg-raised px-4 py-2 text-center text-sm">{notice}</span>}
      </div>

      <Fab label="טיול חדש" onClick={newTrip}>
        <Plus size={26} strokeWidth={2.25} aria-hidden="true" />
      </Fab>
      <BottomNav active="home" />
    </div>
  )
}

function Stat({ value, label, orange }: { value: number; label: string; orange?: boolean }) {
  return (
    <div className={cx('flex flex-col-reverse gap-0.5 rounded-tile bg-raised px-3 py-2.5', orange && 'border border-dashed border-accent-2/55')}>
      <dt className={cx('text-xs', orange ? 'text-accent-2' : 'text-muted')}>{label}</dt>
      <dd className={cx('text-lg font-semibold', orange && 'text-accent-2')}>{value}</dd>
    </div>
  )
}
