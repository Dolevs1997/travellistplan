import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Landmark, MapPin, Minus, Plus, Search, Sparkles, X } from 'lucide-react'
import { PARTS, coordsFromText, indexAt, nextInPart, partOf, type DayPart } from '../data/dayParts'
import { restaurant } from '../data/eat'
import { dayArea, explore, exploreAvailable, kindOf, matchTrip, nearestStop, toPlaceInfo, type ExploreCat, type ExplorePlace } from '../data/explore'
import { DEFAULT_VISIT, durationLabel, fromMin, timeRange, toMin } from '../data/helpers'
import { googlePhoto } from '../data/lodging'
import { detailsToExplore } from '../data/placeFull'
import { KIND_LABEL, searchPlaces } from '../data/places'
import { newSession, searchAvailable, spotOf, suggest, type Suggestion } from '../data/placeSearch'
import type { Day, Destination, PlaceInfo, StopKind } from '../data/types'
import { href } from '../router'
import { useTrip } from '../state/TripStore'
import { cx } from './ui'

type Cat = 'suit' | ExploreCat
const CATS: { id: ExploreCat; label: string }[] = [
  { id: 'food', label: 'מסעדות' },
  { id: 'cafes', label: 'בתי קפה' },
  { id: 'sights', label: 'אטרקציות' },
  { id: 'views', label: 'תצפיות' },
  { id: 'museums', label: 'מוזיאונים' },
  { id: 'nature', label: 'טבע' },
]
const MANUAL_KINDS: { kind: StopKind; label: string }[] = [
  { kind: 'food', label: 'אוכל' },
  { kind: 'heritage', label: 'אטרקציה' },
  { kind: 'shopping', label: 'קניות' },
  { kind: 'nature', label: 'טבע' },
  { kind: 'street', label: 'אחר' },
]
const isFood = (p: ExplorePlace) => p.types.some((t) => ['restaurant', 'cafe', 'coffee_shop', 'bakery', 'bar', 'food'].includes(t))

/** Add to a day: from recommendations around its stops, or by hand (a place found by name, or your own) */
export default function RoutePicker({ day, number, near, initialPart, initialTab, onClose }: { day: Day; number: number; near: Destination; initialPart: DayPart; initialTab: 'rec' | 'manual'; onClose: () => void }) {
  const { dispatch } = useTrip()
  const [tab, setTab] = useState(initialTab)
  const [part, setPart] = useState(initialPart)
  const [added, setAdded] = useState<{ name: string; start: number; end: number }[]>([])
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const add = (place: PlaceInfo, start: number, minutes: number, note?: string) => {
    dispatch({ type: 'insertPlace', dayId: day.id, place, index: indexAt(day, start), start: fromMin(start), minutes, note })
    setAdded((a) => [...a, { name: place.name, start, end: start + minutes }])
  }
  const last = added[added.length - 1]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-[rgba(21,24,29,0.45)]" />
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`הוספה ליום ${number}`} className="relative flex h-[94vh] w-full max-w-[560px] flex-col rounded-t-[28px] bg-bg outline-none">
        <div className="flex shrink-0 flex-col gap-2.5 px-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[21px] font-bold">הוספה ליום {number}</h2>
            <button type="button" aria-label="סגירה" onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-raised">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div role="tablist" aria-label="איך מוסיפים" className="flex rounded-[13px] bg-raised p-[3px]">
            {(
              [
                ['rec', 'מומלצים'],
                ['manual', 'הוספה ידנית'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx('h-10 flex-1 rounded-[10px] text-sm', tab === id ? 'bg-surface font-bold shadow-[0_1px_3px_rgba(21,24,29,0.1)]' : 'font-medium text-muted')}>
                {label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="חלק ביום" className="flex gap-1.5">
            {PARTS.map((p) => {
              const slot = nextInPart(day, p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={part === p.id}
                  onClick={() => setPart(p.id)}
                  className={cx('flex h-12 flex-1 flex-col items-center justify-center gap-px rounded-[13px]', part === p.id ? 'border-2 border-accent bg-accent/8 text-accent' : 'border border-border bg-surface')}
                >
                  <b className="text-sm font-semibold">{p.label}</b>
                  <span className={cx('text-[11px]', part !== p.id && 'text-muted')}>{slot.free ? `פנוי מ-${fromMin(slot.start)}` : 'מלא'}</span>
                </button>
              )
            })}
          </div>
        </div>

        {tab === 'rec' ? <Recommended day={day} near={near} part={part} onAdd={add} /> : <Manual key={part} day={day} near={near} part={part} onAdd={add} />}

        {last && (
          <div className="shrink-0 px-4 pt-2 pb-[max(14px,env(safe-area-inset-bottom))]">
            <div role="status" className="flex items-center gap-2.5 rounded-[17px] bg-text py-2 ps-3.5 pe-2 text-bg">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-sm">{added.length === 1 ? 'נוסף מקום אחד' : `נוספו ${added.length} מקומות`}</b>
                <span className="truncate text-xs opacity-75">
                  <bdi>{last.name}</bdi> · {timeRange(fromMin(last.start), fromMin(last.end))}
                </span>
              </span>
              <button type="button" onClick={onClose} className="h-10 shrink-0 rounded-xl bg-bg px-4 text-sm font-semibold text-text">
                סיום
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Recommended({ day, near, part, onAdd }: { day: Day; near: Destination; part: DayPart; onAdd: (p: PlaceInfo, start: number, minutes: number) => void }) {
  const { state } = useTrip()
  const [cat, setCat] = useState<Cat>('suit')
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<ExplorePlace[] | null>(null)
  const [failed, setFailed] = useState(false)
  const query = q.trim()
  const actual: ExploreCat = cat === 'suit' ? (part === 'evening' ? 'food' : 'top') : cat
  const area = dayArea(day, near)
  const areaKey = `${area.center.lat.toFixed(4)},${area.center.lng.toFixed(4)},${area.radius}`
  const partInfo = PARTS.find((p) => p.id === part)!

  useEffect(() => {
    let live = true
    setPlaces(null)
    setFailed(false)
    const timer = window.setTimeout(
      () =>
        explore(query.length >= 2 ? { q: query } : { cat: actual }, area)
          .then((r) => live && setPlaces(r))
          .catch(() => live && (setFailed(true), setPlaces([]))),
      query.length >= 2 ? 350 : 0,
    )
    return () => {
      live = false
      window.clearTimeout(timer)
    }
    // areaKey stands for the area
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, actual, query])

  const inTrip = matchTrip(places ?? [], state.trip.days)
  const list = (places ?? []).map((p) => ({ p, near: nearestStop(p, day.stops), inTrip: inTrip.get(p.id) }))
  if (!query) list.sort((a, b) => (a.near?.km ?? 0) - (b.near?.km ?? 0) - ((a.p.rating ?? 0) - (b.p.rating ?? 0)) * 0.6)
  list.sort((a, b) => Number(!!a.inTrip) - Number(!!b.inTrip))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto px-4 pt-2.5 pb-3">
      <label className="flex h-11 shrink-0 items-center gap-2 rounded-[13px] border border-border-strong bg-surface px-3 focus-within:border-accent">
        <Search size={17} className="shrink-0" aria-hidden="true" />
        <span className="sr-only">חיפוש בהמלצות</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בתוך ההמלצות" enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>
      {!query && (
        <div role="group" aria-label="קטגוריה" className="no-scrollbar -mx-4 flex shrink-0 gap-2 overflow-x-auto px-4">
          {[{ id: 'suit' as Cat, label: `מתאים ${partInfo.to}` }, ...CATS].map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={cx('flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px]', cat === c.id ? 'border-text bg-text font-semibold text-bg' : 'border-border bg-surface font-medium')}>
              {c.id === 'suit' && <Sparkles size={13} aria-hidden="true" />}
              {c.label}
            </button>
          ))}
        </div>
      )}
      <h3 className="text-base font-bold">{query ? `תוצאות עבור "${query}"` : day.stops.length ? `ליד העצירות של היום` : `מומלץ באזור`}</h3>
      {!exploreAvailable() ? (
        <p className="rounded-card bg-raised p-3 text-sm text-muted">ההמלצות דורשות חיבור ל-Google Places, שלא מוגדר כאן. אפשר להוסיף בלשונית "הוספה ידנית".</p>
      ) : places === null ? (
        <p role="status" className="py-5 text-center text-sm text-muted">
          מחפשים מקומות…
        </p>
      ) : failed ? (
        <p className="py-5 text-center text-sm text-muted">לא הצלחנו לטעון המלצות כרגע. נסו שוב בעוד רגע, או הוסיפו ידנית.</p>
      ) : list.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted">לא מצאנו מקומות כאלה באזור.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map(({ p, near: n, inTrip: t }) => {
            const kind = kindOf(p, query ? undefined : actual)
            const to = isFood(p) ? `/restaurant/${p.id}/${day.id}` : `/spot/${p.id}/${day.id}`
            return (
              <li key={p.id} className={cx('flex items-center gap-2.5 rounded-2xl border p-[7px]', t ? 'border-accent bg-accent/6' : 'border-border bg-surface')}>
                <a href={href(t ? `/place/${t.stop.id}` : to)} aria-label={`${p.name} – פרטים`} className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Thumb photo={p.photo} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <bdi className="truncate text-[15px] font-semibold">{p.name}</bdi>
                    <span className="truncate text-xs text-muted">
                      {p.rating ? (
                        <>
                          <b className="text-text">★ {p.rating.toFixed(1)}</b>
                          {p.ratingCount ? ` (${p.ratingCount.toLocaleString('en-US')})` : ''} ·{' '}
                        </>
                      ) : null}
                      {p.typeLabel ?? KIND_LABEL[kind]}
                    </span>
                    {n && n.km > 0.02 && (
                      <span className="truncate text-xs font-semibold text-accent">
                        {n.km > 2 ? `${Math.round(n.km * 10) / 10} ק״מ` : `${n.minutes} דק׳ הליכה`} מ<bdi>{n.name.split(/ [–-] /)[0]}</bdi>
                      </span>
                    )}
                  </span>
                </a>
                {t ? (
                  <span className="flex shrink-0 flex-col items-center gap-px">
                    <span aria-label="כבר בטיול" className="flex size-11 items-center justify-center rounded-[13px] bg-accent text-on-accent">
                      <Check size={20} aria-hidden="true" />
                    </span>
                    <b dir="ltr" className="text-[11px] text-accent">
                      {t.stop.start}
                    </b>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`הוספת ${p.name} ${partInfo.to}`}
                    onClick={() => onAdd(toPlaceInfo(p, query ? undefined : actual), nextInPart(day, part, p).start, DEFAULT_VISIT[kind])}
                    className="flex size-11 shrink-0 items-center justify-center rounded-[13px] border-[1.5px] border-accent text-accent hover:bg-accent/8"
                  >
                    <Plus size={20} aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {list.length > 0 && <p className="text-center text-[11px] text-muted">דירוגים ותמונות: Google</p>}
    </div>
  )
}

function Thumb({ photo }: { photo?: string }) {
  const [failed, setFailed] = useState(false)
  if (photo && !failed) return <img src={googlePhoto(photo, 200)} alt="" loading="lazy" onError={() => setFailed(true)} className="size-[68px] shrink-0 rounded-xl object-cover" />
  return (
    <span className="flex size-[68px] shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent" aria-hidden="true">
      <Landmark size={22} />
    </span>
  )
}

/** What the name search found: a Google suggestion, or (without Google) a place from the free search */
type Hit = { id: string; name: string; sub?: string; load: () => Promise<PlaceInfo> }

function Manual({ day, near, part, onAdd }: { day: Day; near: Destination; part: DayPart; onAdd: (p: PlaceInfo, start: number, minutes: number, note?: string) => void }) {
  const session = useMemo(newSession, [])
  const [name, setName] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [picked, setPicked] = useState<PlaceInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [kind, setKind] = useState<StopKind>(part === 'evening' ? 'food' : 'heritage')
  const [address, setAddress] = useState('')
  const [addressHits, setAddressHits] = useState<Suggestion[]>([])
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null)
  const [time, setTime] = useState(() => fromMin(nextInPart(day, part).start))
  const [minutes, setMinutes] = useState(90)
  const [note, setNote] = useState('')
  const query = name.trim()

  // After each add, the time moves to the next free slot
  useEffect(() => {
    setTime(fromMin(nextInPart(day, part).start))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.stops.length])

  // Places matching the name
  useEffect(() => {
    if (picked || query.length < 2) {
      setHits(null)
      return
    }
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        if (searchAvailable()) {
          const found = await suggest(query, near, session, ctrl.signal)
          if (ctrl.signal.aborted) return
          if (searchAvailable()) {
            setHits(found.slice(0, 4).map((s) => ({ id: s.id, name: s.main, sub: s.secondary?.split(',')[0], load: async () => toPlaceInfo(detailsToExplore(await restaurant(s.id))) })))
            return
          }
        }
        const free = await searchPlaces(query, near, ctrl.signal)
        if (!ctrl.signal.aborted) setHits(free.slice(0, 4).map((p) => ({ id: p.ref, name: p.name, sub: p.address, load: async () => p })))
      } catch {
        if (!ctrl.signal.aborted) setHits([])
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, picked, near, session])

  // Addresses: a pasted map link or coordinates count at once; otherwise suggestions
  useEffect(() => {
    const a = address.trim()
    const coords = coordsFromText(a)
    if (coords) {
      setSpot(coords)
      setAddressHits([])
      return
    }
    if (spot || a.length < 3 || !searchAvailable()) {
      setAddressHits([])
      return
    }
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => {
      suggest(a, near, session, ctrl.signal)
        .then((r) => !ctrl.signal.aborted && setAddressHits(r.slice(0, 3)))
        .catch(() => !ctrl.signal.aborted && setAddressHits([]))
    }, 300)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
    // spot is cleared when the address text changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, near, session])

  const choose = async (h: Hit) => {
    setLoading(true)
    try {
      const info = await h.load()
      setPicked(info)
      setName(info.name)
      setMinutes(DEFAULT_VISIT[info.kind])
      setTime(fromMin(nextInPart(day, part, info).start))
    } catch {
      setHits([])
    } finally {
      setLoading(false)
    }
  }

  const start = toMin(time)
  const clash = day.stops.find((s) => toMin(s.start) < start + minutes && toMin(s.end) > start)
  const partTo = PARTS.find((p) => p.id === partOf(time))!.to
  const valid = query.length > 0 && !!time

  const save = () => {
    if (!valid) return
    const anchor = day.stops[day.stops.length - 1] ?? near
    const place: PlaceInfo = picked ?? {
      source: 'manual',
      ref: `manual-${Date.now().toString(36)}`,
      name: query,
      kind,
      lat: spot?.lat ?? anchor.lat,
      lng: spot?.lng ?? anchor.lng,
      description: MANUAL_KINDS.find((k) => k.kind === kind)?.label,
      address: address.trim() || undefined,
      noLocation: !spot,
    }
    onAdd(place, start, minutes, note.trim() || undefined)
    setName('')
    setPicked(null)
    setAddress('')
    setSpot(null)
    setNote('')
    setHits(null)
    setMinutes(90)
  }

  const box = 'h-[46px] rounded-[13px] border border-border-strong bg-surface px-3 text-[15px] outline-none focus:border-accent'
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-4 pt-2.5 pb-3">
        <label className="flex shrink-0 flex-col gap-1 text-[13px] font-semibold text-muted">
          שם המקום
          <span className="flex h-[46px] items-center gap-2 rounded-[13px] border-2 border-accent bg-surface px-3">
            <Search size={17} className="shrink-0 text-accent" aria-hidden="true" />
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setPicked(null)
              }}
              placeholder="מסעדה, אטרקציה, או כל מקום אחר"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-normal text-text outline-none placeholder:text-muted"
            />
            {name && (
              <button type="button" aria-label="ניקוי" onClick={() => (setName(''), setPicked(null))} className="flex size-7 items-center justify-center rounded-full bg-raised">
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </span>
        </label>

        {picked ? (
          <p className="flex shrink-0 items-center gap-2 rounded-[14px] bg-accent/8 px-3 py-2.5 text-[13px] font-semibold text-accent">
            <Check size={16} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">נמצא: {picked.address ?? KIND_LABEL[picked.kind]}</span>
          </p>
        ) : (
          query.length >= 2 &&
          hits !== null && (
            <div className="flex shrink-0 flex-col rounded-[14px] border border-border bg-surface px-2.5">
              {hits.map((h) => (
                <button key={h.id} type="button" disabled={loading} onClick={() => choose(h)} className="flex min-h-11 items-center gap-2 border-b border-border py-1.5 text-start disabled:opacity-60">
                  <MapPin size={16} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <bdi className="truncate text-sm font-semibold">{h.name}</bdi>
                    {h.sub && <bdi className="truncate text-xs text-muted">{h.sub}</bdi>}
                  </span>
                </button>
              ))}
              <span className="flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">
                <Check size={16} className="shrink-0" aria-hidden="true" />
                {hits.length ? 'לא ברשימה? נוסיף אותו כמקום שלך' : 'לא נמצא באזור. נוסיף אותו כמקום שלך'}
              </span>
            </div>
          )
        )}

        {!picked && (
          <>
            <fieldset className="flex shrink-0 flex-col gap-1">
              <legend className="mb-1 text-[13px] font-semibold text-muted">סוג</legend>
              <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
                {MANUAL_KINDS.map((k) => (
                  <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)} className={cx('h-9 shrink-0 rounded-full border px-3.5 text-[13px]', kind === k.kind ? 'border-text bg-text font-semibold text-bg' : 'border-border bg-surface font-medium')}>
                    {k.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex shrink-0 flex-col gap-1">
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
                כתובת (לא חובה, לניווט ולמפה)
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    setSpot(null)
                  }}
                  placeholder="רחוב, עיר או קישור מגוגל מפות"
                  className={cx(box, 'font-normal text-text placeholder:text-muted')}
                />
              </label>
              {addressHits.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={async () => {
                    const at = await spotOf(a, session).catch(() => null)
                    if (at) setSpot(at)
                    setAddress([a.main, a.secondary?.split(',')[0]].filter(Boolean).join(', '))
                    setAddressHits([])
                  }}
                  className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-start text-sm hover:bg-raised"
                >
                  <MapPin size={15} className="shrink-0 text-accent" aria-hidden="true" />
                  <bdi className="truncate">{[a.main, a.secondary?.split(',')[0]].filter(Boolean).join(', ')}</bdi>
                </button>
              ))}
              {spot ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                  <Check size={13} aria-hidden="true" />
                  המיקום נמצא. יהיה ניווט ומיקום במפה
                </span>
              ) : address.trim() ? (
                <span className="text-xs text-muted">בחרו כתובת מהרשימה או הדביקו קישור מגוגל מפות, כדי שיהיה ניווט.</span>
              ) : null}
            </div>
          </>
        )}

        <div className="grid shrink-0 grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
            שעה
            <input type="time" step={300} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} className={cx(box, 'text-center font-bold text-text')} />
          </label>
          <div className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
            כמה זמן
            <span className="flex h-[46px] items-center justify-between rounded-[13px] border border-border-strong bg-surface px-1.5 text-text">
              <button type="button" aria-label="פחות זמן" onClick={() => setMinutes((m) => Math.max(15, m - 15))} className="flex size-[34px] items-center justify-center rounded-[9px] bg-raised">
                <Minus size={15} aria-hidden="true" />
              </button>
              <b className="text-sm" aria-live="polite">
                {durationLabel(minutes)}
              </b>
              <button type="button" aria-label="יותר זמן" onClick={() => setMinutes((m) => Math.min(12 * 60, m + 15))} className="flex size-[34px] items-center justify-center rounded-[9px] bg-raised">
                <Plus size={15} aria-hidden="true" />
              </button>
            </span>
          </div>
        </div>
        {clash && <p className="shrink-0 text-xs text-accent-2">השעה חופפת ל<bdi>{clash.name}</bdi> ({timeRange(clash.start, clash.end)}). מה שאחרי המקום החדש יזוז בהתאם.</p>}

        <label className="flex shrink-0 flex-col gap-1 text-[13px] font-semibold text-muted">
          הערה (לא חובה)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="קוד כניסה, טלפון, מה להביא…" className={cx(box, 'font-normal text-text placeholder:text-muted')} />
        </label>
      </div>
      <div className="shrink-0 border-t border-border px-4 pt-3 pb-3">
        <button type="button" disabled={!valid} onClick={save} className="h-[52px] w-full rounded-2xl bg-accent px-2 text-[15px] font-semibold whitespace-nowrap text-on-accent disabled:opacity-40">
          הוספה {partTo} · {timeRange(time, fromMin(start + minutes))}
        </button>
      </div>
    </>
  )
}
