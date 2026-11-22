import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarPlus, Plus } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import { DEFAULT_DAY_END, durationLabel, freeSlot, slotPartLabel, stopDuration, tripLegs } from '../data/helpers'
import { downloadCalendar } from '../data/calendar'
import { KIND_LABEL } from '../data/places'
import { hoursLabel, recommendedMode, transferOptions, type TransferMode } from '../data/transport'
import { DESTINATIONS } from '../data/destinations'
import { briefOf } from '../data/tripEdit'
import type { Day, Destination, Stop } from '../data/types'
import { href, navigate, prefersReducedMotion } from '../router'
import { useTrip } from '../state/TripStore'

const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`
const weekday = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00`).getDay()]
const MEAL = (s: Stop) => {
  const h = Number(s.start.slice(0, 2))
  return h < 11 ? 'ארוחת בוקר' : h < 16 ? 'ארוחת צהריים' : 'ארוחת ערב'
}
const MODE_WORD: Record<TransferMode, string> = { רכבת: 'רכבת', אוטובוס: 'אוטובוס', טיסה: 'טיסה', רכב: 'נסיעה', מעבורת: 'מעבורת' }

/** One row of a day: a stop, a transfer or a car pick-up */
type Row =
  | { kind: 'stop'; stop: Stop; n: number }
  | { kind: 'move'; time?: string; title: string; meta: string }

/** The whole trip on one page: every day, its stops, travel days and free time – and adding it to a calendar */
export default function AllDays() {
  const { state } = useTrip()
  const { trip } = state
  const brief = briefOf(trip)
  const legs = tripLegs(trip)
  const [active, setActive] = useState(trip.days[0]?.id ?? '')
  const sections = useRef(new Map<string, HTMLElement>())
  const stopsCount = trip.days.reduce((n, d) => n + d.stops.length, 0)
  const first = trip.days[0]?.date
  const last = trip.days[trip.days.length - 1]?.date

  // The day chip follows the day being read
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive((top.target as HTMLElement).dataset.day ?? '')
      },
      { rootMargin: '-140px 0px -55% 0px' },
    )
    sections.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [trip.days.length])

  const jump = (id: string) => {
    setActive(id)
    sections.current.get(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  /**
   * Where each day is. A day's own destination when it has one, else its city name (older trips keep only
   * that); a day in a different place from the day before is a travel day.
   */
  const placeOf = (d: Day): { name: string; dest?: Destination } => {
    if (d.destination) return { name: d.destination.name, dest: d.destination }
    const leg = legs.find((l) => l.days.includes(d))
    const known = DESTINATIONS.find((x) => x.name === d.city) ?? (leg?.destination.name === d.city ? leg.destination : undefined)
    return { name: d.city || leg?.destination.name || '', dest: known }
  }
  const places = trip.days.map(placeOf)
  // Which move between places each day is (for the transfer the wizard saved for it)
  const moveIndex = places.map((p, i) => (i > 0 && p.name !== places[i - 1].name ? places.slice(1, i + 1).filter((q, j) => q.name !== places[j].name).length - 1 : -1))

  const rowsFor = (day: Day): Row[] => {
    const rows: Row[] = []
    const i = trip.days.indexOf(day)
    const here = places[i]
    const mi = moveIndex[i]
    if (mi >= 0) {
      const from = places[i - 1]
      const mode = (brief.transfers?.[mi] as TransferMode | undefined) ?? (from.dest && here.dest ? recommendedMode(from.dest, here.dest) : undefined)
      const opt = mode && from.dest && here.dest ? transferOptions(from.dest, here.dest).find((o) => o.mode === mode) : undefined
      rows.push({
        kind: 'move',
        time: day.startTime ?? (day.stops.length ? undefined : '09:00'),
        title: mode ? `${MODE_WORD[mode] ?? mode} ל${here.name}` : `מעבר ל${here.name}`,
        meta: `${from.name} ← ${here.name}${opt ? ` · ${hoursLabel(opt.hours)}` : ''}`,
      })
    }
    // A rental car is picked up on the first day in its city
    if ((i === 0 || mi >= 0) && here.dest) {
      const rental = brief.rentals?.[here.dest.id]
      if (rental) rows.push({ kind: 'move', title: 'איסוף רכב שכור', meta: [rental.pickup, rental.company].filter(Boolean).join(' · ') })
    }
    day.stops.forEach((s, n) => rows.push({ kind: 'stop', stop: s, n: n + 1 }))
    return rows
  }

  const cityLine = (day: Day, i: number) =>
    `יום ${i + 1} · ${weekday(day.date)} ${dm(day.date)} · ${moveIndex[i] >= 0 ? `${places[i - 1].name} ← ${places[i].name}` : places[i].name}`

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-10">
      <header className="sticky top-0 z-20 flex flex-col gap-3 bg-bg/95 px-4 pt-4 pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <IconButton label="חזרה" onClick={() => (history.length > 1 ? history.back() : navigate('/overview'))}>
              <ArrowRight size={20} aria-hidden="true" />
            </IconButton>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="text-[26px] leading-tight font-bold">הלו״ז שלי</h1>
              <span className="truncate text-xs text-muted">
                {trip.name}
                {first && last ? (
                  <>
                    {' · '}
                    <bdi dir="ltr">
                      {dm(first)}–{dm(last)}
                    </bdi>
                  </>
                ) : null}{' '}
                · {stopsCount} עצירות
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => downloadCalendar(trip)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-semibold"
            aria-label="הוספת הלו״ז ליומן (קובץ ics)"
          >
            <CalendarPlus size={17} aria-hidden="true" />
            ליומן
          </button>
        </div>
        <div role="group" aria-label="מעבר ליום" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {trip.days.map((d, i) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={active === d.id}
              onClick={() => jump(d.id)}
              className={cx(
                'h-9 shrink-0 rounded-full px-3.5 text-[13px]',
                active === d.id
                  ? 'bg-accent font-semibold text-on-accent'
                  : d.stops.length
                    ? 'border border-border bg-surface font-medium'
                    : 'border border-dashed border-accent-2/60 bg-accent-2/8 font-medium text-accent-2',
              )}
            >
              יום {i + 1}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3.5 px-4 pt-1">
        {trip.days.map((day, i) => {
          const rows = rowsFor(day)
          const slot = freeSlot(day)
          const empty = day.stops.length === 0
          return (
            <section
              key={day.id}
              data-day={day.id}
              ref={(el) => {
                if (el) sections.current.set(day.id, el)
                else sections.current.delete(day.id)
              }}
              aria-label={`יום ${i + 1}`}
              className={cx(
                'scroll-mt-[136px] rounded-[22px] p-4',
                empty && rows.length === 0 ? 'border-[1.5px] border-dashed border-accent-2/60 bg-accent-2/6' : 'border border-border bg-surface',
              )}
            >
              <div className={cx('flex items-start justify-between gap-3', rows.length > 0 && 'border-b border-border pb-3')}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={cx('text-xs font-semibold', empty && rows.length === 0 ? 'text-accent-2' : 'text-accent')}>{cityLine(day, i)}</span>
                  <h2 className="text-lg font-bold">{empty ? (rows.length ? day.title || 'יום מעבר' : 'יום פנוי') : day.title || `יום ${i + 1}`}</h2>
                </div>
                {empty && (
                  <a href={href(`/add/${day.id}`)} className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-accent-2/60 px-3 text-[13px] font-semibold text-accent-2">
                    <Plus size={15} aria-hidden="true" />
                    תכנון היום
                  </a>
                )}
              </div>

              {rows.length > 0 && (
                <ol className="flex flex-col">
                  {rows.map((r, j) => (
                    <li key={r.kind === 'stop' ? r.stop.id : `m-${j}`} className={cx(j < rows.length - 1 && 'border-b border-border')}>
                      {r.kind === 'stop' ? (
                        <a href={href(`/place/${r.stop.id}`)} className="flex items-start gap-3.5 py-3">
                          <b className="w-12 shrink-0 pt-px text-[15px]">{r.stop.start}</b>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[15px] font-semibold">{r.stop.name}</span>
                            <StopMeta stop={r.stop} />
                          </span>
                        </a>
                      ) : (
                        <div className="flex items-start gap-3.5 py-3">
                          <b className="w-12 shrink-0 pt-px text-[15px]">{r.time ?? ''}</b>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[15px] font-semibold text-accent">{r.title}</span>
                            <span className="truncate text-xs text-muted">{r.meta}</span>
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {!empty && slot && (
                <a
                  href={href(`/add/${day.id}`)}
                  className="mt-1 flex items-center gap-3.5 rounded-xl border-[1.5px] border-dashed border-accent-2/60 bg-accent-2/6 py-2.5 ps-0 text-accent-2"
                >
                  <b className="w-12 shrink-0 text-center text-[15px]">{slot.start}</b>
                  <span className="text-sm font-medium">
                    {slotPartLabel(slot.start)} פנוי{slot.end !== DEFAULT_DAY_END ? ` עד ${slot.end}` : ''} – הוספה
                  </span>
                </a>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function StopMeta({ stop: s }: { stop: Stop }) {
  const parts: { text: string; orange?: boolean }[] = []
  if (s.kind === 'food') parts.push({ text: MEAL(s) })
  if (s.area && s.kind !== 'food') parts.push({ text: s.area.split(',')[0] })
  if (s.kind !== 'food') parts.push({ text: durationLabel(stopDuration(s)) })
  if (s.heritage) parts.push({ text: 'אתר מורשת' })
  else if (s.kind === 'food') parts.push({ text: s.info?.description ?? KIND_LABEL[s.kind] })
  if (s.needsBooking) parts.push({ text: s.booked ? 'כרטיסים הוזמנו' : 'צריך להזמין מראש', orange: !s.booked })
  return (
    <span className="truncate text-xs text-muted">
      {parts.map((p, i) => (
        <span key={i} className={p.orange ? 'font-medium text-accent-2' : undefined}>
          {i > 0 ? ' · ' : ''}
          {p.text}
        </span>
      ))}
    </span>
  )
}
