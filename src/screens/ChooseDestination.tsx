import { useId, useMemo, useState } from 'react'
import { ArrowRight, Check, MapPin, Search, Trash2 } from 'lucide-react'
import BlankMap from '../components/BlankMap'
import { IconButton, cx } from '../components/ui'
import { DESTINATIONS } from '../data/destinations'
import { isoInDays } from '../data/helpers'
import { useTrip } from '../state/TripStore'
import { navigate } from '../router'

const LENGTHS = [3, 5, 7, 10]

/** A new trip with no destination: blank map, choose where and when. */
export default function ChooseDestination() {
  const { state, dispatch } = useTrip()
  const { trip } = state
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [start, setStart] = useState(isoInDays(30))
  const [length, setLength] = useState(5)
  const dateId = useId()

  const list = useMemo(() => {
    const term = q.trim()
    return term ? DESTINATIONS.filter((d) => d.name.includes(term) || d.country.includes(term)) : DESTINATIONS
  }, [q])
  const destination = DESTINATIONS.find((d) => d.id === picked) ?? null

  return (
    <div className="fixed inset-0 overflow-hidden bg-map-bg">
      <div className="absolute inset-x-0 top-0 h-[42%]">
        <BlankMap />
      </div>

      <div className="absolute inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-10 mx-auto flex max-w-[528px] items-center gap-2">
        <IconButton label="חזרה למסך הבית" to="/" variant="floating">
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <div className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-tile border border-border bg-surface/92 px-3">
          <span className="truncate text-[15px] font-semibold">{trip.name}</span>
          <span className="shrink-0 rounded-full bg-accent-2/12 px-2.5 py-0.5 text-xs font-semibold text-accent-2">ללא יעד</span>
        </div>
        <IconButton
          label="מחיקת הטיול"
          variant="floating"
          onClick={() => {
            dispatch({ type: 'deleteTrip', tripId: trip.id })
            navigate('/')
          }}
        >
          <Trash2 size={20} aria-hidden="true" />
        </IconButton>
      </div>

      <main className="absolute inset-x-0 top-[38%] bottom-0 mx-auto flex max-w-[560px] flex-col gap-3.5 rounded-t-sheet border-t border-border bg-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] shadow-sheet">
        <span className="mx-auto mt-3 h-[5px] w-10 shrink-0 rounded-full bg-handle" aria-hidden="true" />
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">לאן נוסעים?</h1>
          <p className="text-[13px] text-muted">המפה תתמקד ביעד רק אחרי שתבחרו אותו.</p>
        </header>

        <label className="flex h-[52px] shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-raised px-4 text-muted focus-within:border-accent">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">חיפוש יעד</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חפשו עיר או מדינה"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
          />
        </label>

        <div role="radiogroup" aria-label="יעד" className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
          {list.length === 0 && <p className="py-2 text-[15px] text-muted">לא מצאנו יעד בשם הזה.</p>}
          {list.map((d) => {
            const on = d.id === picked
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(d.id)}
                className={cx(
                  'flex min-h-[52px] shrink-0 items-center gap-3 rounded-card border px-3 text-start transition-colors duration-200 ease-out',
                  on ? 'border-accent bg-accent/8' : 'border-border bg-raised hover:border-border-strong',
                )}
              >
                <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-tile', on ? 'bg-accent text-on-accent' : 'bg-water text-accent')}>
                  {on ? <Check size={18} aria-hidden="true" /> : <MapPin size={18} aria-hidden="true" />}
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{d.name}</span>
                  <span className="text-[13px] text-muted">{d.country}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2">
          <label htmlFor={dateId} className="flex min-w-[150px] flex-1 flex-col gap-1.5">
            <span className="text-xs text-muted">יציאה</span>
            <input
              id={dateId}
              type="date"
              value={start}
              min={isoInDays(0)}
              onChange={(e) => e.target.value && setStart(e.target.value)}
              className="h-11 w-full min-w-0 rounded-tile border border-border bg-raised px-3 text-[15px] text-text [color-scheme:dark] outline-none focus:border-accent"
            />
          </label>
          <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
            <legend className="mb-1.5 p-0 text-xs text-muted">ימים</legend>
            <div className="flex gap-1.5">
              {LENGTHS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === length}
                  onClick={() => setLength(n)}
                  className={cx(
                    'size-11 rounded-full border text-sm transition-colors duration-200 ease-out',
                    n === length ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-raised text-muted',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <button
          type="button"
          disabled={!destination}
          onClick={() => destination && dispatch({ type: 'setDestination', destination, startDate: start, dayCount: length })}
          className="h-[52px] shrink-0 rounded-tile bg-accent text-[15px] font-semibold text-on-accent transition-opacity duration-200 ease-out disabled:opacity-40"
        >
          {destination ? `יצירת טיול ל${destination.name}` : 'בחרו יעד כדי להמשיך'}
        </button>
      </main>
    </div>
  )
}
