import { useEffect, useRef } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronLeft, GripVertical, Plus } from 'lucide-react'
import type { Day, Stop, StopStatus, Trip } from '../data/types'
import { freeSlot, isPastDay, slotPartLabel, stopStatus, timeRange, transitLabel } from '../data/helpers'
import { href } from '../router'
import { cx, MODE_ICON, StopNode, Tag } from './ui'

interface Props {
  trip: Trip
  day: Day
  selectedStopId: string | null
  onSelect: (id: string) => void
  onReorder: (from: number, to: number) => void
}

export default function Timeline({ trip, day, selectedStopId, onSelect, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = day.stops.map((s) => s.id)
  const slot = isPastDay(trip, day.id) ? null : freeSlot(day)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onReorder(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }

  return (
    <div className="flex flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: 'כדי להזיז עצירה: רווח להרמה, חיצים להזזה, רווח שוב להנחה.' },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol aria-label="עצירות היום – אפשר לגרור לשינוי הסדר" className="flex flex-col">
            {day.stops.map((s, i) => (
              <SortableStop
                key={s.id}
                stop={s}
                n={i + 1}
                status={stopStatus(trip, day.id, s.id)}
                nextStatus={i < day.stops.length - 1 ? stopStatus(trip, day.id, day.stops[i + 1].id) : null}
                isLast={i === day.stops.length - 1}
                trailingSlot={!!slot}
                selected={s.id === selectedStopId}
                onSelect={() => onSelect(s.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {slot && (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-accent-2 text-accent-2">
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <a
            href={href(`/day/${day.id}`)}
            className="flex h-[52px] flex-1 items-center justify-center rounded-card border-[1.5px] border-dashed border-accent-2 bg-accent-2/6 px-3 text-center text-[15px] font-medium text-accent-2 transition-colors duration-200 ease-out hover:bg-accent-2/12"
          >
            {slot.wholeDay ? 'היום פנוי – הוספת עצירה' : `${slotPartLabel(slot.start)} פנוי – הוספת עצירה`}
          </a>
        </div>
      )}

      {day.stops.length === 0 && !slot && <p className="text-muted">אין עצירות ביום הזה.</p>}
    </div>
  )
}

function SortableStop({
  stop,
  n,
  status,
  nextStatus,
  isLast,
  trailingSlot,
  selected,
  onSelect,
}: {
  stop: Stop
  n: number
  status: StopStatus
  nextStatus: StopStatus | null
  isLast: boolean
  trailingSlot: boolean
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
  })
  const ref = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  // Line below this node: teal while the next stop is already reached
  const lineDone = nextStatus === 'done' || nextStatus === 'current'
  const TransitIcon = stop.transitToNext ? MODE_ICON[stop.transitToNext.mode] : null

  return (
    <li
      ref={(el) => {
        setNodeRef(el)
        ref.current = el
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx('relative flex gap-3', isDragging && 'z-10 opacity-90')}
    >
      <div className="flex w-8 shrink-0 flex-col items-center pt-2.5">
        <StopNode status={status} n={n} />
        {!isLast && <span className={cx('w-0.5 flex-1', lineDone ? 'bg-accent' : 'bg-border-strong', status === 'current' && 'mt-1.5')} />}
        {isLast && trailingSlot && <span className="w-0 flex-1 border-s-2 border-dashed border-border-strong" />}
      </div>

      <div className={cx('min-w-0 flex-1', isLast && 'pb-3.5')}>
        <article
          aria-current={status === 'current' ? 'step' : undefined}
          className={cx(
            'flex items-center gap-1 rounded-card border bg-raised ps-3.5 pe-1 transition-[border-color,box-shadow] duration-200 ease-out',
            status === 'current' ? 'border-accent' : 'border-border',
            selected && 'shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]',
            isDragging && 'shadow-[0_16px_32px_rgba(0,0,0,0.25)]',
          )}
        >
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="flex min-w-0 flex-1 flex-col items-start gap-1.5 py-3 text-start"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className={cx('text-base font-semibold', status === 'done' ? 'text-muted' : 'text-text')}>{stop.name}</span>
              {status === 'current' && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">עכשיו</span>
              )}
            </span>
            <span className="text-[13px] text-muted">
              {timeRange(stop.start, stop.end)}
            </span>
            {(stop.heritage || stop.needsBooking) && (
              <span className="flex flex-wrap gap-1.5">
                {stop.heritage && <Tag tone="accent">אתר מורשת</Tag>}
                {stop.needsBooking && <Tag tone={stop.booked ? 'muted' : 'orange'}>{stop.booked ? 'הוזמן' : 'הזמנה מראש'}</Tag>}
              </span>
            )}
          </button>
          <a
            href={href(`/place/${stop.id}`)}
            aria-label={`פרטים על ${stop.name}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-tile text-muted hover:text-text"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </a>
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`גרירה לשינוי סדר: ${stop.name}`}
            data-vaul-no-drag
            className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-tile text-muted hover:text-text active:cursor-grabbing"
          >
            <GripVertical size={18} aria-hidden="true" />
          </button>
        </article>

        {!isLast && stop.transitToNext && TransitIcon && (
          <div className="flex items-center gap-1.5 px-1 pt-2 pb-2.5 text-xs text-muted">
            <TransitIcon size={14} aria-hidden="true" />
            {transitLabel(stop.transitToNext)}
          </div>
        )}
        {!isLast && !stop.transitToNext && <div className="h-3" />}
      </div>
    </li>
  )
}
