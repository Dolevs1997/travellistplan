import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { openDuring, retimeStop } from '../data/dayParts'
import { hoursOn } from '../data/explore'
import { durationLabel, fromMin, stopDuration, timeRange, toMin } from '../data/helpers'
import type { Day, Stop } from '../data/types'
import { cx } from './ui'

/** "1530", "15:30", "9.05" or "9" as minutes since midnight */
function parseTime(text: string) {
  const t = text.trim()
  const m = t.match(/^(\d{1,2})[:.]?(\d{2})$/) ?? t.match(/^(\d{1,2})$/)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2] ?? 0)
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

const LAST_START = 23 * 60 + 45
const MAX_LENGTH = 12 * 60

/** Change when a place starts and how long it takes, and see what else moves before saving */
export default function StopTimeSheet({ stop, day, number, onSave, onClose }: { stop: Stop; day: Day; number: number; onSave: (stops: Stop[]) => void; onClose: () => void }) {
  const [start, setStart] = useState(toMin(stop.start))
  const [draft, setDraft] = useState(stop.start)
  const [minutes, setMinutes] = useState(stopDuration(stop))
  const [shift, setShift] = useState(true)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stepStart = (by: number) => {
    const next = Math.min(LAST_START, Math.max(0, start + by))
    setStart(next)
    setDraft(fromMin(next))
  }
  const typed = (text: string) => {
    setDraft(text)
    const at = parseTime(text)
    if (at !== null) setStart(at)
  }

  const moving = retimeStop(day, stop.id, start, minutes, true)
  const result = shift ? moving : retimeStop(day, stop.id, start, minutes, false)
  const hasClash = moving.overlaps.length > 0
  const end = start + minutes
  const unchanged = start === toMin(stop.start) && minutes === stopDuration(stop)
  const hours = hoursOn(stop.info?.hoursText, day.date)
  const open = openDuring(hours, start, end)
  const count = result.moved.length
  const save = () => {
    if (result.tooLate) return
    if (unchanged) onClose()
    else onSave(result.stops)
  }

  const stepper = 'flex h-11 min-w-[66px] items-center justify-center rounded-[10px] bg-raised text-sm font-semibold'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-[rgba(21,24,29,0.45)]" />
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`שינוי השעה של ${stop.name}`} className="relative flex max-h-[94vh] w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-t-[28px] bg-bg p-4 pb-[max(16px,env(safe-area-inset-bottom))] outline-none">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-xl font-bold">
              <bdi>{stop.name}</bdi>
            </h2>
            <span className="text-[13px] text-muted">
              יום {number} · עכשיו {timeRange(stop.start, stop.end)}
            </span>
          </div>
          <button type="button" aria-label="סגירה" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised">
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="stop-start" className="text-[13px] font-semibold text-muted">
            שעת התחלה
          </label>
          <div className="flex items-center justify-between gap-1 rounded-[14px] border border-border-strong bg-surface p-1.5 focus-within:border-accent">
            <button type="button" aria-label="15 דקות מוקדם יותר" onClick={() => stepStart(-15)} className={stepper}>
              −15
            </button>
            <input
              id="stop-start"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={draft}
              onChange={(e) => typed(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => setDraft(fromMin(start))}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-[120px] min-w-0 bg-transparent text-center text-[30px] font-bold tracking-wide outline-none"
            />
            <button type="button" aria-label="15 דקות מאוחר יותר" onClick={() => stepStart(15)} className={stepper}>
              +15
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-muted">כמה זמן</span>
          <div className="flex items-center justify-between gap-1 rounded-[14px] border border-border-strong bg-surface p-1.5">
            <button type="button" aria-label="פחות זמן" onClick={() => setMinutes((m) => Math.max(15, m - 15))} className={stepper}>
              −15
            </button>
            <b className="text-base" aria-live="polite">
              {durationLabel(minutes)}
            </b>
            <button type="button" aria-label="יותר זמן" onClick={() => setMinutes((m) => Math.min(MAX_LENGTH, m + 15))} className={stepper}>
              +15
            </button>
          </div>
        </div>

        {open === false && (
          <p className="flex items-center gap-2 rounded-[14px] bg-accent-2/10 px-3 py-2.5 text-[13px] font-semibold text-accent-2">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span>
              המקום לא פתוח בכל הזמן הזה · <bdi dir="ltr">{hours}</bdi>
            </span>
          </p>
        )}

        {result.tooLate ? (
          <p role="alert" className="flex items-center gap-2 rounded-[14px] bg-accent-2/10 px-3 py-2.5 text-[13px] font-semibold text-accent-2">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            בשעה הזו היום גולש אחרי חצות. בחרו שעה מוקדמת יותר או זמן קצר יותר.
          </p>
        ) : hasClash ? (
          <>
            <div className="flex flex-col gap-0.5 rounded-[14px] border border-border bg-surface px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13px] font-bold text-accent-2">
                <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  חופף ל<bdi>{moving.overlaps[0].name}</bdi>
                  {shift ? '. כך היום ייראה:' : ''}
                </span>
              </span>
              {shift &&
                moving.moved.map((m) => (
                  <span key={m.id} className="flex min-h-[30px] items-center justify-between gap-2 text-[13px]">
                    <bdi className="min-w-0 truncate">{m.name}</bdi>
                    <span dir="ltr" className="shrink-0">
                      <s className="text-muted">{m.from}</s> → <b className="text-accent">{m.to}</b>
                    </span>
                  </span>
                ))}
              {moving.stuck.length > 0 && <span className="text-xs text-muted">ביקור של כמה שעות לא זז אוטומטית.</span>}
            </div>
            <div role="radiogroup" aria-label="מה לעשות עם החפיפה" className="flex flex-col gap-1.5">
              {[
                { on: true, label: 'להזיז את מה שאחרי' },
                { on: false, label: 'להשאיר את השאר במקום, עם חפיפה' },
              ].map((o) => (
                <button
                  key={String(o.on)}
                  type="button"
                  role="radio"
                  aria-checked={shift === o.on}
                  onClick={() => setShift(o.on)}
                  className={cx('flex min-h-[46px] items-center gap-2.5 rounded-[13px] px-3 text-start text-[13px]', shift === o.on ? 'border-2 border-accent bg-accent/6 font-semibold' : 'border border-border bg-surface')}
                >
                  <span className={cx('size-[18px] shrink-0 rounded-full', shift === o.on ? 'border-[5px] border-accent' : 'border-[1.5px] border-border-strong')} aria-hidden="true" />
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-[14px] bg-accent/10 px-3 py-2.5 text-[13px] font-semibold text-accent">
            {open === true && (
              <span className="flex items-center gap-2">
                <Check size={16} className="shrink-0" aria-hidden="true" />
                <span>
                  פתוח בשעה הזו · <bdi dir="ltr">{hours}</bdi>
                </span>
              </span>
            )}
            <span className="flex items-center gap-2">
              <Check size={16} className="shrink-0" aria-hidden="true" />
              לא חופף. שאר היום נשאר במקום
            </span>
          </div>
        )}

        <button type="button" disabled={result.tooLate} onClick={save} className="h-[52px] w-full shrink-0 rounded-2xl bg-accent px-2 text-[15px] font-semibold text-on-accent disabled:opacity-40">
          {result.tooLate ? 'שמירה' : hasClash && shift && count > 0 ? (count === 1 ? 'שמירה והזזת מקום אחד' : `שמירה והזזת ${count} מקומות`) : <>שמירה · {timeRange(fromMin(start), fromMin(end))}</>}
        </button>
      </section>
    </div>
  )
}
