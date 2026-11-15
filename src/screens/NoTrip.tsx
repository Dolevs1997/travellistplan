import { MapPin, Plus } from 'lucide-react'
import { BottomNav, ScreenHeader } from '../components/ui'
import { isSampleTrip, useTrip } from '../state/TripStore'
import { navigate } from '../router'

/** Shown on trip screens (map, schedule, budget…) while no trip is open: no default city. */
export default function NoTrip({ tab }: { tab: 'map' | 'schedule' | 'budget' }) {
  const { state, dispatch } = useTrip()
  const own = state.trips.filter((t) => !isSampleTrip(t))

  const newTrip = () => {
    dispatch({ type: 'createTrip', id: `trip-${Date.now().toString(36)}` })
    navigate('/trip')
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col gap-5 px-5 pt-5 pb-[120px]">
      <ScreenHeader eyebrow={tab === 'budget' ? 'תקציב' : 'הטיול שלי'} title="עוד לא נבחר יעד" />
      <section className="flex flex-col items-center gap-4 rounded-phone border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-raised text-muted" aria-hidden="true">
          <MapPin size={26} />
        </span>
        <p className="max-w-[280px] text-[15px] leading-relaxed text-muted">
          {tab === 'budget' ? 'התקציב יופיע כאן אחרי שתתכננו טיול.' : 'המפה והלו״ז יופיעו כאן אחרי שתבחרו לאן נוסעים.'}
        </p>
        <button
          type="button"
          onClick={newTrip}
          className="flex h-12 items-center gap-2 rounded-tile bg-accent px-5 text-[15px] font-semibold text-on-accent"
        >
          <Plus size={18} aria-hidden="true" />
          תכנון טיול חדש
        </button>
      </section>

      {own.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="open-existing">
          <h2 id="open-existing" className="text-lg font-semibold">
            או פתחו טיול קיים
          </h2>
          <ul className="flex flex-col gap-2">
            {own.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'setActiveTrip', tripId: t.id })
                    navigate(tab === 'budget' ? '/budget' : '/trip')
                  }}
                  className="flex min-h-[52px] w-full items-center justify-between rounded-card border border-border bg-surface px-4 text-start"
                >
                  <span className="text-[15px] font-semibold">{t.name}</span>
                  <span className="text-[13px] text-muted">{t.destination ? `${t.days.length} ימים` : 'ללא יעד'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <BottomNav active={tab} />
    </div>
  )
}
