import { useEffect, useRef, useState } from 'react'
import { Check, Globe, MapPin, Navigation, Phone, Plus, Ticket } from 'lucide-react'
import PlaceMap from '../components/PlaceMap'
import { PlaceGallery, PlaceSections } from '../components/PlaceInfo'
import { Action } from '../components/PlaceParts'
import { AddSheet, nextSlot } from './AddPlaces'
import { hoursOn, restaurant, type RestaurantDetails } from '../data/eat'
import { kindOf, matchTrip, toPlaceInfo } from '../data/explore'
import { DEFAULT_VISIT, dayDestination, directionsUrl, fromMin, shortDate } from '../data/helpers'
import { detailsToExplore, photosFor, sellsTickets } from '../data/placeFull'
import { KIND_LABEL, placeDetails, type PlaceDetails } from '../data/places'
import type { Stop } from '../data/types'
import { href, navigate } from '../router'
import { useTrip } from '../state/TripStore'

/**
 * Any place picked on the map (not in the trip yet): photos, rating and reviews, hours on your day,
 * what to do, tickets, navigation – and adding it to a day.
 */
export default function Spot({ id, dayId }: { id: string; dayId?: string }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const [google, setGoogle] = useState<RestaurantDetails | null | undefined>(undefined)
  const [wiki, setWiki] = useState<PlaceDetails | null | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState('')
  const tickets = useRef<HTMLElement>(null)
  const day = trip.days.find((d) => d.id === dayId) ?? trip.days.find((d) => d.id === state.activeDayId) ?? trip.days[0]

  useEffect(() => {
    let live = true
    restaurant(id)
      .then((g) => {
        if (!live) return
        setGoogle(g)
        // Wikipedia's summary, facts and "what to do", found by the place's name
        placeDetails(toPlaceInfo(detailsToExplore(g)))
          .then((w) => live && setWiki(w))
          .catch(() => live && setWiki(null))
      })
      .catch(() => live && (setGoogle(null), setWiki(null)))
    return () => {
      live = false
    }
  }, [id])

  const back = () => (window.history.length > 1 ? window.history.back() : navigate('/nearby'))

  if (google === null)
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">לא הצלחנו לטעון את המקום כרגע.</p>
        <button type="button" onClick={back} className="h-11 rounded-tile bg-accent px-5 font-semibold text-on-accent">
          חזרה
        </button>
      </div>
    )
  if (!google)
    return (
      <p role="status" className="p-10 text-center text-sm text-muted">
        טוענים את המקום…
      </p>
    )

  const place = detailsToExplore(google)
  const kind = kindOf(place)
  // Tickets: judged like a trip stop of the same kind
  const asStop = { kind, needsBooking: false } as Stop
  const ticketed = sellsTickets(asStop, google.types)
  const inTrip = matchTrip([place], trip.days).get(place.id)
  const city = day ? (dayDestination(trip, day)?.name ?? day.city) : ''
  const hours = day ? hoursOn(google.hours, day.date) : undefined

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-28">
      <PlaceGallery photos={photosFor(google, wiki)} name={google.name} onBack={back} fallback={<PlaceMap lat={google.lat} lng={google.lng} />} />

      <header className="flex flex-col gap-1.5 px-4 pt-3.5">
        <h1 className="text-[26px] leading-tight font-bold">{google.name}</h1>
        <span className="text-sm text-muted">
          {google.rating ? (
            <>
              <b className="text-text">★ {google.rating.toFixed(1)}</b>
              {google.ratingCount ? ` (${google.ratingCount.toLocaleString('en-US')})` : ''} ·{' '}
            </>
          ) : null}
          {google.typeLabel ?? KIND_LABEL[kind]}
        </span>
        {day && (
          <span className="text-sm">
            {hours ? (
              <>
                שעות ב{shortDate(day.date)} (יום {trip.days.indexOf(day) + 1}): <bdi>{hours}</bdi>
              </>
            ) : (
              <span className="text-muted">שעות הפתיחה לא ידועות</span>
            )}
          </span>
        )}
      </header>

      <div className="flex gap-2 px-4 pt-3.5">
        <Action href={directionsUrl(google)} icon={<Navigation size={20} />} label="ניווט" external />
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
        {google.website && <Action href={google.website} icon={<Globe size={20} />} label="אתר" external />}
        {google.phone && <Action href={`tel:${google.phone.replace(/\s/g, '')}`} icon={<Phone size={20} />} label="התקשרו" />}
      </div>

      <PlaceSections google={google} wiki={wiki} ticketsRef={tickets} tickets={ticketed ? { name: google.name, city, website: google.website } : undefined} />

      <section aria-label="מיקום" className="flex flex-col gap-2.5 px-4 pt-5">
        <h2 className="text-[17px] font-bold">מיקום</h2>
        <div className="h-44 overflow-hidden rounded-2xl border border-border">
          <PlaceMap lat={google.lat} lng={google.lng} />
        </div>
        {google.address && (
          <a href={google.mapsUrl ?? directionsUrl(google)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm">
            <MapPin size={16} className="shrink-0 text-accent" aria-hidden="true" />
            <bdi className="truncate">{google.address}</bdi>
          </a>
        )}
      </section>

      <p className="px-4 pt-5 text-center text-[11px] text-muted">
        תמונות, דירוגים וביקורות: Google{wiki?.summary && !google.summary ? ' · מידע: ויקיפדיה' : ''}
      </p>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] border-t border-border bg-bg px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {inTrip ? (
          <a
            href={href(`/place/${inTrip.stop.id}`)}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-accent text-base font-semibold text-accent"
          >
            <Check size={18} aria-hidden="true" />
            בטיול: יום {inTrip.dayIndex + 1} · {inTrip.stop.start}
          </a>
        ) : added ? (
          <p role="status" className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-accent/10 text-[15px] font-semibold text-accent">
            <Check size={18} aria-hidden="true" />
            {added}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-on-accent"
          >
            <Plus size={18} aria-hidden="true" />
            הוספה לטיול
          </button>
        )}
      </div>

      {adding && day && (
        <AddSheet
          place={place}
          days={trip.days}
          initialDayId={day.id}
          defaultMinutes={DEFAULT_VISIT[kind]}
          onAdd={(d, start, minutes) => {
            const isNext = start === nextSlot(d, place).start
            dispatch({ type: 'addPlace', dayId: d.id, place: toPlaceInfo(place), minutes, ...(isNext ? {} : { start: fromMin(start) }) })
            setAdded(`נוסף ליום ${trip.days.indexOf(d) + 1} · ${fromMin(start)}`)
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
