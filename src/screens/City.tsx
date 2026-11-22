import { useState } from 'react'
import { ArrowRight, BedDouble, CalendarDays, Car, ChevronLeft, MapPin, Route, TrainFront } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import { addDays } from '../data/brief'
import { shortDate, tripLegs } from '../data/helpers'
import { useCityPhoto } from '../data/cityPhoto'
import { useEditableBrief } from '../data/tripEdit'
import { useTrip } from '../state/TripStore'
import { href, navigate } from '../router'
import { CITY_MODES, cityModeOf } from './EditTrip'

const weekday = (iso: string) => new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(`${iso}T12:00:00`))

/** One city of the trip: where you sleep, how you get around (and a rental car), its days and the way on */
export default function City({ legIndex }: { legIndex: number }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const legs = tripLegs(trip)
  const leg = legs[legIndex]
  const { brief, update } = useEditableBrief(trip, dispatch)
  const photo = useCityPhoto(leg?.destination)
  const [photoFailed, setPhotoFailed] = useState(false)

  if (!leg) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">העיר הזו כבר לא בטיול.</p>
        <button type="button" onClick={() => navigate('/')} className="h-11 rounded-tile bg-accent px-5 font-semibold text-on-accent">
          למסך הבית
        </button>
      </div>
    )
  }

  const dest = leg.destination
  const isLast = legIndex === legs.length - 1
  const nights = Math.max(1, leg.days.length - (isLast ? 1 : 0))
  const checkIn = leg.days[0].date
  const checkOut = addDays(checkIn, nights)
  const stay = (trip.lodgings ?? []).find((l) => l.checkIn < checkOut && l.checkOut > checkIn)
  const mode = cityModeOf(brief, dest.id)
  const rental = brief.rentals?.[dest.id]
  const next = legs[legIndex + 1]
  const transferIndex = brief.legs.findIndex((l) => l.destination.id === dest.id)
  const transfer = transferIndex >= 0 ? brief.transfers?.[transferIndex] : undefined
  const firstDay = trip.days.indexOf(leg.days[0]) + 1
  const openDay = (dayId: string) => {
    dispatch({ type: 'setDay', dayId })
    navigate('/trip/schedule')
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-10">
      <div className="relative h-[260px] bg-water">
        {photo && !photoFailed ? (
          <img src={photo.src} alt={`תמונה של ${dest.name}`} onError={() => setPhotoFailed(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-accent" aria-hidden="true">
            <MapPin size={40} />
          </span>
        )}
        <div className="absolute inset-x-4 top-4 flex justify-between">
          <IconButton label="חזרה" onClick={() => history.back()} className="!rounded-full !border-0 shadow-[var(--float-shadow)]">
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <main className="relative -mt-7 flex flex-col gap-3.5 rounded-t-sheet bg-bg px-5 pt-5">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-accent">
            {legs.length > 1 ? `יעד ${legIndex + 1} מתוך ${legs.length} · ` : ''}
            {dest.kind === 'country' ? 'כל המדינה' : dest.country}
          </span>
          <h1 className="text-[26px] leading-tight font-bold">{dest.name}</h1>
          <span className="text-[13px] text-muted">
            {shortDate(checkIn)} – {shortDate(checkOut)} · {nights === 1 ? 'לילה 1' : `${nights} לילות`}
          </span>
        </header>

        {/* Where you sleep */}
        <a
          href={href(`/lodging/${legIndex}`)}
          className={cx('flex items-center gap-3 rounded-card p-3.5', stay ? 'border border-border bg-surface' : 'border-[1.5px] border-dashed border-accent-2/70 bg-accent-2/6')}
        >
          <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-tile', stay ? 'bg-accent/12 text-accent' : 'bg-accent-2/12 text-accent-2')}>
            <BedDouble size={22} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs text-muted">לינה</span>
            <span className={cx('truncate text-base font-semibold', !stay && 'text-accent-2')}>{stay ? stay.name : 'עוד לא נבחרה'}</span>
            <span className="text-xs text-muted">{stay ? 'שינוי או השוואת מחירים' : 'מפה, המלצות ליד העצירות, Booking ו-Airbnb'}</span>
          </span>
          <ChevronLeft size={18} className={stay ? 'text-muted' : 'text-accent-2'} aria-hidden="true" />
        </a>

        {/* Getting around, and the rental car */}
        <section className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3.5" aria-labelledby="city-move">
          <h2 id="city-move" className="text-[15px] font-semibold">
            התניידות ב{dest.name}
          </h2>
          <div role="radiogroup" aria-labelledby="city-move" className="grid grid-cols-4 gap-1.5">
            {CITY_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => update({ cityTransport: { ...brief.cityTransport, [dest.id]: m } })}
                className={cx(
                  'h-10 rounded-xl text-[13px] transition-colors duration-200 ease-out',
                  mode === m ? 'border-[1.5px] border-accent bg-accent/12 font-semibold text-accent' : 'border border-border-strong bg-surface',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === 'רכב' && (
            <a
              href={href(`/rental/${dest.id}`)}
              className={cx('flex items-center gap-2.5 rounded-[14px] px-3 py-2.5', rental ? 'border border-border bg-raised' : 'border-[1.5px] border-dashed border-accent-2/70 bg-accent-2/6')}
            >
              <Car size={20} className={rental ? 'text-accent' : 'text-accent-2'} aria-hidden="true" />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className={cx('text-sm font-semibold', !rental && 'text-accent-2')}>{rental ? `רכב שכור: ${rental.company}` : 'בחירת חברת השכרה'}</span>
                <span className="text-xs text-muted">{rental ? `איסוף: ${rental.pickup}` : 'השוואת מחירים או מעבר לאתרי החברות'}</span>
              </span>
              <ChevronLeft size={18} className={rental ? 'text-muted' : 'text-accent-2'} aria-hidden="true" />
            </a>
          )}
        </section>

        {/* The days here */}
        <section className="flex flex-col gap-2" aria-labelledby="city-days">
          <div className="flex items-center justify-between">
            <h2 id="city-days" className="text-[15px] font-semibold">
              הימים ב{dest.name}
            </h2>
            <a href={href('/build')} className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-accent">
              <Route size={14} aria-hidden="true" />
              בנייה עצמית
            </a>
          </div>
          <ul className="flex flex-col gap-1.5">
            {leg.days.map((d, i) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => openDay(d.id)}
                  className={cx(
                    'flex h-12 w-full items-center gap-2.5 rounded-[14px] px-3.5 text-start',
                    d.stops.length ? 'border border-border bg-surface' : 'border-[1.5px] border-dashed border-accent-2/60 bg-accent-2/6',
                  )}
                >
                  <CalendarDays size={16} className={d.stops.length ? 'text-accent' : 'text-accent-2'} aria-hidden="true" />
                  <span className="flex-1 text-sm font-medium">
                    יום {firstDay + i} · {weekday(d.date)} {shortDate(d.date)}
                  </span>
                  <span className={cx('text-xs', d.stops.length ? 'text-muted' : 'text-accent-2')}>
                    {d.stops.length ? (d.stops.length === 1 ? 'עצירה אחת' : `${d.stops.length} עצירות`) : 'פנוי'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* On to the next city */}
        {next && transferIndex >= 0 && (
          <a href={href(`/transfer/${transferIndex}`)} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-accent/12 text-accent">
              <TrainFront size={20} aria-hidden="true" />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-xs text-muted">ממשיכים ל{next.destination.name} · {shortDate(checkOut)}</span>
              <span className={cx('text-[15px] font-semibold', !transfer && 'text-accent-2')}>{transfer ? `מעבר: ${transfer}` : 'איך עוברים? בחירה'}</span>
            </span>
            <ChevronLeft size={18} className="text-muted" aria-hidden="true" />
          </a>
        )}
      </main>
    </div>
  )
}
