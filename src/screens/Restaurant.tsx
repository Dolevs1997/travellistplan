import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarCheck, Check, Globe, Images, MapPin, Navigation, Phone, Plus, UtensilsCrossed } from 'lucide-react'
import { Action, LinkButton, Review, Stars } from '../components/PlaceParts'
import { cx } from '../components/ui'
import { FACT_LABEL } from '../data/placeLabels'
import { MEALS, MEAL_IDS, hoursOn, mealPlan, nearestStopText, previewMeal, priceSigns, restaurant, restaurantInfo, type Meal, type RestaurantDetails } from '../data/eat'
import { directionsUrl, fromMin, shortDate, timeRange } from '../data/helpers'
import { googlePhoto } from '../data/lodging'
import { findVisit, nextInVisit } from '../data/visits'
import { navigate } from '../router'
import { useTrip } from '../state/TripStore'


/**
 * One restaurant: photos, rating and reviews, menu links, what it offers, and where it is.
 * Opened from "where to eat" with a day and meal (then it can be added) or from the schedule.
 */
export default function Restaurant({ id, dayId, meal, visitId }: { id: string; dayId?: string; meal?: string; visitId?: string }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const [r, setR] = useState<RestaurantDetails | null>(null)
  const [failed, setFailed] = useState(false)
  const [photo, setPhoto] = useState(0)
  const [added, setAdded] = useState(false)
  const gallery = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    restaurant(id)
      .then((d) => live && setR(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [id])

  const day = trip.days.find((d) => d.id === dayId)
  const dayIndex = day ? trip.days.indexOf(day) : -1
  const mealId = MEAL_IDS.includes(meal as Meal) ? (meal as Meal) : undefined
  // Where this restaurant already is in the trip
  const inTrip = trip.days.flatMap((d, i) => d.stops.filter((s) => s.info?.ref === id).map((s) => ({ s, i })))[0]
  const back = () => (history.length > 1 ? history.back() : navigate('/trip/schedule'))

  const show = (i: number) => {
    const el = gallery.current
    if (!el) return
    el.scrollTo({ left: -i * el.clientWidth, behavior: 'smooth' }) // RTL: scrolling goes negative
    setPhoto(i)
  }

  if (failed)
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">לא הצלחנו לטעון את פרטי המסעדה כרגע.</p>
        <button type="button" onClick={back} className="h-11 rounded-tile bg-accent px-5 font-semibold text-on-accent">
          חזרה
        </button>
      </div>
    )
  if (!r)
    return (
      <p role="status" className="p-10 text-center text-sm text-muted">
        טוענים את המסעדה…
      </p>
    )

  const facts = FACT_LABEL.filter(([k]) => r.facts[k])
  const hours = day ? hoursOn(r.hours, day.date) : undefined
  const cityCenter = day?.destination ?? trip.destination ?? r
  const visit = findVisit(trip.brief, visitId)
  const plan = day && visit ? { ...nextInVisit(day, visit, r), near: visit.visit.destination, nearName: visit.visit.destination.name } : day && mealId ? mealPlan(day, mealId, cityCenter) : null
  const pre = day && plan && mealId ? previewMeal(day, plan, r, MEALS[mealId].minutes) : null
  const current = r.gallery[photo]
  const reserveUrl = r.facts.reservable ? (r.website ?? r.mapsUrl) : undefined

  const add = () => {
    if (!day || !plan || !pre || !mealId) return
    dispatch({ type: 'insertPlace', dayId: day.id, place: restaurantInfo(r), index: plan.index, start: fromMin(pre.start), minutes: MEALS[mealId].minutes, ...(visit ? { visitId: visit.visit.id } : {}) })
    setAdded(true)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-28">
      <div className="relative h-[290px] shrink-0 bg-raised">
        {r.gallery.length ? (
          <div
            ref={gallery}
            className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
            onScroll={(e) => {
              const el = e.currentTarget
              const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth)
              if (i !== photo) setPhoto(i)
            }}
            aria-label="תמונות המסעדה"
            role="region"
          >
            {r.gallery.map((g, i) => (
              <img key={g.name} src={googlePhoto(g.name, 960)} alt={`${r.name} – תמונה ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} className="h-full w-full shrink-0 snap-center object-cover" />
            ))}
          </div>
        ) : (
          <span className="flex h-full items-center justify-center text-accent">
            <UtensilsCrossed size={40} aria-hidden="true" />
          </span>
        )}
        <button type="button" aria-label="חזרה" onClick={back} className="absolute top-3.5 right-3.5 flex size-[42px] items-center justify-center rounded-full bg-surface/94 text-text shadow">
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        {r.gallery.length > 0 && (
          <span className="absolute bottom-3 left-3 flex h-[26px] items-center gap-1.5 rounded-full bg-black/65 px-2.5 text-xs text-white">
            <Images size={13} aria-hidden="true" />
            {photo + 1} / {r.gallery.length}
          </span>
        )}
        {current?.author && (
          <a href={current.authorUrl} target="_blank" rel="noopener noreferrer" className="absolute right-3.5 bottom-3.5 max-w-[55%] truncate text-[10px] text-white/90 drop-shadow">
            תמונה: {current.author}
          </a>
        )}
      </div>

      {r.gallery.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-2">
          {r.gallery.map((g, i) => (
            <button key={g.name} type="button" aria-label={`תמונה ${i + 1}`} aria-pressed={i === photo} onClick={() => show(i)} className="shrink-0">
              <img
                src={googlePhoto(g.name, 160)}
                alt=""
                loading="lazy"
                className={cx('size-16 rounded-xl object-cover', i === photo && 'outline-[2.5px] -outline-offset-[2.5px] outline-accent outline-solid')}
              />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 px-4 pt-3.5">
        <h1 className="text-[26px] leading-tight font-bold">{r.name}</h1>
        <span className="text-sm text-muted">
          {r.rating ? (
            <>
              <b className="text-text">★ {r.rating.toFixed(1)}</b>
              {r.ratingCount ? ` (${r.ratingCount.toLocaleString('en-US')})` : ''}
            </>
          ) : null}
          {[r.typeLabel, priceSigns(r.price)].filter(Boolean).map((x) => ` · ${x}`)}
        </span>
        {day && (
          <span className="text-sm">
            {hours ? (
              <>
                ביום {dayIndex + 1} ({shortDate(day.date)}): <bdi>{hours}</bdi>
              </>
            ) : (
              <span className="text-muted">שעות הפתיחה לא ידועות</span>
            )}
          </span>
        )}
        {r.priceRange && (
          <span className="text-sm text-muted">
            מחיר לאדם: <bdi>{r.priceRange}</bdi>
          </span>
        )}
        {r.summary && <p className="pt-1 text-sm leading-relaxed">{r.summary}</p>}
      </div>

      <div className="flex gap-2 px-4 pt-3.5">
        {r.phone && <Action href={`tel:${r.phone.replace(/\s/g, '')}`} icon={<Phone size={20} />} label="התקשרו" />}
        {reserveUrl && <Action href={reserveUrl} icon={<CalendarCheck size={20} />} label="הזמנת מקום" external />}
        <Action href={directionsUrl(r)} icon={<Navigation size={20} />} label="ניווט" external />
        {r.website && <Action href={r.website} icon={<Globe size={20} />} label="אתר" external />}
      </div>

      <section aria-label="תפריט" className="flex flex-col gap-2.5 px-4 pt-5">
        <h2 className="text-[17px] font-bold">תפריט</h2>
        <div className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-surface p-3.5">
          <span className="flex items-center gap-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <UtensilsCrossed size={20} aria-hidden="true" />
            </span>
            <span className="text-[13px] leading-relaxed text-muted">התפריט המלא, עם מחירים ותמונות של המנות – באתר המסעדה ובגוגל מפות.</span>
          </span>
          <div className="flex gap-2">
            {r.website && <LinkButton href={r.website}>התפריט באתר</LinkButton>}
            {r.mapsUrl && <LinkButton href={r.mapsUrl}>תפריט בגוגל מפות</LinkButton>}
          </div>
        </div>
      </section>

      {facts.length > 0 && (
        <section aria-label="מה כדאי לדעת" className="flex flex-col gap-2.5 px-4 pt-5">
          <h2 className="text-[17px] font-bold">מה כדאי לדעת</h2>
          <div className="flex flex-wrap gap-1.5">
            {facts.map(([k, label]) => (
              <span key={k} className="inline-flex h-8 items-center rounded-full bg-raised px-3 text-xs font-medium">
                {label}
              </span>
            ))}
          </div>
        </section>
      )}

      <section aria-label="דירוג וביקורות" className="flex flex-col gap-2.5 px-4 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">דירוג וביקורות</h2>
          {r.mapsUrl && (
            <a href={r.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-accent">
              כל הביקורות בגוגל
            </a>
          )}
        </div>
        {r.rating ? (
          <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-3.5 py-3">
            <b className="text-[38px] leading-none font-bold">{r.rating.toFixed(1)}</b>
            <span className="flex flex-col gap-1">
              <Stars n={r.rating} />
              <span className="text-xs text-muted">{(r.ratingCount ?? 0).toLocaleString('en-US')} ביקורות בגוגל</span>
            </span>
          </div>
        ) : null}
        {r.reviews.map((rev, i) => (
          <Review key={i} review={rev} />
        ))}
      </section>

      <section aria-label="מיקום" className="flex flex-col gap-2.5 px-4 pt-5">
        <h2 className="text-[17px] font-bold">מיקום</h2>
        <a
          href={r.mapsUrl ?? directionsUrl(r)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
            <MapPin size={20} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            {r.address && <bdi className="truncate text-sm font-semibold">{r.address}</bdi>}
            {day && day.stops.length > 0 && <span className="text-xs font-semibold text-accent">{nearestStopText(r, day.stops)}</span>}
          </span>
        </a>
      </section>

      <p className="px-4 pt-4 text-center text-[11px] text-muted">תמונות, דירוגים וביקורות: Google</p>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] border-t border-border bg-bg px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {inTrip || added ? (
          <button
            type="button"
            onClick={() => {
              const target = inTrip ?? (day ? { i: dayIndex } : undefined)
              if (target) dispatch({ type: 'setDay', dayId: trip.days[target.i].id })
              navigate('/trip/schedule')
            }}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-accent text-base font-semibold text-accent"
          >
            <Check size={18} aria-hidden="true" />
            {inTrip ? `בלו״ז ביום ${inTrip.i + 1} · ${inTrip.s.start}` : 'נוסף ללו״ז'} – לצפייה
          </button>
        ) : pre && mealId && day ? (
          <button
            type="button"
            onClick={add}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent px-3 text-[15px] font-semibold whitespace-nowrap text-on-accent"
          >
            <Plus size={18} className="shrink-0" aria-hidden="true" />
            הוספה {MEALS[mealId].to} ביום {dayIndex + 1} · {timeRange(fromMin(pre.start), fromMin(pre.end))}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate(`/eat/${state.activeDayId ?? trip.days[0]?.id ?? ''}`)}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold text-on-accent"
          >
            <Plus size={18} aria-hidden="true" />
            בחירת יום וארוחה
          </button>
        )}
        {pre?.shift && !inTrip && !added ? <p className="pt-1.5 text-center text-xs text-muted">מה שאחרי הארוחה יזוז ב-{pre.shift} דק׳</p> : null}
      </div>
    </div>
  )
}
