import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw } from 'lucide-react'
import type { Day, Stop } from '../data/types'
import { useTrip } from '../state/TripStore'
import { cx } from './ui'

const UNDO_MS = 6000

/**
 * Remove a stop with a few seconds to undo. Returns `remove(day, stopId)` and the toast to render.
 * Undo restores the day's stops exactly as they were before the removal.
 */
export function useRemoveWithUndo(position: 'top' | 'bottom' = 'bottom') {
  const { dispatch } = useTrip()
  const [pending, setPending] = useState<{ dayId: string; stops: Stop[]; name: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const remove = (day: Day, stopId: string) => {
    const stop = day.stops.find((s) => s.id === stopId)
    if (!stop) return
    window.clearTimeout(timer.current)
    setPending({ dayId: day.id, stops: day.stops, name: stop.name })
    dispatch({ type: 'removeStop', stopId })
    timer.current = window.setTimeout(() => setPending(null), UNDO_MS)
  }

  const undo = () => {
    if (!pending) return
    window.clearTimeout(timer.current)
    dispatch({ type: 'restoreDayStops', dayId: pending.dayId, stops: pending.stops })
    setPending(null)
  }

  // Rendered into <body>: screens like the trip map sit in their own layer below the bottom sheet
  const toast = createPortal(
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'pointer-events-none fixed inset-x-4 z-[60] mx-auto flex max-w-[528px] justify-center',
        position === 'top' ? 'top-20' : 'bottom-[max(24px,env(safe-area-inset-bottom))]',
      )}
    >
      {pending && (
        <div className="pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-2xl bg-text px-4 py-2 text-[14px] text-bg shadow-[var(--float-shadow)]">
          <span className="min-w-0 flex-1 truncate" dir="auto">
            {pending.name} הוסר מהלו״ז
          </span>
          <button type="button" onClick={undo} className="flex h-10 shrink-0 items-center gap-1.5 rounded-tile border border-current/30 px-3 font-semibold underline-offset-2 hover:underline">
            <RotateCcw size={16} aria-hidden="true" />
            ביטול
          </button>
        </div>
      )}
    </div>,
    document.body,
  )

  return { remove, toast }
}
