import { useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, MapPin, Trash2 } from 'lucide-react'
import BlankMap from '../components/BlankMap'
import { IconButton } from '../components/ui'
import {
  ActivitySection,
  DateRangeFields,
  DestinationPicker,
  LodgingSection,
  RestaurantSection,
  Section,
  validRange,
  type DayOption,
} from '../components/PlanSections'
import { isoInDays, isoRange, shortDate } from '../data/helpers'
import type { Activity, Destination, Lodging, SavedRestaurant } from '../data/types'
import { useTrip } from '../state/TripStore'
import { navigate } from '../router'

/**
 * A new trip: no city on the map until it's created. Pick the destination and the
 * departure/return dates, and optionally add lodging, restaurants and activities.
 */
export default function NewTrip() {
  const { state, dispatch } = useTrip()
  const { trip } = state

  const [destination, setDestination] = useState<Destination | null>(null)
  const [start, setStart] = useState(isoInDays(30))
  const [end, setEnd] = useState(isoInDays(34))
  const [lodgings, setLodgings] = useState<Lodging[]>([])
  const [restaurants, setRestaurants] = useState<SavedRestaurant[]>([])
  const [activities, setActivities] = useState<Activity[]>([])

  const datesOk = validRange(start, end)
  // Day ids match the ones the store creates for these dates
  const days: DayOption[] = useMemo(
    () => (datesOk ? isoRange(start, end).map((date, i) => ({ id: `${trip.id}-${date}`, label: `יום ${i + 1} · ${shortDate(date)}` })) : []),
    [datesOk, start, end, trip.id],
  )
  const city = destination?.name ?? ''
  const ready = !!destination && datesOk

  const create = () => {
    if (!destination || !datesOk) return
    dispatch({ type: 'setupTrip', destination, startDate: start, endDate: end, extras: { lodgings, restaurants, activities } })
  }

  return (
    <div className="mx-auto min-h-full max-w-[560px] pb-[120px]">
      <div className="relative h-[150px] overflow-hidden">
        <BlankMap />
        <div className="absolute inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-10 flex items-center gap-2">
          <IconButton label="חזרה למסך הבית" to="/" variant="floating">
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <div className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-tile border border-border bg-surface/92 px-3">
            <span className="truncate text-[15px] font-semibold">{destination ? `טיול ל${destination.name}` : 'טיול חדש'}</span>
            {!destination && <span className="shrink-0 rounded-full bg-accent-2/12 px-2.5 py-0.5 text-xs font-semibold text-accent-2">ללא יעד</span>}
          </div>
          <IconButton
            label="מחיקת הטיול"
            variant="floating"
            onClick={() => {
              dispatch({ type: 'deleteTrip', tripId: trip.id })
              navigate('/')
            }}
          >
            <Trash2 size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="relative -mt-6 flex flex-col gap-4 rounded-t-sheet border-t border-border bg-bg px-4 pt-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-bold">תכנון טיול חדש</h1>
          <p className="text-[13px] text-muted">המפה תתמקד ביעד רק אחרי יצירת הטיול. לינה, מסעדות ופעילויות אפשר להוסיף גם אחר כך.</p>
        </header>

        <Section icon={MapPin} title="לאן נוסעים?" hint={destination ? `נבחר: ${destination.name}, ${destination.country}` : 'בחרו עיר מהרשימה'}>
          <DestinationPicker value={destination} onChange={setDestination} />
        </Section>

        <Section icon={CalendarDays} title="מתי?">
          <DateRangeFields
            start={start}
            end={end}
            minStart={isoInDays(0)}
            onChange={(s, e) => {
              setStart(s)
              setEnd(e)
            }}
          />
        </Section>

        <LodgingSection
          items={lodgings}
          onAdd={(l) => setLodgings((x) => [...x, l])}
          onRemove={(id) => setLodgings((x) => x.filter((l) => l.id !== id))}
          city={city}
          defaultIn={start}
          defaultOut={end}
        />
        <RestaurantSection
          items={restaurants}
          onAdd={(r) => setRestaurants((x) => [...x, r])}
          onRemove={(id) => setRestaurants((x) => x.filter((r) => r.id !== id))}
          city={city}
          days={days}
        />
        <ActivitySection
          items={activities}
          onAdd={(a) => setActivities((x) => [...x, a])}
          onRemove={(id) => setActivities((x) => x.filter((a) => a.id !== id))}
          city={city}
          days={days}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[560px] border-t border-border bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={!ready}
          onClick={create}
          className="h-[52px] w-full rounded-tile bg-accent text-[15px] font-semibold text-on-accent transition-opacity duration-200 ease-out disabled:opacity-40"
        >
          {!destination ? 'בחרו יעד כדי להמשיך' : !datesOk ? 'בדקו את התאריכים' : `יצירת טיול ל${destination.name} · ${days.length} ימים`}
        </button>
      </div>
    </div>
  )
}
