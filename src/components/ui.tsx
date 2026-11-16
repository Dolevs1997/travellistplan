import { useEffect, useRef, type ReactNode } from 'react'
import {
  Binoculars,
  Bus,
  Car,
  CalendarDays,
  Check,
  Coffee,
  Footprints,
  House,
  Landmark,
  Map as MapIcon,
  Palette,
  ShoppingBag,
  Store,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
  Trees,
  Waves,
  User,
  Wallet,
  type LucideIcon,
  Signpost,
} from 'lucide-react'
import type { Day, StopKind, StopStatus, TransitMode } from '../data/types'
import { dayChipLabel } from '../data/helpers'
import { href } from '../router'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

export const KIND_ICON: Record<StopKind, LucideIcon> = {
  food: Coffee,
  heritage: Landmark,
  museum: Palette,
  view: Binoculars,
  nature: Trees,
  beach: Waves,
  market: Store,
  shopping: ShoppingBag,
  street: Signpost,
}

export const MODE_ICON: Record<TransitMode, LucideIcon> = {
  walk: Footprints,
  tram: TramFront,
  bus: Bus,
  metro: TrainFrontTunnel,
  train: TrainFront,
  car: Car,
}

export function IconTile({ kind, size = 48 }: { kind: StopKind; size?: number }) {
  const Icon = KIND_ICON[kind]
  const park = kind === 'nature'
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center rounded-tile',
        park ? 'bg-park text-park-ink' : 'bg-water text-accent',
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={2} />
    </span>
  )
}

type IconButtonProps = {
  label: string
  children: ReactNode
  onClick?: () => void
  to?: string
  variant?: 'surface' | 'floating' | 'raised'
  className?: string
}

export function IconButton({ label, children, onClick, to, variant = 'surface', className }: IconButtonProps) {
  const cls = cx(
    'flex size-11 shrink-0 items-center justify-center rounded-tile border border-border text-text transition-colors duration-200 ease-out hover:border-border-strong',
    variant === 'floating' && 'bg-surface/92 backdrop-blur-0',
    variant === 'surface' && 'bg-surface',
    variant === 'raised' && 'bg-raised',
    className,
  )
  if (to)
    return (
      <a href={href(to)} aria-label={label} className={cls}>
        {children}
      </a>
    )
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  )
}

export function Tag({ tone, children }: { tone: 'accent' | 'orange' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-medium',
        tone === 'accent' && 'bg-accent/12 text-accent',
        tone === 'orange' && 'bg-accent-2/12 text-accent-2',
        tone === 'muted' && 'border border-border-strong text-muted',
      )}
    >
      {children}
    </span>
  )
}

export function DayChips({
  days,
  activeId,
  onSelect,
}: {
  days: Day[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [activeId])

  return (
    <div
      ref={scroller}
      role="group"
      aria-label="בחירת יום"
      className="no-scrollbar -mx-4 flex shrink-0 gap-2 overflow-x-auto px-4"
      data-vaul-no-drag
    >
      {days.map((d, i) => {
        const active = d.id === activeId
        const free = d.stops.length === 0
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(d.id)}
            className={cx(
              'h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors duration-200 ease-out',
              active && 'border-accent bg-accent font-semibold text-on-accent',
              !active && free && 'border-dashed border-accent-2 bg-raised font-medium text-accent-2',
              !active && !free && 'border-border bg-raised font-medium text-muted hover:text-text',
            )}
          >
            {dayChipLabel(d, i)}
          </button>
        )
      })}
    </div>
  )
}

export function StopNode({ status, n }: { status: StopStatus; n: number }) {
  if (status === 'done')
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
        <Check size={16} strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">הושלם</span>
      </span>
    )
  if (status === 'current')
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-on-accent shadow-[0_0_0_5px_var(--halo-accent)]">
        {n}
      </span>
    )
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] border-accent bg-surface text-[13px] font-semibold text-text">
      {n}
    </span>
  )
}

const NAV = [
  { id: 'home', label: 'בית', to: '/', icon: House },
  { id: 'map', label: 'מפה', to: '/trip', icon: MapIcon },
  { id: 'schedule', label: 'לו״ז', to: '/trip/schedule', icon: CalendarDays },
  { id: 'budget', label: 'תקציב', to: '/budget', icon: Wallet },
  { id: 'profile', label: 'פרופיל', to: '/profile', icon: User },
] as const

export function BottomNav({ active }: { active: (typeof NAV)[number]['id'] }) {
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-[560px] grid-cols-5 border-t border-border bg-surface px-2 pt-1.5 pb-[max(14px,env(safe-area-inset-bottom))]"
    >
      {NAV.map(({ id, label, to, icon: Icon }) => {
        const on = id === active
        return (
          <a
            key={id}
            href={href(to)}
            aria-current={on ? 'page' : undefined}
            className={cx(
              'flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-200 ease-out',
              on ? 'font-semibold text-accent' : 'font-medium text-muted hover:text-text',
            )}
          >
            <Icon size={22} aria-hidden="true" />
            {label}
          </a>
        )
      })}
    </nav>
  )
}

export function Fab({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed bottom-24 z-30 flex size-[60px] items-center justify-center rounded-[20px] bg-accent text-on-accent shadow-fab transition-transform duration-200 ease-out hover:scale-105 active:scale-95"
      style={{ insetInlineEnd: 'max(20px, calc((100vw - 560px) / 2 + 20px))' }}
    >
      {children}
    </button>
  )
}

export function ScreenHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="text-sm text-muted">{eyebrow}</span>}
        <h1 className="text-[28px] leading-tight font-bold">{title}</h1>
      </div>
      {action}
    </header>
  )
}
