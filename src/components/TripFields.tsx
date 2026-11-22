import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, MapPin, Minus, Plus, X } from 'lucide-react'
import { DESTINATIONS, REGION_LABEL, type Region } from '../data/destinations'
import { cx } from './ui'
import { destinationSub, useDestinationSearch } from '../data/useDestinationSearch'
import type { Destination } from '../data/types'

/** Form pieces shared by the new-trip wizard and the trip editing screens */

export function Chip({ on, onClick, children, small }: { on?: boolean; onClick?: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-4 font-medium transition-colors duration-200 ease-out',
        small ? 'h-9 text-[13px]' : 'h-10 text-[14px]',
        on ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border-strong bg-surface hover:border-accent',
      )}
    >
      {children}
    </button>
  )
}

/** Dashed "add a city or country" field with matching suggestions under it */
export function AddCity({
  onPick,
  onCancel,
  autoFocus,
  skip,
  placeholder = 'הוספת עיר או מדינה',
  browseOpen = false,
}: {
  onPick: (d: Destination) => void
  onCancel?: () => void
  autoFocus?: boolean
  skip: string[]
  placeholder?: string
  /** Start with the full list of destinations showing */
  browseOpen?: boolean
}) {
  const [q, setQ] = useState('')
  const [browse, setBrowse] = useState(browseOpen)
  const [region, setRegion] = useState<Region>('europe')
  const regionList = DESTINATIONS.filter((d) => d.region === region && !skip.includes(d.id))
  const listId = useId()
  const query = q.trim()
  const { matches, loading, noMatch, hebrewMiss } = useDestinationSearch(query, 6, skip)
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex h-[52px] items-center gap-2.5 rounded-card border-[1.5px] border-dashed border-border-strong px-4 focus-within:border-accent">
        <Plus size={20} className="shrink-0 text-accent" strokeWidth={2.25} aria-hidden="true" />
        <span className="sr-only">הוספת עיר</span>
        <input
          type="text"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) onPick(matches[0])
            if (e.key === 'Escape') onCancel?.()
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
        />
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="ביטול הוספה" className="flex size-9 items-center justify-center text-muted">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </label>
      {matches.length > 0 && (
        <ul id={listId} role="listbox" aria-label="יעדים מתאימים" className="overflow-hidden rounded-card border border-border bg-surface">
          {matches.map((d) => (
            <li key={d.id} role="option" aria-selected="false">
              <button type="button" onClick={() => onPick(d)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-raised">
                <MapPin size={18} className="shrink-0 text-accent" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium">{d.name}</span>
                  <span className="text-xs text-muted">{destinationSub(d)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <p role="status" className="px-1 text-[13px] text-muted">
          מחפשים…
        </p>
      )}
      {noMatch && (
        <p role="status" className="px-1 text-[13px] text-muted">
          {hebrewMiss ? 'לא מצאנו בעברית. מקומות קטנים בחו״ל מוצאים באותיות לטיניות – למשל Porto Cervo.' : `לא מצאנו את "${query}".`}
        </p>
      )}
      {!query && (
        <button type="button" aria-expanded={browse} onClick={() => setBrowse((v) => !v)} className="flex h-10 items-center justify-center gap-1.5 text-[13px] font-semibold text-accent">
          {browse ? 'הסתרת היעדים' : `כל היעדים (${DESTINATIONS.length})`}
          <ChevronDown size={15} className={cx('transition-transform duration-200', browse && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
      {!query && browse && (
        <div className="flex flex-col gap-2">
          <div role="group" aria-label="אזור" className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {(Object.keys(REGION_LABEL) as Region[]).map((r) => (
              <Chip key={r} small on={region === r} onClick={() => setRegion(r)}>
                <span className="whitespace-nowrap">{REGION_LABEL[r]}</span>
              </Chip>
            ))}
          </div>
          <ul aria-label={`יעדים: ${REGION_LABEL[region]}`} className="max-h-72 overflow-y-auto rounded-card border border-border bg-surface">
            {regionList.map((d) => (
              <li key={d.id} className="border-b border-border last:border-b-0">
                <button type="button" onClick={() => onPick(d)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-raised">
                  <MapPin size={17} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-medium">{d.name}</span>
                    <span className="truncate text-xs text-muted">{destinationSub(d)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Round outlined − / + counter (the "who" card) */
export function RoundStepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const btn = 'flex size-11 items-center justify-center rounded-full border border-border-strong bg-surface text-[18px] transition-opacity duration-200 ease-out disabled:opacity-35'
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={`פחות ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>
        <Minus size={18} aria-hidden="true" />
      </button>
      <span className="w-8 text-center text-[17px] font-semibold" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label={`עוד ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
