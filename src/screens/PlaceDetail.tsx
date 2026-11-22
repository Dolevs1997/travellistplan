import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Globe, MapPin, Navigation, Phone, Ticket, Trash2, UtensilsCrossed } from 'lucide-react'
import PlaceMap from '../components/PlaceMap'
import { PlaceGallery, PlaceSections } from '../components/PlaceInfo'
import { Action } from '../components/PlaceParts'
import { Tag } from '../components/ui'
import { hoursOn, type RestaurantDetails } from '../data/eat'
import { dayChipLabel, dayDestination, directionsUrl, shortDate, stopStatus, timeRange, transitLabel } from '../data/helpers'
import { infoFor, photosFor, sellsTickets, stopDetails } from '../data/placeFull'
import { KIND_LABEL, placeDetails, type PlaceDetails } from '../data/places'
import { href, navigate } from '../router'
import { findStop, useTrip } from '../state/TripStore'

/**
 * One stop of the trip: photos, rating and reviews (Google), what it is and what to do there (Wikipedia),
 * hours on the day you're there, navigation, tickets, and the stop's place in the plan.
 */
export default function PlaceDetail({ stopId }: { stopId: string }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const found = findStop(trip, stopId)
  const noteId = useId()
  const moveId = useId()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [google, setGoogle] = useState<RestaurantDetails | null | undefined>(undefined)
  const [wiki, setWiki] = useState<PlaceDetails | null | undefined>(undefined)
  const tickets = useRef<HTMLElement>(null)
  const stop = found?.stop

  useEffect(() => {
    if (!stop) return
    let live = true
    setGoogle(undefined)
    setWiki(undefined)
    stopDetails(stop)
      .then((g) => live && setGoogle(g))
      .catch(() => live && setGoogle(null))
    placeDetails(infoFor(stop))
      .then((w) => live && setWiki(w))
      .catch(() => live && setWiki(null))
    return () => {
      live = false
    }
    // the stop's identity, not every edit (notes, times) to it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id])

  const back = () => (window.history.length > 1 ? window.history.back() : navigate('/trip/schedule'))

  if (!found || !stop) {
    return (
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col items-start gap-4 p-5">
        <button type="button" aria-label="חזרה ללו״ז" onClick={() => navigate('/trip/schedule')} className="flex size-11 items-center justify-center rounded-tile border border-border">
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        <p className="text-muted">העצירה לא נמצאה – אולי היא הוסרה.</p>
      </div>
    )
  }

  const { day, index } = found
  const dayIndex = trip.days.indexOf(day)
  const status = stopStatus(trip, day.id, stop.id)
  const leg = index > 0 ? day.stops[index - 1].transitToNext : undefined
  const city = dayDestination(trip, day)?.name ?? day.city

  const photos = photosFor(google, wiki, stop.info?.image)
  const hours = hoursOn(google?.hours, day.date)
  const website = google?.website ?? wiki?.website ?? stop.info?.website
  const phone = google?.phone ?? stop.info?.phone
  const ticketed = sellsTickets(stop, google?.types)
  const isFood = stop.kind === 'food'


  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-10">
      <PlaceGallery photos={photos} name={stop.name} onBack={back} fallback={<PlaceMap lat={stop.lat} lng={stop.lng} n={index + 1} status={status} />} />

      <header className="flex flex-col gap-1.5 px-4 pt-3.5">
        <h1 className="text-[26px] leading-tight font-bold">{stop.name}</h1>
        <span className="text-sm text-muted">
          {google?.rating ? (
            <>
              <b className="text-text">★ {google.rating.toFixed(1)}</b>
              {google.ratingCount ? ` (${google.ratingCount.toLocaleString('en-US')})` : ''} ·{' '}
            </>
          ) : null}
          {google?.typeLabel ?? KIND_LABEL[stop.kind]}
        </span>
        <span className="text-sm">
          עצירה {index + 1} ביום {dayIndex + 1} · {timeRange(stop.start, stop.end)}
        </span>
        {google !== undefined && (
          <span className="text-sm">
            {hours ? (
              <>
                שעות ב{shortDate(day.date)}: <bdi>{hours}</bdi>
              </>
            ) : (
              <span className="text-muted">שעות הפתיחה לא ידועות</span>
            )}
          </span>
        )}
        {(stop.heritage || stop.needsBooking) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {stop.heritage && <Tag tone="accent">אתר מורשת</Tag>}
            {stop.needsBooking && <Tag tone={stop.booked ? 'muted' : 'orange'}>{stop.booked ? 'הכרטיסים הוזמנו' : 'כדאי להזמין מראש'}</Tag>}
          </div>
        )}
      </header>

      <div className="flex gap-2 px-4 pt-3.5">
        <Action href={directionsUrl(stop)} icon={<Navigation size={20} />} label="ניווט" external />
        {ticketed && (
          <button
            type="button"
            onClick={() => tickets.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex h-[62px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[14px] border border-border bg-surface text-xs font-medium"
          >
            <Ticket size={20} className="text-accent" aria-hidden="true" />
            כרטיסים
          </button>
        )}
        {website && <Action href={website} icon={<Globe size={20} />} label="אתר" external />}
        {phone && <Action href={`tel:${phone.replace(/\s/g, '')}`} icon={<Phone size={20} />} label="התקשרו" />}
      </div>

      {isFood && google && (
        <a href={href(`/restaurant/${google.id}/${day.id}`)} className="mx-4 mt-3 flex h-12 items-center justify-center gap-2 rounded-tile bg-accent text-[15px] font-semibold text-on-accent">
          <UtensilsCrossed size={18} aria-hidden="true" />
          תפריט, תמונות וביקורות
        </a>
      )}

      <PlaceSections
        google={google}
        wiki={wiki}
        ticketsRef={tickets}
        tickets={
          ticketed
            ? {
                name: stop.name.split(/ [–-] /)[0],
                city,
                website,
                needsBooking: stop.needsBooking,
                booked: stop.booked,
                onBooked: () => {
                  // Marking it booked also marks it as one that needed booking
                  if (!stop.needsBooking) dispatch({ type: 'setNeedsBooking', stopId: stop.id, value: true })
                  dispatch({ type: 'toggleBooked', stopId: stop.id })
                },
              }
            : undefined
        }
      />

      <section aria-label="בתכנון" className="flex flex-col gap-2.5 px-4 pt-5">
        <h2 className="text-[17px] font-bold">בתכנון</h2>
        <dl className="grid grid-cols-2 gap-2">
          <Info label="זמן מתוכנן" value={timeRange(stop.start, stop.end)} />
          <Info label="הגעה מהעצירה הקודמת" value={leg ? transitLabel(leg) : 'תחילת היום'} />
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
        <div className="grid grid-cols-2 gap-2">
          <a href={href('/trip/schedule')} className="flex h-12 items-center justify-center rounded-tile border border-border-strong text-sm font-medium">
            ללו״ז היום
          </a>
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
        {confirmRemove ? (
          <div role="alertdialog" aria-labelledby="remove-q" className="flex flex-col gap-2 rounded-card border border-dashed border-accent-2 bg-accent-2/6 p-3">
            <p id="remove-q" className="text-[14px] font-medium">
              להסיר את {stop.name} מהלו״ז של יום {dayIndex + 1}?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  dispatch({ type: 'removeStop', stopId: stop.id })
                  navigate('/trip/schedule')
                }}
                className="h-11 rounded-tile bg-accent-2 text-[14px] font-semibold text-on-accent-2"
              >
                כן, להסיר
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className="h-11 rounded-tile border border-border-strong text-[14px] font-medium">
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong text-[14px] font-medium text-accent-2"
          >
            <Trash2 size={18} aria-hidden="true" />
            הסרה מהלו״ז
          </button>
        )}
      </section>

      <section aria-label="מיקום" className="flex flex-col gap-2.5 px-4 pt-5">
        <h2 className="text-[17px] font-bold">מיקום</h2>
        {photos.length > 0 && (
          <div className="h-44 overflow-hidden rounded-2xl border border-border">
            <PlaceMap lat={stop.lat} lng={stop.lng} n={index + 1} status={status} />
          </div>
        )}
        <a href={google?.mapsUrl ?? directionsUrl(stop)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm">
          <MapPin size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <bdi className="truncate">{google?.address ?? stop.area ?? city}</bdi>
        </a>
      </section>

      <p className="px-4 pt-5 text-center text-[11px] text-muted">
        {google ? 'תמונות, דירוגים וביקורות: Google' : ''}
        {google && wiki?.summary ? ' · ' : ''}
        {wiki?.summary ? 'מידע: ויקיפדיה' : ''}
      </p>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-tile bg-raised px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-[14px] font-semibold">{value}</dd>
    </div>
  )
}
