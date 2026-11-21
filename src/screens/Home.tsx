import { useState } from 'react'
import { ArrowLeft, Bell, Compass, MapPin, Plus, Sparkles, Users } from 'lucide-react'
import DestinationsMap from '../components/DestinationsMap'
import { BottomNav, Fab, IconButton, ScreenHeader, Tag, cx } from '../components/ui'
import { countdownLabel, daysUntil, isoInDays, tripRange, tripStats } from '../data/helpers'
import type { Trip } from '../data/types'
import { isSampleTrip, useTrip } from '../state/TripStore'
import { loadDraft, startWizard } from './TripWizard'
import { roomsText } from '../data/brief'
import { DESTINATIONS } from '../data/destinations'
import { href, navigate } from '../router'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  if (h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

/** An empty trip: the map then shows the whole world and no pins */
const NO_TRIP: Trip = { id: '', name: '', destination: null, days: [], budget: { currency: 'EUR', categories: [] } }

const planned = (t: Trip) => !!t.destination && t.days.length > 0

/** The user's next trip: the soonest upcoming one with a destination, else the latest past one */
function nextTrip(trips: Trip[]) {
  const today = isoInDays(0)
  const withDest = trips.filter(planned)
  const upcoming = withDest.filter((t) => t.days[t.days.length - 1].date >= today).sort((a, b) => a.days[0].date.localeCompare(b.days[0].date))
  return upcoming[0] ?? withDest[withDest.length - 1] ?? null
}

export default function Home() {
  const { state, dispatch } = useTrip()
  // Only the user's own trips: the bundled sample never shows here, and no city is shown before one is chosen
  const own = state.trips.filter((t) => !isSampleTrip(t))
  const trip = nextTrip(own)
  const others = own.filter((t) => t.id !== trip?.id)

  const openTrip = (id: string) => {
    dispatch({ type: 'setActiveTrip', tripId: id })
    navigate('/trip')
  }
  // New trips start in the wizard (where, who, when, how, how much)
  const newTrip = () => startWizard()
  const draft = loadDraft().brief
  const draftWhere = draft.legs.length ? draft.legs.map((l) => l.destination.name).join(' · ') : ''
  const draftWho = `${draft.adults} מבוגרים${draft.children.length ? ` + ${draft.children.length} ילדים` : ''} · ${roomsText(draft.rooms)}`
  const quick = ['country-japan', 'country-thailand', 'country-italy', 'vienna', 'rome']
    .map((id) => DESTINATIONS.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
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
            <IconButton label="התראות" onClick={() => flash('אין התראות חדשות')}>
              <Bell size={20} aria-hidden="true" />
            </IconButton>
          }
        />

        {/* The whole world, with the next trip's route points on it (drag or zoom) */}
        <div className="overflow-hidden rounded-phone border border-border bg-surface">
          <DestinationsMap trip={trip ?? NO_TRIP} tall />
        </div>

        {/* Where and who, then the wizard builds the rest */}
        <div className="overflow-hidden rounded-phone border border-border bg-surface">
          <button type="button" onClick={newTrip} className="flex w-full items-center gap-3 p-4 text-start transition-colors duration-200 ease-out hover:bg-raised">
            <MapPin size={22} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px] text-muted">לאן</span>
              <span className={cx('truncate text-[18px] font-semibold', !draftWhere && 'text-muted')}>{draftWhere || 'עיר, אזור או מדינה'}</span>
            </span>
          </button>
          <hr className="border-border" />
          <button type="button" onClick={newTrip} className="flex w-full items-center gap-3 p-4 text-start transition-colors duration-200 ease-out hover:bg-raised">
            <Users size={22} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px] text-muted">מי נוסע</span>
              <span className="truncate text-[18px] font-semibold">{draftWho}</span>
            </span>
          </button>
          <div className="p-4 pt-0">
            <button type="button" onClick={newTrip} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-tile bg-accent text-[16px] font-semibold text-on-accent">
              בנו לי טיול
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="יעדים מהירים">
          {quick.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => startWizard(d)}
              className="h-10 shrink-0 whitespace-nowrap rounded-full border border-border-strong bg-surface px-4 text-[14px] font-medium hover:border-accent"
            >
              {d.name}
            </button>
          ))}
        </div>

        {/* The AI trip assistant: recommendations from the web and trip changes after approval */}
        <a
          href={href('/chat')}
          className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/8 px-4 py-3 transition-colors duration-200 ease-out hover:bg-accent/12"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent text-on-accent" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold">עוזר הטיול</span>
            <span className="text-[13px] text-muted">המלצות למסעדות ולינה, ובניית הטיול – באישורכם</span>
          </span>
        </a>

        {trip ? <NextTripCard trip={trip} onOpen={() => openTrip(trip.id)} /> : <EmptyCard onNew={newTrip} />}

        {others.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="other-trips">
            <h2 id="other-trips" className="text-lg font-semibold">
              {trip ? 'טיולים נוספים' : 'טיוטות'}
            </h2>
            <ul className="flex flex-col gap-2">
              {others.map((t) => (
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
                        {planned(t) ? `${tripRange(t)} · ${t.days.length} ימים` : 'עוד לא נבחר יעד'}
                      </span>
                    </span>
                    {!t.destination && <Tag tone="muted">טיוטה</Tag>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
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

function NextTripCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  const stats = tripStats(trip)
  return (
    <article className="overflow-hidden rounded-phone border border-border bg-surface">
      <div className="relative">
        <DestinationsMap trip={trip} />
        <span className="absolute top-3 right-3 flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-surface/92 px-3 text-xs font-medium">
          <span className="size-1.5 rounded-full bg-accent" />
          {countdownLabel(daysUntil(trip.days[0].date))}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-muted">הטיול הבא</span>
            <h2 className="text-[17px] font-semibold">{trip.name}</h2>
            <span className="text-[13px] text-muted">
              {tripRange(trip)} · {trip.days.length} ימים
            </span>
          </div>
          <button
            type="button"
            onClick={onOpen}
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
  )
}

/** No destination chosen yet: no city, no map, just an invitation to plan */
function EmptyCard({ onNew }: { onNew: () => void }) {
  return (
    <article className="flex flex-col items-center gap-4 rounded-phone border border-dashed border-border-strong bg-surface px-6 py-9 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-water text-accent" aria-hidden="true">
        <Compass size={26} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-semibold">עוד לא נבחר יעד</h2>
        <p className="max-w-[280px] text-[14px] leading-relaxed text-muted">בחרו לאן נוסעים ומתי, והטיול הבא שלכם יופיע כאן עם מפה וספירה לאחור.</p>
      </div>
      <button type="button" onClick={onNew} className="flex h-12 items-center gap-2 rounded-tile bg-accent px-5 text-[15px] font-semibold text-on-accent">
        <Plus size={18} aria-hidden="true" />
        תכנון טיול חדש
      </button>
    </article>
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
