import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { ArrowRight, ClipboardList, Footprints, LocateFixed, Map as MapIcon, Navigation, Plus, Share2, UtensilsCrossed } from 'lucide-react'
import TripMap from '../components/TripMap'
import Restaurants from '../components/Restaurants'
import { nearbyRestaurantsUrl } from '../data/restaurants'
import Timeline from '../components/Timeline'
import { DayChips, IconButton, IconTile, MODE_ICON, StopNode, cx } from '../components/ui'
import { useTrip } from '../state/TripStore'
import { directionsUrl, durationLabel, formatDayLong, freeSlot, isPastDay, stopDuration, stopStatus, timeRange, transitLabel } from '../data/helpers'
import type { Day, Trip } from '../data/types'
import { href, navigate } from '../router'

const PEEK = '356px'
const PEEK_PX = 356
const HALF = 0.6
const FULL = 0.94
const SNAPS: (string | number)[] = [PEEK, HALF, FULL]

export default function TripScreen({ expanded }: { expanded: boolean }) {
  const { state, dispatch } = useTrip()
  const { trip, activeDayId, selectedStopId } = state
  const dayIndex = Math.max(0, trip.days.findIndex((d) => d.id === activeDayId))
  const day = trip.days[dayIndex]

  const [snap, setSnap] = useState<string | number | null>(expanded ? FULL : PEEK)
  const [recenterKey, setRecenterKey] = useState(0)
  const [toast, setToast] = useState('')

  useEffect(() => setSnap(expanded ? FULL : PEEK), [expanded])

  const changeSnap = (s: string | number | null) => {
    setSnap(s)
    const want = s === FULL ? '#/trip/schedule' : '#/trip'
    if (window.location.hash !== want) window.history.replaceState(null, '', want)
  }

  const atPeek = snap === PEEK
  const bottomPadding = atPeek ? PEEK_PX : Math.round(window.innerHeight * HALF)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: trip.name, url })
      else {
        await navigator.clipboard.writeText(url)
        showToast('הקישור הועתק')
      }
    } catch {
      /* user cancelled */
    }
  }

  const showToast = (msg: string, ms = 2000) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), ms)
  }

  /** Ask for the location once, then open Google Maps' restaurant search around it. */
  const [locating, setLocating] = useState(false)
  const openNearbyRestaurants = () => {
    if (!('geolocation' in navigator)) {
      showToast('הדפדפן הזה לא תומך באיתור מיקום', 3500)
      return
    }
    // Open the tab synchronously (inside the tap) so pop-up blockers allow it; fill it in once we have a position.
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const url = nearbyRestaurantsUrl(pos.coords.latitude, pos.coords.longitude)
        if (tab) tab.location.href = url
        else window.location.href = url
      },
      (err) => {
        setLocating(false)
        tab?.close()
        showToast(
          err.code === err.PERMISSION_DENIED
            ? 'אין הרשאה למיקום. כדי לראות מסעדות לידכם, אשרו גישה למיקום בהגדרות הדפדפן ונסו שוב.'
            : 'לא הצלחנו לאתר את המיקום כרגע. נסו שוב בעוד רגע.',
          5000,
        )
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  const selectStop = (id: string | null) => dispatch({ type: 'selectStop', stopId: id })

  return (
    <div className="fixed inset-0 overflow-hidden bg-map-bg">
      <TripMap
        trip={trip}
        day={day}
        selectedStopId={selectedStopId}
        onSelectStop={(id) => {
          selectStop(id)
          if (id && snap === FULL) changeSnap(HALF)
        }}
        onSuggestion={(id) => navigate(`/add/${day.id}/${id}`)}
        bottomPadding={bottomPadding}
        recenterKey={recenterKey}
      />

      <div className="absolute inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-10 mx-auto flex max-w-[528px] items-center gap-2">
        <IconButton label="חזרה למסך הבית" to="/" variant="floating">
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <div className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-tile border border-border bg-surface/92 px-3">
          <span className="truncate text-[15px] font-semibold">{trip.name}</span>
          <span className="shrink-0 rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-semibold text-accent">· יום {dayIndex + 1}</span>
        </div>
        <IconButton label="פרטי הטיול: תאריכים, לינה, מסעדות ופעילויות" to="/plan" variant="floating">
          <ClipboardList size={20} aria-hidden="true" />
        </IconButton>
        <IconButton label="שיתוף הטיול" onClick={share} variant="floating">
          <Share2 size={20} aria-hidden="true" />
        </IconButton>
      </div>

      <button
        type="button"
        aria-label="המיקום שלי"
        onClick={() => setRecenterKey((k) => k + 1)}
        className={cx(
          'absolute z-10 flex size-12 items-center justify-center rounded-full border border-border bg-surface text-accent shadow-[var(--float-shadow)] transition-opacity duration-200 ease-out',
          atPeek ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ bottom: PEEK_PX + 16, insetInlineEnd: 16 }}
      >
        <LocateFixed size={22} aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={openNearbyRestaurants}
        disabled={locating}
        aria-label="מסעדות לידי – נפתח בגוגל מפות בכרטיסייה חדשה"
        className={cx(
          'absolute z-10 flex h-12 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium text-text shadow-[var(--float-shadow)] transition-opacity duration-200 ease-out disabled:opacity-60',
          atPeek ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ bottom: PEEK_PX + 16, insetInlineStart: 16 }}
      >
        <UtensilsCrossed size={18} className="text-accent" aria-hidden="true" />
        {locating ? 'מאתרים מיקום…' : 'מסעדות לידי'}
      </button>

      <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-4 top-20 z-30 flex justify-center">
        {toast && <span className="max-w-[420px] rounded-2xl border border-border bg-raised px-4 py-2 text-center text-sm leading-relaxed">{toast}</span>}
      </div>

      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        noBodyStyles
        snapPoints={SNAPS}
        activeSnapPoint={snap}
        setActiveSnapPoint={changeSnap}
      >
        <Drawer.Portal>
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-20 mx-auto flex h-full max-h-[97%] max-w-[560px] flex-col rounded-t-sheet border-t border-border bg-surface font-sans text-text shadow-sheet outline-none"
            dir="rtl"
          >
            <Drawer.Title className="sr-only">
              לו״ז יום {dayIndex + 1} – {day.title}
            </Drawer.Title>
            <button
              type="button"
              onClick={() => changeSnap(atPeek ? FULL : PEEK)}
              aria-label={atPeek ? 'הרחבה ללו״ז המלא' : 'כיווץ חזרה למפה'}
              className="flex h-7 w-full shrink-0 items-center justify-center"
            >
              <span className="h-[5px] w-10 rounded-full bg-handle" />
            </button>
            <div className={cx('flex min-h-0 flex-1 flex-col gap-3.5 px-4 pb-6', snap === FULL ? 'overflow-y-auto' : 'overflow-hidden')}>
              {atPeek ? (
                <PeekContent trip={trip} day={day} dayIndex={dayIndex} selectedStopId={selectedStopId} onSelect={selectStop} onAllDay={() => changeSnap(FULL)} onDay={(id) => dispatch({ type: 'setDay', dayId: id })} />
              ) : (
                <>
                  <header className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-2xl font-bold">
                        יום {dayIndex + 1} · {day.title}
                      </h2>
                      <span className="text-[13px] text-muted">
                        {formatDayLong(day.date)} · {day.stops.length ? `${day.stops.length} עצירות` : 'עוד לא תוכנן'}
                      </span>
                    </div>
                    <IconButton label="הצגה על המפה" onClick={() => changeSnap(PEEK)} variant="raised" className="text-accent">
                      <MapIcon size={20} aria-hidden="true" />
                    </IconButton>
                  </header>
                  <DayChips days={trip.days} activeId={day.id} onSelect={(id) => dispatch({ type: 'setDay', dayId: id })} />
                  <div className="pt-1">
                    <Timeline
                      trip={trip}
                      day={day}
                      selectedStopId={selectedStopId}
                      onSelect={selectStop}
                      onReorder={(from, to) => dispatch({ type: 'reorder', dayId: day.id, from, to })}
                    />
                  </div>
                  <Restaurants day={day} />
                </>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}

function PeekContent({
  trip,
  day,
  selectedStopId,
  onSelect,
  onAllDay,
  onDay,
}: {
  trip: Trip
  day: Day
  dayIndex: number
  selectedStopId: string | null
  onSelect: (id: string) => void
  onAllDay: () => void
  onDay: (id: string) => void
}) {
  const stops = day.stops
  const curIdx = day.id === trip.progress?.dayId ? stops.findIndex((s) => s.id === trip.progress?.stopId) : -1
  const selIdx = stops.findIndex((s) => s.id === selectedStopId)
  const focusIdx = selIdx !== -1 ? selIdx : curIdx !== -1 ? Math.min(curIdx + 1, stops.length - 1) : 0
  const focus = stops[focusIdx]
  const after = stops[focusIdx + 1]
  const slot = isPastDay(trip, day.id) ? null : freeSlot(day)

  return (
    <>
      <DayChips days={trip.days} activeId={day.id} onSelect={onDay} />

      {!focus ? (
        <a
          href={href(`/add/${day.id}`)}
          className="flex items-center gap-3 rounded-[20px] border-[1.5px] border-dashed border-accent-2 bg-accent-2/6 p-4 text-accent-2"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-tile bg-accent-2/14">
            <Plus size={22} aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[17px] font-semibold">יום פנוי</span>
            <span className="text-[13px] text-muted">
              {day.suggestions.length ? `${day.suggestions.length} הצעות באזור – הוספת עצירה` : 'עוד אין כאן עצירות'}
            </span>
          </span>
        </a>
      ) : (
        <FocusCard trip={trip} day={day} index={focusIdx} isNext={selIdx === -1 && curIdx !== -1 && focusIdx === curIdx + 1} onAllDay={onAllDay} />
      )}

      {after ? (
        <button type="button" onClick={() => onSelect(after.id)} className="flex min-h-12 items-center gap-3 px-1 text-start">
          <StopNode status={stopStatus(trip, day.id, after.id)} n={focusIdx + 2} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{after.name}</span>
          <span className="shrink-0 text-[13px] text-muted">{after.start}</span>
        </button>
      ) : (
        slot &&
        focus && (
          <a href={href(`/add/${day.id}`)} className="flex min-h-12 items-center gap-3 px-1 text-accent-2">
            <span className="flex size-8 items-center justify-center rounded-full border-2 border-dashed border-accent-2">
              <Plus size={16} aria-hidden="true" />
            </span>
            <span className="text-[15px] font-medium">
              {timeRange(slot.start, slot.end)} פנוי – הוספת עצירה
            </span>
          </a>
        )
      )}
    </>
  )
}

function FocusCard({ trip, day, index, isNext, onAllDay }: { trip: Trip; day: Day; index: number; isNext: boolean; onAllDay: () => void }) {
  const stop = day.stops[index]
  const status = stopStatus(trip, day.id, stop.id)
  const leg = index > 0 ? day.stops[index - 1].transitToNext : undefined
  const LegIcon = leg ? MODE_ICON[leg.mode] : Footprints
  const label =
    status === 'current' ? `עכשיו · ${stop.start}` : status === 'done' ? `הושלם · ${stop.start}` : isNext ? `העצירה הבאה · ${stop.start}` : `עצירה ${index + 1} · ${stop.start}`

  return (
    <article className="flex flex-col gap-3 rounded-[20px] border border-border bg-raised p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cx('text-xs font-semibold', status === 'done' ? 'text-muted' : 'text-accent')}>{label}</span>
        {leg && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <LegIcon size={14} aria-hidden="true" />
            {transitLabel(leg)}
          </span>
        )}
      </div>
      <a href={href(`/place/${stop.id}`)} className="flex items-center gap-3">
        <IconTile kind={stop.kind} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[17px] font-semibold">{stop.name}</span>
          <span className="text-[13px] text-muted">
            {stop.area} · {durationLabel(stopDuration(stop))}
          </span>
        </span>
      </a>
      <div className="flex gap-2">
        <a
          href={directionsUrl(stop)}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-tile bg-accent text-[15px] font-semibold text-on-accent transition-transform duration-200 ease-out active:scale-[0.98]"
        >
          <Navigation size={18} aria-hidden="true" />
          ניווט
        </a>
        <button
          type="button"
          onClick={onAllDay}
          className="h-12 rounded-tile border border-border-strong px-[18px] text-[15px] font-medium text-text transition-colors duration-200 ease-out hover:bg-surface"
        >
          כל היום
        </button>
      </div>
    </article>
  )
}
