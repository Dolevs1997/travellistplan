import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Info, Landmark, MapPin, MapPinned, Route, Search, TrainFront, X } from 'lucide-react'
import { IconButton, cx } from './ui'
import { distanceKm } from '../data/helpers'
import { kindOf, newSession, pointTarget, resolveTarget, searchAvailable, suggest, type PlaceKindLabel, type Suggestion, type Target } from '../data/placeSearch'
import type { Day } from '../data/types'

const ICONS: Record<PlaceKindLabel['icon'], { Icon: typeof MapPin; tone: string }> = {
  street: { Icon: Route, tone: 'bg-accent/12 text-accent' },
  station: { Icon: TrainFront, tone: 'bg-[#2B6CB0]/12 text-[#2B6CB0]' },
  area: { Icon: MapPinned, tone: 'bg-[#8A6A2B]/12 text-[#8A6A2B]' },
  landmark: { Icon: Landmark, tone: 'bg-[#8A6A2B]/12 text-[#8A6A2B]' },
  pin: { Icon: MapPin, tone: 'bg-raised text-muted' },
}
const HEBREW = /[\u0590-\u05FF]/

/**
 * Full-screen search for "stay near…": streets, areas, stations and landmarks in the city (Google),
 * plus the trip's own days and stops, which match Hebrew names too.
 */
export default function LodgingSearch({
  city,
  center,
  days,
  onPick,
  onClose,
}: {
  city: string
  center: { lat: number; lng: number }
  days: Day[]
  onPick: (t: Target) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Suggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  // One session for typing and the pick: Google bills it as one search
  const session = useMemo(newSession, [])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const query = q.trim()
  useEffect(() => {
    setFailed(false)
    if (query.length < 2 || !searchAvailable()) {
      setResults(null)
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      suggest(query, center, session, ctrl.signal)
        .then((r) => setResults(r))
        .catch(() => !ctrl.signal.aborted && (setFailed(true), setResults([])))
        .finally(() => !ctrl.signal.aborted && setLoading(false))
    }, 250)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
    // center is fixed while the search is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, session])

  // The trip's days in this city and their stops (they have Hebrew names, so Hebrew finds them)
  const fromTrip = useMemo(() => {
    const lower = query.toLowerCase()
    const out: { id: string; label: string; sub: string; target: Target }[] = []
    days.forEach((d, i) => {
      const stops = d.stops.filter((s) => distanceKm(s, center) <= 15)
      if (stops.length >= 2 && !query) {
        const mid = { lat: stops.reduce((a, s) => a + s.lat, 0) / stops.length, lng: stops.reduce((a, s) => a + s.lng, 0) / stops.length }
        const spread = Math.max(...stops.map((s) => distanceKm(s, mid))) * 1000
        const areas = [...new Set(stops.map((s) => s.area).filter(Boolean))].slice(0, 2).join(' ו')
        const label = `ליד העצירות של יום ${i + 1}`
        out.push({ id: `day-${d.id}`, label, sub: `${areas ? `${areas} · ` : ''}${stops.length} עצירות`, target: pointTarget(label, areas || `יום ${i + 1}`, mid, Math.min(900, spread * 0.6)) })
      }
      for (const s of stops) {
        if (query ? !s.name.toLowerCase().includes(lower) && !s.area.toLowerCase().includes(lower) : out.length >= 5) continue
        out.push({ id: `stop-${s.id}`, label: s.name, sub: `עצירה ביום ${i + 1}${s.area ? ` · ${s.area}` : ''}`, target: pointTarget(s.name, `עצירה ביום ${i + 1}`, s) })
      }
    })
    return out.slice(0, query ? 6 : 5)
  }, [days, center, query])

  const pick = async (s: Suggestion) => {
    setPicking(s.id)
    try {
      onPick(await resolveTarget(s, session))
    } catch {
      setFailed(true)
      setPicking(null)
    }
  }

  const noGoogleMatch = results !== null && results.length === 0 && !loading && !failed
  return (
    <div role="dialog" aria-modal="true" aria-label={`חיפוש אזור ללינה ב${city}`} className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col gap-3 px-3.5 pt-3.5 pb-6">
        <div className="flex items-center gap-2">
          <IconButton label="סגירה" onClick={onClose} variant="surface" className="!border-0">
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <label className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border-2 border-accent bg-surface px-3.5 shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]">
            <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="sr-only">רחוב, שכונה, תחנה או אטרקציה</span>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="רחוב, שדרה, שכונה או תחנה"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
              enterKeyHint="search"
              autoComplete="off"
            />
            {q && (
              <button type="button" aria-label="ניקוי" onClick={() => (setQ(''), input.current?.focus())} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
        </div>

        {query.length >= 2 && (
          <section aria-label="תוצאות" className="flex flex-col">
            <h2 className="mx-1 mt-1 mb-0.5 text-xs font-semibold text-muted">תוצאות ב{city}</h2>
            {loading && results === null && (
              <p role="status" className="px-1 py-3 text-sm text-muted">
                מחפשים…
              </p>
            )}
            {(results ?? []).map((s) => {
              const k = kindOf(s.types)
              const { Icon, tone } = ICONS[k.icon]
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  disabled={!!picking}
                  className="flex items-center gap-3 rounded-xl px-1 py-2.5 text-start hover:bg-raised disabled:opacity-60"
                >
                  <span className={cx('flex size-[38px] shrink-0 items-center justify-center rounded-xl', tone)}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <bdi className="truncate text-[15px] font-semibold">{s.main}</bdi>
                    <span className="truncate text-xs text-muted">
                      {k.label}
                      {s.secondary ? ` · ${s.secondary.split(',')[0]}` : ''}
                    </span>
                  </span>
                  {picking === s.id && <span className="text-xs text-muted">טוענים…</span>}
                </button>
              )
            })}
            {failed && <p className="px-1 py-2 text-sm text-muted">החיפוש לא הצליח כרגע. נסו שוב בעוד רגע.</p>}
            {noGoogleMatch && (
              <p className="px-1 py-2 text-sm text-muted">
                {HEBREW.test(query) ? 'לא מצאנו בעברית. שמות רחובות ושכונות בחו״ל מוצאים באותיות לטיניות – למשל Liberdade או Alfama.' : `לא מצאנו את "${query}" ב${city}.`}
              </p>
            )}
          </section>
        )}

        {fromTrip.length > 0 && (
          <section aria-label="מהטיול שלכם" className="flex flex-col">
            {query.length >= 2 && <div className="mx-1 my-2 h-px bg-border" />}
            <h2 className="mx-1 mt-1 mb-0.5 text-xs font-semibold text-muted">מהטיול שלכם</h2>
            {fromTrip.map((t) => (
              <button key={t.id} type="button" onClick={() => onPick(t.target)} className="flex items-center gap-3 rounded-xl px-1 py-2.5 text-start hover:bg-raised">
                <span className={cx('flex size-[38px] shrink-0 items-center justify-center rounded-xl', t.id.startsWith('day') ? 'bg-text text-bg' : 'border-2 border-accent text-accent')}>
                  <MapPin size={17} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{t.label}</span>
                  <span className="truncate text-xs text-muted">{t.sub}</span>
                </span>
              </button>
            ))}
          </section>
        )}

        <p className="mt-auto flex items-start gap-2 rounded-card bg-raised px-3.5 py-3 text-xs leading-relaxed text-muted">
          <Info size={16} className="mt-px shrink-0" aria-hidden="true" />
          {searchAvailable()
            ? 'חפשו רחוב, שדרה, שכונה, תחנה או אטרקציה – נראה את מקומות הלינה במרחק הליכה ממנו. בחו״ל כדאי להקליד את השם באותיות לטיניות.'
            : 'חיפוש רחובות דורש חיבור ל-Google Places, שלא מוגדר כאן. אפשר לבחור עצירה מהטיול.'}
        </p>
      </div>
    </div>
  )
}
