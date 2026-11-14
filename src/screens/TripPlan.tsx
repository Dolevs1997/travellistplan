import { useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { IconButton } from '../components/ui'
import {
  ActivitySection,
  DateRangeFields,
  LodgingSection,
  RestaurantSection,
  Section,
  validRange,
  type DayOption,
} from '../components/PlanSections'
import { isoRange, shortDate } from '../data/helpers'
import { useTrip } from '../state/TripStore'

/** Trip details: dates, lodging, restaurants and activities, editable any time. */
export default function TripPlan() {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const first = trip.days[0]?.date ?? ''
  const last = trip.days[trip.days.length - 1]?.date ?? ''
  const [start, setStart] = useState(first)
  const [end, setEnd] = useState(last)

  const city = trip.destination?.name ?? ''
  const days: DayOption[] = trip.days.map((d, i) => ({ id: d.id, label: `יום ${i + 1} · ${shortDate(d.date)}` }))

  const changed = start !== first || end !== last
  const keep = new Set(validRange(start, end) ? isoRange(start, end) : [])
  const lostStops = changed ? trip.days.filter((d) => !keep.has(d.date)).reduce((n, d) => n + d.stops.length, 0) : 0

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col gap-4 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <IconButton label="חזרה למפת הטיול" to="/trip">
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl font-bold">פרטי הטיול</h1>
          <span className="text-[13px] text-muted">
            {trip.name}
            {trip.destination ? ` · ${trip.destination.country}` : ''}
          </span>
        </div>
      </header>

      <Section icon={CalendarDays} title="תאריכים">
        <DateRangeFields
          start={start}
          end={end}
          onChange={(s, e) => {
            setStart(s)
            setEnd(e)
          }}
          note={
            changed && (
              <div className="flex flex-col gap-2">
                {lostStops > 0 && (
                  <p role="alert" className="rounded-card border border-dashed border-accent-2 bg-accent-2/6 px-3 py-2 text-[13px] text-accent-2">
                    {lostStops} עצירות בימים שיוצאים מהטווח יימחקו.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!validRange(start, end)}
                    onClick={() => dispatch({ type: 'setTripDates', startDate: start, endDate: end })}
                    className="h-11 rounded-tile bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-40"
                  >
                    עדכון תאריכים
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStart(first)
                      setEnd(last)
                    }}
                    className="h-11 rounded-tile border border-border-strong text-[15px] font-medium"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )
          }
        />
      </Section>

      <LodgingSection
        items={trip.lodgings ?? []}
        onAdd={(item) => dispatch({ type: 'addLodging', item })}
        onRemove={(id) => dispatch({ type: 'removeExtra', list: 'lodgings', id })}
        city={city}
        defaultIn={first}
        defaultOut={last}
      />
      <RestaurantSection
        items={trip.restaurants ?? []}
        onAdd={(item) => dispatch({ type: 'addRestaurant', item })}
        onRemove={(id) => dispatch({ type: 'removeExtra', list: 'restaurants', id })}
        city={city}
        days={days}
      />
      <ActivitySection
        items={trip.activities ?? []}
        onAdd={(item) => dispatch({ type: 'addActivity', item })}
        onRemove={(id) => dispatch({ type: 'removeExtra', list: 'activities', id })}
        city={city}
        days={days}
      />
    </div>
  )
}
