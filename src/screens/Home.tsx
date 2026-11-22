import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bell, Compass, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { BottomNav, Fab, IconButton, ScreenHeader, Tag, cx } from '../components/ui'
import { countdownLabel, daysUntil, isoInDays, tripRange, tripStats } from '../data/helpers'
import type { Destination, Trip } from '../data/types'
import { isSampleTrip, useTrip } from '../state/TripStore'
import { startWizard } from './TripWizard'
import { destinationSub, useDestinationSearch } from '../data/useDestinationSearch'
import { useCityPhoto } from '../data/cityPhoto'
import { href, navigate } from '../router'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  if (h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

const planned = (t: Trip) => !!t.destination && t.days.length > 0

/** The user's next trip: the soonest upcoming one with a destination, else the latest past one */
function nextTrip(trips: Trip[]) {
  const today = isoInDays(0)
  const withDest = trips.filter(planned)
  const upcoming = withDest.filter((t) => t.days[t.days.length - 1].date >= today).sort((a, b) => a.days[0].date.localeCompare(b.days[0].date))
  return upcoming[0] ?? withDest[withDest.length - 1] ?? null
}

/** The trip's destinations in order, with which days are spent in each */
function tripLegs(trip: Trip) {
  const legs: { dest: Destination; from: number; to: number }[] = []
  trip.days.forEach((day, i) => {
    const dest = day.destination ?? trip.destination
    if (!dest) return
    const last = legs[legs.length - 1]
    if (last && last.dest.id === dest.id) last.to = i + 1
    else legs.push({ dest, from: i + 1, to: i + 1 })
  })
  return legs
}

const dayRange = (from: number, to: number) => (from === to ? `יום ${from}` : `ימים ${from}–${to}`)

export default function Home() {
  const { state, dispatch } = useTrip()
  // Only the user's own trips: the bundled sample never shows here
  const own = state.trips.filter((t) => !isSampleTrip(t))
  const trip = nextTrip(own)
  const others = own.filter((t) => t.id !== trip?.id)

  // A trip opens on its overview (days, lodging, restaurants, transport); the map is one tap from there
  const openTrip = (id: string) => {
    dispatch({ type: 'setActiveTrip', tripId: id })
    navigate('/overview')
  }
  const newTrip = () => startWizard()
  const editTrip = (id: string) => {
    dispatch({ type: 'setActiveTrip', tripId: id })
    navigate('/edit')
  }
  const [deleting, setDeleting] = useState<Trip | null>(null)
  const removeTrip = (t: Trip) => {
    dispatch({ type: 'deleteTrip', tripId: t.id })
    setDeleting(null)
    flash(`הטיול ״${t.name}״ נמחק`)
  }

  const [notice, setNotice] = useState('')
  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2200)
  }

  return (
    <div className="mx-auto min-h-full max-w-[560px] px-5 pt-5 pb-[180px]">
      <div className="flex flex-col gap-[18px]">
        <ScreenHeader
          eyebrow={greeting()}
          title="לאן הפעם?"
          action={
            <IconButton label="התראות" onClick={() => flash('אין התראות חדשות')}>
              <Bell size={20} aria-hidden="true" />
            </IconButton>
          }
        />

        <DestinationSearch />

        {trip ? (
          <>
            <NextTripCard trip={trip} onOpen={() => openTrip(trip.id)} onEdit={() => editTrip(trip.id)} onDelete={() => setDeleting(trip)} />
            <TripDestinations
              trip={trip}
              onOpen={(i) => {
                dispatch({ type: 'setActiveTrip', tripId: trip.id })
                navigate(`/city/${i}`)
              }}
            />
          </>
        ) : (
          <EmptyCard onNew={newTrip} />
        )}

        {others.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="other-trips">
            <h2 id="other-trips" className="text-lg font-semibold">
              {trip ? 'טיולים נוספים' : 'טיוטות'}
            </h2>
            <ul className="flex flex-col gap-2">
              {others.map((t) => (
                <li key={t.id}>
                  <OtherTripRow trip={t} onOpen={() => openTrip(t.id)} onEdit={() => editTrip(t.id)} onDelete={() => setDeleting(t)} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[176px] z-40 flex justify-center px-6">
        {notice && <span className="rounded-full border border-border bg-raised px-4 py-2 text-center text-sm">{notice}</span>}
      </div>

      {deleting && <ConfirmDelete trip={deleting} onConfirm={() => removeTrip(deleting)} onCancel={() => setDeleting(null)} />}

      <Fab label="טיול חדש" onClick={newTrip}>
        <Plus size={26} strokeWidth={2.25} aria-hidden="true" />
      </Fab>
      <BottomNav active="home" />
    </div>
  )
}

/** Search field: matching destinations appear under it; picking one starts the new-trip wizard there */
function DestinationSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const listId = useId()
  const query = q.trim()
  const { matches, loading, noMatch, hebrewMiss } = useDestinationSearch(query)
  const pick = (d: Destination) => startWizard(d)

  return (
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (matches[0]) pick(matches[0])
          else startWizard()
        }}
        className="relative"
      >
        <label className="flex h-[52px] items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 text-muted focus-within:border-accent">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">חיפוש יעד</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="חפשו עיר, מדינה או מקום"
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
          />
        </label>
        {open && matches.length === 0 && (loading || noMatch) && (
          <p role="status" className="absolute inset-x-0 top-[calc(100%+6px)] z-30 rounded-card border border-border bg-surface px-4 py-3 text-[13px] text-muted shadow-[var(--float-shadow)]">
            {loading ? 'מחפשים…' : hebrewMiss ? 'לא מצאנו בעברית. מקומות קטנים בחו״ל מוצאים באותיות לטיניות – למשל Porto Cervo.' : `לא מצאנו את "${query}".`}
          </p>
        )}
        {open && matches.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="יעדים מתאימים"
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-card border border-border bg-surface shadow-[var(--float-shadow)]"
          >
            {matches.map((d) => (
              <li key={d.id} role="option" aria-selected="false">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(d)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-raised"
                >
                  <MapPin size={18} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-medium">{d.name}</span>
                    <span className="text-[12px] text-muted">{destinationSub(d)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
  )
}

/** The next trip, with a photo of its first destination (the map shows while the photo loads or if none exists) */
function NextTripCard({ trip, onOpen, onEdit, onDelete }: { trip: Trip; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const stats = tripStats(trip)
  const photo = useCityPhoto(trip.destination)
  const [failed, setFailed] = useState(false)
  const showPhoto = photo && !failed

  return (
    <article className="overflow-hidden rounded-phone border border-border bg-surface shadow-[0_8px_24px_rgba(21,24,29,0.06)]">
      <div className="relative h-[196px] bg-map-bg">
        {showPhoto ? (
          <img src={photo.src} alt={`תמונה של ${trip.destination?.name ?? 'היעד'}`} onError={() => setFailed(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-water text-accent" aria-hidden="true">
            <MapPin size={36} />
          </span>
        )}
        <span className="absolute top-3 right-3 flex h-[30px] items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-semibold shadow-sm">
          <span className="size-1.5 rounded-full bg-accent" />
          {countdownLabel(daysUntil(trip.days[0].date))}
        </span>
      </div>
      <div className="flex flex-col gap-3.5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-semibold text-accent">הטיול הבא</span>
            <h2 className="truncate text-lg font-semibold">{trip.name}</h2>
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
        <TripActions name={trip.name} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </article>
  )
}

/** Photo strip of the destinations in the next trip */
function TripDestinations({ trip, onOpen }: { trip: Trip; onOpen: (legIndex: number) => void }) {
  const legs = tripLegs(trip)
  if (legs.length === 0) return null
  return (
    <section className="flex flex-col gap-3" aria-labelledby="trip-dests">
      <div className="flex items-center justify-between">
        <h2 id="trip-dests" className="text-lg font-semibold">
          היעדים בטיול
        </h2>
        <a href={href('/trip/schedule')} className="flex min-h-11 items-center text-[13px] font-medium text-accent">
          לכל הימים
        </a>
      </div>
      <ul className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5">
        {legs.map((leg, i) => (
          <li key={`${leg.dest.id}-${leg.from}`} className="shrink-0">
            <DestinationTile dest={leg.dest} days={dayRange(leg.from, leg.to)} onOpen={() => onOpen(i)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function DestinationTile({ dest, days, onOpen }: { dest: Destination; days: string; onOpen: () => void }) {
  const photo = useCityPhoto(dest)
  const [failed, setFailed] = useState(false)
  return (
    <button type="button" onClick={onOpen} className="flex w-[136px] flex-col gap-2 text-start">
      {photo && !failed ? (
        <img src={photo.src} alt="" onError={() => setFailed(true)} className="h-[116px] w-full rounded-card object-cover" />
      ) : (
        <span className="flex h-[116px] w-full items-center justify-center rounded-card bg-water text-accent" aria-hidden="true">
          <MapPin size={26} />
        </span>
      )}
      <span className="flex flex-col gap-0.5 px-0.5">
        <span className="text-[15px] font-semibold">{dest.name}</span>
        <span className="text-xs text-muted">{days}</span>
      </span>
    </button>
  )
}

function OtherTripRow({ trip: t, onOpen, onEdit, onDelete }: { trip: Trip; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const photo = useCityPhoto(t.destination)
  const [failed, setFailed] = useState(false)
  const icon = 'flex size-11 shrink-0 items-center justify-center rounded-tile text-muted transition-colors duration-200 ease-out'
  return (
    <div className="flex items-center gap-1 rounded-card border border-border bg-surface p-2.5 pe-1.5 transition-colors duration-200 ease-out hover:border-border-strong">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        {photo && !failed ? (
          <img src={photo.src} alt="" onError={() => setFailed(true)} className="size-11 shrink-0 rounded-tile object-cover" />
        ) : (
          <span
            className={cx(
              'flex size-11 shrink-0 items-center justify-center rounded-tile',
              t.destination ? 'bg-water text-accent' : 'border-[1.5px] border-dashed border-accent-2 text-accent-2',
            )}
          >
            <MapPin size={20} aria-hidden="true" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-base font-semibold">{t.name}</span>
          <span className={cx('truncate text-[13px]', t.destination ? 'text-muted' : 'text-accent-2')}>
            {planned(t) ? `${tripRange(t)} · ${t.days.length} ימים` : 'עוד לא נבחר יעד'}
          </span>
        </span>
        {!t.destination && <Tag tone="muted">טיוטה</Tag>}
      </button>
      {t.destination && (
        <button type="button" aria-label={`עריכת הטיול ${t.name}`} onClick={onEdit} className={cx(icon, 'hover:bg-raised hover:text-text')}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      )}
      <button type="button" aria-label={`מחיקת הטיול ${t.name}`} onClick={onDelete} className={cx(icon, 'hover:bg-[#B42318]/10 hover:text-[#B42318]')}>
        <Trash2 size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

/** Edit and delete, under the next trip's details */
function TripActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onEdit} aria-label={`עריכת הטיול ${name}`} className="flex h-11 items-center justify-center gap-2 rounded-tile border border-border-strong bg-surface text-[14px] font-medium">
        <Pencil size={16} className="text-accent" aria-hidden="true" />
        עריכה
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`מחיקת הטיול ${name}`}
        className="flex h-11 items-center justify-center gap-2 rounded-tile border border-border-strong bg-surface text-[14px] font-medium text-[#B42318]"
      >
        <Trash2 size={16} aria-hidden="true" />
        מחיקה
      </button>
    </div>
  )
}

/** "Delete this trip?" – deleting can't be undone */
function ConfirmDelete({ trip, onConfirm, onCancel }: { trip: Trip; onConfirm: () => void; onCancel: () => void }) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  const stops = trip.days.reduce((n, d) => n + d.stops.length, 0)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[420px] flex-col gap-4 rounded-phone bg-surface p-5 shadow-[var(--float-shadow)]"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id={titleId} className="text-lg font-bold">
            למחוק את ״{trip.name}״?
          </h2>
          <p className="text-[14px] leading-relaxed text-muted">
            {trip.days.length ? `${trip.days.length} ימים${stops ? ` ו-${stops === 1 ? 'עצירה אחת' : `${stops} עצירות`}` : ''} יימחקו. ` : ''}אי אפשר לבטל את המחיקה.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="h-12 rounded-tile border border-border-strong bg-surface text-[15px] font-medium">
            ביטול
          </button>
          <button type="button" onClick={onConfirm} className="h-12 rounded-tile bg-[#B42318] text-[15px] font-semibold text-white">
            מחיקת הטיול
          </button>
        </div>
      </div>
    </div>
  )
}

/** No destination chosen yet: an invitation to plan */
function EmptyCard({ onNew }: { onNew: () => void }) {
  return (
    <article className="flex flex-col items-center gap-4 rounded-phone border border-dashed border-border-strong bg-surface px-6 py-9 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-water text-accent" aria-hidden="true">
        <Compass size={26} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-semibold">עוד לא נבחר יעד</h2>
        <p className="max-w-[280px] text-[14px] leading-relaxed text-muted">חפשו יעד למעלה או התחילו טיול חדש, והטיול הבא שלכם יופיע כאן עם תמונה וספירה לאחור.</p>
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
    <div className={cx('flex flex-col-reverse gap-0.5 rounded-tile px-3 py-2.5', orange ? 'border border-dashed border-accent-2/55 bg-accent-2/8' : 'bg-raised')}>
      <dt className={cx('text-xs', orange ? 'text-accent-2' : 'text-muted')}>{label}</dt>
      <dd className={cx('text-lg font-semibold', orange && 'text-accent-2')}>{value}</dd>
    </div>
  )
}
