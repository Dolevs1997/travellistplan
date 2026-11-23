import { useEffect, useState } from 'react'
import { ArrowRight, Check, Plus, Star, UtensilsCrossed } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import {
  MEALS,
  MEAL_IDS,
  eatAvailable,
  hoursOn,
  mealPlan,
  nearestStopText,
  openAt,
  plannedMeal,
  previewMeal,
  priceSigns,
  restaurantInfo,
  restaurantsNear,
  type EatPlace,
  type FoodKind,
  type Meal,
} from '../data/eat'
import { fromMin, shortDate, timeRange } from '../data/helpers'
import { googlePhoto } from '../data/lodging'
import { briefOf } from '../data/tripEdit'
import { findVisit, nextInVisit } from '../data/visits'
import type { Day } from '../data/types'
import { navigate } from '../router'
import { useTrip } from '../state/TripStore'

const KINDS: { id: Exclude<FoodKind, 'any'>; label: string }[] = [
  { id: 'kosher', label: 'כשר' },
  { id: 'vegetarian', label: 'צמחוני' },
  { id: 'seafood', label: 'דגים ופירות ים' },
]

/** The meal that comes next in the day: the first one not planned yet, lunch if all are */
function firstOpenMeal(day: Day): Meal {
  return MEAL_IDS.find((m) => m !== 'breakfast' && !plannedMeal(day, m)) ?? 'lunch'
}

/** Google has no kosher field: only a name that says so counts */
const KOSHER_NAME = /kosher|kasher|כשר/i

const dayPlace = (d: Day) => d.stops.find((s) => s.area)?.area.split(',')[0] || d.destination?.name || d.city

/** Where to eat on a day: pick the meal, see restaurants near where you'll be then, add one to the schedule */
export default function DayFood({ dayId, meal: mealParam, visitId }: { dayId: string; meal?: string; visitId?: string }) {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const brief = briefOf(trip)
  const day = trip.days.find((d) => d.id === dayId) ?? trip.days.find((d) => d.id === state.activeDayId) ?? trip.days[0]
  const dayIndex = trip.days.indexOf(day)
  const city = day?.destination ?? trip.destination ?? { lat: 0, lng: 0 }
  const [meal, setMeal] = useState<Meal>(MEAL_IDS.includes(mealParam as Meal) ? (mealParam as Meal) : day ? firstOpenMeal(day) : 'lunch')
  const [kind, setKind] = useState<FoodKind>(brief.kosher ? 'kosher' : 'any')
  const [openOnly, setOpenOnly] = useState(true)
  const [topRated, setTopRated] = useState(false)
  const [cheap, setCheap] = useState(false)
  const [places, setPlaces] = useState<EatPlace[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [added, setAdded] = useState<{ name: string; start: number; end: number; shift: number } | null>(null)

  // During a few-hours visit: restaurants in that town, after the visit's last stop
  const visit = findVisit(trip.brief, visitId)
  const visitPlace = visit?.visit.destination
  const plan = day && visit && visitPlace ? { ...nextInVisit(day, visit, visitPlace), near: visitPlace, nearName: visitPlace.name } : day ? mealPlan(day, meal, city) : null
  // Kosher places are few: search the whole city for them
  const radius = kind === 'kosher' ? 8000 : visit ? 1500 : 900
  const center = kind === 'kosher' ? (visitPlace ?? city) : (plan?.near ?? city)
  const searchKey = `${meal}|${kind}|${center.lat.toFixed(4)},${center.lng.toFixed(4)}|${radius}`

  useEffect(() => {
    const ctrl = new AbortController()
    setPlaces(null)
    setFailed(false)
    restaurantsNear(kind === 'any' ? meal : kind, center, radius)
      .then((r) => !ctrl.signal.aborted && setPlaces(r))
      .catch(() => !ctrl.signal.aborted && (setFailed(true), setPlaces([])))
    return () => ctrl.abort()
    // searchKey stands for meal, kind, center and radius
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey])

  if (!day || !plan) return <p className="p-6 text-center text-muted">אין ימים בטיול הזה.</p>

  const m = MEALS[meal]
  const planned = plannedMeal(day, meal)
  const all = (places ?? []).filter((p) => {
    const open = openAt(p.periods, day.date, plan.start, m.minutes)
    if (openOnly && open === false) return false
    if (topRated && (p.rating ?? 0) < 4.5) return false
    if (cheap && (p.price ?? 2) > 2) return false
    return true
  })
  // Kosher: places named kosher first; the rest only under a warning
  const list = kind === 'kosher' ? all.filter((p) => KOSHER_NAME.test(p.name)) : all
  const maybe = kind === 'kosher' ? all.filter((p) => !KOSHER_NAME.test(p.name)) : []
  const back = () => (history.length > 1 ? history.back() : navigate('/trip/schedule'))

  const add = (p: EatPlace) => {
    const pre = previewMeal(day, plan, p, m.minutes)
    dispatch({ type: 'insertPlace', dayId: day.id, place: restaurantInfo(p), index: plan.index, start: fromMin(pre.start), minutes: m.minutes, ...(visit ? { visitId: visit.visit.id } : {}) })
    setAdded({ name: p.name, ...pre })
  }

  const cardList = (ps: EatPlace[], kosher?: boolean) => (
    <ul className="flex flex-col gap-2.5">
      {ps.map((p) => (
        <RestaurantCard
          key={p.id}
          place={p}
          hours={hoursOn(p.hours, day.date)}
          near={nearestStopText(p, day.stops)}
          inDay={day.stops.find((s) => s.info?.ref === p.id)?.start}
          kosher={kosher}
          onOpen={() => navigate(`/restaurant/${p.id}/${day.id}/${meal}${visit ? `/${visit.visit.id}` : ''}`)}
          onAdd={() => add(p)}
        />
      ))}
    </ul>
  )

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-28">
      <header className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <IconButton label="חזרה" onClick={back}>
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-xl font-bold">
            {visitPlace ? (
              <>
                איפה אוכלים ב-<bdi>{visitPlace.name}</bdi>?
              </>
            ) : (
              `איפה אוכלים ביום ${dayIndex + 1}?`
            )}
          </h1>
          <span className="truncate text-xs text-muted">
            {shortDate(day.date)} · {dayPlace(day)}
          </span>
        </div>
      </header>

      <div role="group" aria-label="ארוחה" className="flex gap-2 px-3.5 pt-3.5">
        {MEAL_IDS.map((id) => {
          const done = plannedMeal(day, id)
          const p = visit ? plan : mealPlan(day, id, city)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={meal === id}
              onClick={() => setMeal(id)}
              className={cx(
                'flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] px-1.5',
                meal === id ? 'border-2 border-accent bg-accent/6' : 'border border-border bg-surface',
              )}
            >
              <b className="text-sm font-semibold">{MEALS[id].label}</b>
              <span className={cx('max-w-full truncate text-[11px]', meal === id ? 'font-semibold text-accent' : 'text-muted')}>
                {done ? `${done.name} ✓` : `${fromMin(p.start)}${p.nearName ? ` · ליד ${p.nearName.split(/ [–-] /)[0]}` : ''}`}
              </span>
            </button>
          )
        })}
      </div>

      <div role="group" aria-label="סינון" className="no-scrollbar flex gap-2 overflow-x-auto px-3.5 pt-3">
        <Chip on={openOnly} onClick={() => setOpenOnly((v) => !v)}>
          פתוח ב-{fromMin(plan.start)}
        </Chip>
        <Chip on={topRated} onClick={() => setTopRated((v) => !v)}>
          <Star size={12} aria-hidden="true" />
          4.5+
        </Chip>
        <Chip on={cheap} onClick={() => setCheap((v) => !v)}>
          €–€€
        </Chip>
        {KINDS.map((k) => (
          <Chip key={k.id} on={kind === k.id} onClick={() => setKind((v) => (v === k.id ? 'any' : k.id))}>
            {k.label}
          </Chip>
        ))}
      </div>

      {planned && (
        <a
          href={`#/place/${planned.id}`}
          className="mx-3.5 mt-3 flex items-center gap-2.5 rounded-card border border-accent/40 bg-accent/8 px-3 py-2.5 text-sm"
        >
          <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {m.to} כבר מתוכנן: <b>{planned.name}</b> · {timeRange(planned.start, planned.end)}
          </span>
        </a>
      )}

      <section aria-label={`מסעדות ${m.to}`} className="flex flex-col gap-2.5 px-3.5 pt-3.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[17px] font-bold">
            {kind === 'kosher' ? `מסעדות כשרות ב${day.destination?.name ?? day.city}` : `מומלץ ${m.to} ליד המסלול`}
          </h2>
          <span className="text-xs text-muted">
            {kind === 'kosher' ? 'מעט מקומות כשרים – מחפשים בכל העיר' : plan.nearName ? `ליד ${plan.nearName.split(/ [–-] /)[0]}, שם תהיו בסביבות ${fromMin(plan.start)}` : `ב${dayPlace(day)}`}
          </span>
        </div>

        {!eatAvailable() ? (
          <p className="rounded-card bg-raised p-4 text-sm text-muted">ההמלצות דורשות חיבור ל-Google Places, שלא מוגדר כאן.</p>
        ) : places === null ? (
          <p role="status" className="py-6 text-center text-sm text-muted">
            מחפשים מסעדות…
          </p>
        ) : failed ? (
          <p className="py-6 text-center text-sm text-muted">לא הצלחנו לטעון מסעדות כרגע. נסו שוב בעוד רגע.</p>
        ) : list.length === 0 && maybe.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {places.length ? 'אין מסעדות שמתאימות לסינון. נסו להוריד חלק מהסינונים.' : 'לא מצאנו מסעדות באזור.'}
          </p>
        ) : (
          <>
            {kind === 'kosher' && list.length === 0 && (
              <p className="py-2 text-sm text-muted">
                {(places ?? []).some((p) => KOSHER_NAME.test(p.name))
                  ? `המקומות הכשרים סגורים ב-${fromMin(plan.start)} ביום הזה (אולי בגלל שבת או חג). אפשר לבטל את הסינון "פתוח ב-${fromMin(plan.start)}" כדי לראות אותם.`
                  : 'לא מצאנו מקום עם "Kosher" בשם באזור.'}
              </p>
            )}
            {cardList(list, kind === 'kosher')}
            {maybe.length > 0 && (
              <>
                <p role="note" className="mt-2 rounded-card border border-accent-2/40 bg-accent-2/6 px-3 py-2.5 text-[13px] leading-relaxed">
                  <b>לא מסומנים ככשרים.</b> גוגל לא מציינת כשרות – המקומות האלה עלו בחיפוש &quot;kosher&quot; אבל אין לכך אישור. כדאי לבדוק מול בית חב״ד המקומי או אתר כשרות.
                </p>
                {cardList(maybe)}
              </>
            )}
          </>
        )}
        {list.length + maybe.length > 0 && <p className="text-center text-[11px] text-muted">דירוגים, מחירים ותמונות: Google · ההוספה שמה את המסעדה בלו״ז בשעת הארוחה</p>}
      </section>

      {added && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] px-3.5 pb-4">
          <div role="status" className="flex items-center gap-2.5 rounded-[18px] bg-text py-2.5 ps-4 pe-2.5 text-bg shadow-[0_10px_28px_rgba(21,24,29,0.25)]">
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-sm font-semibold">
                {added.name} נוסף {m.to}
              </span>
              <span className="truncate text-xs opacity-75">
                {timeRange(fromMin(added.start), fromMin(added.end))}
                {added.shift ? ` · מה שאחריו זז ב-${added.shift} דק׳` : ''}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'setDay', dayId: day.id })
                navigate('/trip/schedule')
              }}
              className="h-10 shrink-0 rounded-xl bg-bg px-3.5 text-sm font-semibold text-text"
            >
              ללו״ז
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('flex h-[34px] shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-medium', on ? 'border-text bg-text text-bg' : 'border-border bg-surface')}
    >
      {children}
    </button>
  )
}

function StripPhoto({ name }: { name?: string }) {
  const [failed, setFailed] = useState(false)
  if (!name || failed) return <span className="flex min-w-0 flex-1 items-center justify-center bg-accent/10 text-accent" aria-hidden="true"><UtensilsCrossed size={20} /></span>
  return <img src={googlePhoto(name, 360)} alt="" loading="lazy" onError={() => setFailed(true)} className="min-w-0 flex-1 object-cover" />
}

function RestaurantCard({
  place: p,
  hours,
  near,
  inDay,
  kosher,
  onOpen,
  onAdd,
}: {
  place: EatPlace
  hours?: string
  near?: string
  /** Named kosher: show a badge */
  kosher?: boolean
  /** Already in this day: its time */
  inDay?: string
  onOpen: () => void
  onAdd: () => void
}) {
  const strip = p.photos.length ? p.photos : [undefined]
  return (
    <li className={cx('flex flex-col overflow-hidden rounded-[20px] border', inDay ? 'border-accent bg-accent/6' : 'border-border bg-surface')}>
      <button type="button" onClick={onOpen} className="flex h-[118px] gap-0.5" aria-label={`${p.name} – פרטים, תמונות וביקורות`}>
        {strip.map((ph, i) => (
          <StripPhoto key={ph ?? i} name={ph} />
        ))}
      </button>
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-base font-semibold">{p.name}</span>
            {kosher && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">כשר</span>}
          </span>
          <span className="truncate text-xs text-muted">
            {p.rating ? (
              <>
                <b className="text-text">★ {p.rating.toFixed(1)}</b>
                {p.ratingCount ? ` (${p.ratingCount.toLocaleString('en-US')})` : ''}
              </>
            ) : null}
            {[p.typeLabel, priceSigns(p.price)].filter(Boolean).map((x) => ` · ${x}`)}
            {p.priceRange ? (
              <>
                {' · '}
                <bdi>{p.priceRange}</bdi>
              </>
            ) : null}
          </span>
          {(near || hours) && (
            <span className="truncate text-xs font-semibold text-accent">
              {near}
              {hours && (
                <>
                  {near ? ' · ' : ''}
                  <bdi>{hours}</bdi>
                </>
              )}
            </span>
          )}
        </button>
        {inDay ? (
          <span className="flex shrink-0 flex-col items-center gap-0.5">
            <span aria-label="כבר בלו״ז" className="flex size-11 items-center justify-center rounded-[14px] bg-accent text-on-accent">
              <Check size={20} aria-hidden="true" />
            </span>
            <span className="text-[11px] font-semibold text-accent">{inDay}</span>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`הוספת ${p.name} לארוחה`}
            onClick={onAdd}
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-accent text-accent hover:bg-accent/8"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  )
}
