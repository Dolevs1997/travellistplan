import { useState } from 'react'
import { ArrowRight, ExternalLink, Search } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import { addDays, travelers } from '../data/brief'
import { shortDate, tripLegs } from '../data/helpers'
import { RENTAL_COMPANIES, RENTAL_COMPARE_URL, rentalPerDay, type RentalFilters } from '../data/transport'
import { useEditableBrief } from '../data/tripEdit'
import { useTrip } from '../state/TripStore'
import { navigate } from '../router'

const FILTERS: { id: keyof RentalFilters; label: string }[] = [
  { id: 'automatic', label: 'גיר אוטומטי' },
  { id: 'family', label: 'רכב משפחתי' },
  { id: 'fullInsurance', label: 'ביטוח מלא' },
  { id: 'freeCancel', label: 'ביטול חינם' },
]

/** Pick a rental company for one destination: estimated prices, links to each company and to a comparison site */
export default function CarRental({ destId }: { destId: string }) {
  const { state, dispatch } = useTrip()
  const { brief, update, editing } = useEditableBrief(state.trip, dispatch)
  const i = brief.legs.findIndex((l) => l.destination.id === destId)
  const leg = brief.legs[i]
  const saved = brief.rentals?.[destId]
  const [company, setCompany] = useState(saved?.company ?? RENTAL_COMPANIES[0].name)
  // Default pick-up: where you sleep in this city, if it's chosen
  const savedLeg = tripLegs(state.trip).find((l) => l.destination.id === destId)
  const stay = savedLeg ? (state.trip.lodgings ?? []).find((l) => l.checkIn <= savedLeg.days[savedLeg.days.length - 1].date && l.checkOut > savedLeg.days[0].date) : undefined
  const [pickup, setPickup] = useState(saved?.pickup ?? stay?.name ?? 'מרכז העיר')
  const [dropoff, setDropoff] = useState(saved?.dropoff ?? (i === brief.legs.length - 1 ? 'שדה התעופה' : 'מרכז העיר'))
  const [filters, setFilters] = useState<RentalFilters>({ automatic: true, family: travelers(brief) > 4, fullInsurance: false, freeCancel: false })
  // Return to wherever this was opened from (the city screen or the edit screen)
  const back = () => (history.length > 1 ? history.back() : navigate(editing ? '/edit' : '/plan'))

  if (!leg) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">העיר הזו כבר לא בטיול.</p>
        <button type="button" onClick={back} className="h-11 rounded-tile bg-accent px-5 font-semibold text-on-accent">
          חזרה
        </button>
      </div>
    )
  }

  const dest = leg.destination
  const days = Math.max(1, leg.nights)
  const startOffset = brief.legs.slice(0, i).reduce((n, l) => n + l.nights, 0)
  const from = brief.start ? addDays(brief.start, startOffset) : ''
  const to = brief.start ? addDays(from, leg.nights) : ''

  const save = () => {
    update({ rentals: { ...brief.rentals, [destId]: { company, pickup: pickup.trim(), dropoff: dropoff.trim() } } })
    back()
  }

  const field = 'h-16 rounded-[14px] border border-border-strong bg-surface px-3 flex flex-col justify-center gap-0.5 focus-within:border-accent'
  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-[110px]">
      <div className="flex flex-col gap-3 px-5 pt-4">
        <header className="flex items-center gap-3">
          <IconButton label="חזרה לעריכת הטיול" onClick={back}>
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[22px] font-bold">רכב ב{dest.name}</h1>
            <span className="text-[13px] text-muted">
              {days === 1 ? 'יום אחד' : `${days} ימים`} · {travelers(brief)} נוסעים
            </span>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <label className={field}>
            <span className="text-xs text-muted">איסוף{from ? ` · ${shortDate(from)}` : ''}</span>
            <input value={pickup} onChange={(e) => setPickup(e.target.value)} className="min-w-0 bg-transparent text-sm font-semibold outline-none" />
          </label>
          <label className={field}>
            <span className="text-xs text-muted">החזרה{to ? ` · ${shortDate(to)}` : ''}</span>
            <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} className="min-w-0 bg-transparent text-sm font-semibold outline-none" />
          </label>
        </div>

        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="סינון">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filters[f.id]}
              onClick={() => setFilters((x) => ({ ...x, [f.id]: !x[f.id] }))}
              className={cx(
                'h-[38px] shrink-0 rounded-full border px-3.5 text-[13px] font-medium',
                filters[f.id] ? 'border-accent bg-accent text-on-accent' : 'border-border-strong bg-surface',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="חברת השכרה" className="flex flex-col gap-2">
          {RENTAL_COMPANIES.map((c) => {
            const on = company === c.name
            const perDay = rentalPerDay(dest, c, filters)
            return (
              <div key={c.id} className={cx('flex items-center gap-2.5 rounded-card bg-surface', on ? 'border-2 border-accent p-[11px]' : 'border border-border p-3')}>
                <button type="button" role="radio" aria-checked={on} onClick={() => setCompany(c.name)} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
                  <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
                    <span className={cx('flex size-[22px] items-center justify-center rounded-full border-2', on ? 'border-accent' : 'border-border-strong')}>
                      {on && <span className="size-2.5 rounded-full bg-accent" />}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-base font-semibold">{c.name}</span>
                    <span className="truncate text-xs text-muted">
                      {filters.family ? c.car.family : c.car.small} · {filters.automatic ? 'אוטומט' : 'ידני'}
                    </span>
                    <span className="text-[13px]">
                      <strong className={cx('font-bold', on && 'text-accent')}>
                        <bdi dir="ltr">~€{perDay}</bdi>
                      </strong>{' '}
                      ליום · <bdi dir="ltr">~€{perDay * days}</bdi> סה״כ
                    </span>
                  </span>
                </button>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`מעבר לאתר ${c.name}`}
                  className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-border-strong px-2.5 text-[13px]"
                >
                  לאתר
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            )
          })}
        </div>

        <a href={RENTAL_COMPARE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-2xl bg-accent/12 px-3.5 py-2.5 text-accent">
          <Search size={20} aria-hidden="true" />
          <span className="flex flex-1 flex-col gap-px">
            <span className="text-sm font-semibold">השוואה בין כל החברות</span>
            <span className="text-xs">באתר השוואת השכרות חיצוני</span>
          </span>
          <ExternalLink size={16} aria-hidden="true" />
        </a>

        <p className="text-xs leading-[1.4] text-muted">המחירים משוערים לפי רמת המחירים ביעד. ההזמנה והתשלום נעשים באתר החברה.</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[560px] border-t border-border bg-surface px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={save} className="h-[52px] w-full rounded-2xl bg-accent text-base font-semibold text-on-accent">
          שמירת {company} ל{dest.name}
        </button>
      </div>
    </div>
  )
}
