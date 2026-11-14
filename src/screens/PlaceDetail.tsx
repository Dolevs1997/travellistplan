import { useId } from 'react'
import { ArrowRight, Navigation } from 'lucide-react'
import PlaceMap from '../components/PlaceMap'
import { IconButton, IconTile, Tag, cx } from '../components/ui'
import { findStop, useTrip } from '../state/TripStore'
import { dayChipLabel, directionsUrl, stopStatus, timeRange, transitLabel } from '../data/helpers'
import { href, navigate } from '../router'

export default function PlaceDetail({ stopId }: { stopId: string }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const found = findStop(trip, stopId)
  const noteId = useId()
  const moveId = useId()

  if (!found) {
    return (
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col items-start gap-4 p-5">
        <IconButton label="חזרה ללו״ז" to="/trip/schedule">
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <p className="text-muted">העצירה לא נמצאה – אולי היא הוסרה.</p>
      </div>
    )
  }

  const { day, stop, index } = found
  const dayIndex = trip.days.indexOf(day)
  const status = stopStatus(trip, day.id, stop.id)
  const leg = index > 0 ? day.stops[index - 1].transitToNext : undefined

  return (
    <div className="fixed inset-0 overflow-hidden bg-map-bg">
      <div className="absolute inset-x-0 top-0 h-[300px]">
        <PlaceMap lat={stop.lat} lng={stop.lng} n={index + 1} status={status} />
      </div>

      <div className="absolute inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-10 mx-auto flex max-w-[528px]">
        <IconButton
          label="חזרה"
          onClick={() => {
            if (window.history.length > 1) window.history.back()
            else navigate('/trip/schedule')
          }}
          variant="floating"
        >
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
      </div>

      <main className="absolute inset-x-0 top-[268px] bottom-0 mx-auto flex max-w-[560px] flex-col gap-3.5 overflow-y-auto rounded-t-sheet border-t border-border bg-surface px-4 pb-6 shadow-sheet">
        <span className="mx-auto mt-3 mb-1 h-[5px] w-10 shrink-0 rounded-full bg-handle" aria-hidden="true" />

        <header className="flex items-center gap-3.5">
          <IconTile kind={stop.kind} size={56} />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-bold">{stop.name}</h1>
            <span className="text-[13px] text-muted">
              {stop.area} · עצירה {index + 1} ביום {dayIndex + 1}
            </span>
          </div>
        </header>

        {(stop.heritage || stop.needsBooking) && (
          <div className="flex flex-wrap gap-1.5">
            {stop.heritage && <Tag tone="accent">אתר מורשת</Tag>}
            {stop.needsBooking && <Tag tone={stop.booked ? 'muted' : 'orange'}>{stop.booked ? 'הוזמן' : 'הזמנה מראש'}</Tag>}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2">
          <Info label="זמן מתוכנן" value={timeRange(stop.start, stop.end)} />
          <Info label="הגעה מהעצירה הקודמת" value={leg ? transitLabel(leg) : 'תחילת היום'} />
          <Info label="שעות פתיחה" value={stop.hours ?? 'לא הוזן'} muted={!stop.hours} />
          {stop.needsBooking ? (
            <Info label="כרטיסים" value={stop.booked ? 'הוזמנו' : 'עדיין לא הוזמנו'} orange={!stop.booked} />
          ) : (
            <Info label="כרטיסים" value="לא נדרשים" />
          )}
        </dl>

        <label htmlFor={noteId} className="flex flex-col gap-1.5 rounded-card border border-border bg-raised px-3.5 py-3 focus-within:border-accent">
          <span className="text-xs font-medium text-muted">הערות</span>
          <textarea
            id={noteId}
            rows={2}
            value={stop.note ?? ''}
            onChange={(e) => dispatch({ type: 'setNote', stopId: stop.id, note: e.target.value })}
            placeholder="מה חשוב לזכור כאן?"
            className="resize-none bg-transparent text-[15px] leading-normal text-text outline-none placeholder:text-muted"
          />
        </label>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <a
            href={directionsUrl(stop)}
            target="_blank"
            rel="noreferrer"
            className="flex h-[52px] items-center justify-center gap-2 rounded-tile bg-accent text-[15px] font-semibold text-on-accent"
          >
            <Navigation size={18} aria-hidden="true" />
            ניווט
          </a>
          <div className="grid grid-cols-2 gap-2">
            {stop.needsBooking ? (
              <button
                type="button"
                onClick={() => dispatch({ type: 'toggleBooked', stopId: stop.id })}
                className="h-12 rounded-tile border border-border-strong text-sm font-medium transition-colors duration-200 ease-out hover:bg-raised"
              >
                {stop.booked ? 'ביטול סימון הזמנה' : 'סימון כהוזמן'}
              </button>
            ) : (
              <a href={href('/trip/schedule')} className="flex h-12 items-center justify-center rounded-tile border border-border-strong text-sm font-medium">
                ללו״ז היום
              </a>
            )}
            <label htmlFor={moveId} className="relative flex h-12 items-center justify-center rounded-tile border border-border-strong text-sm font-medium focus-within:border-accent">
              העברה ליום אחר
              <select
                id={moveId}
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  dispatch({ type: 'moveStop', stopId: stop.id, toDayId: e.target.value })
                  dispatch({ type: 'setDay', dayId: e.target.value })
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">בחירת יום</option>
                {trip.days.map((d, i) =>
                  d.id === day.id ? null : (
                    <option key={d.id} value={d.id}>
                      {dayChipLabel(d, i)} – {d.title}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        </div>
      </main>
    </div>
  )
}

function Info({ label, value, orange, muted }: { label: string; value: string; orange?: boolean; muted?: boolean }) {
  return (
    <div className={cx('flex flex-col gap-1 rounded-card border bg-raised px-3.5 py-3', orange ? 'border-dashed border-accent-2' : 'border-border')}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx('text-[15px] font-semibold', orange && 'text-accent-2', muted && 'font-normal text-muted')}>{value}</dd>
    </div>
  )
}
