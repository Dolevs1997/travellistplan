import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { cx } from './ui'
import type { RestaurantDetails } from '../data/eat'
import { LANG } from '../data/placeLabels'

/* Shared pieces of the restaurant page and the place page */

export function Action({ href, icon, label, external }: { href: string; icon: React.ReactNode; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex h-[62px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[14px] border border-border bg-surface text-xs font-medium"
    >
      <span className="text-accent" aria-hidden="true">
        {icon}
      </span>
      {label}
    </a>
  )
}

export function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-[46px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-border-strong bg-surface px-2 text-sm font-semibold"
    >
      <span className="truncate">{children}</span>
      <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
    </a>
  )
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="text-base tracking-wider" aria-label={`${n.toFixed(1)} מתוך 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" className={i <= Math.round(n) ? 'text-[#E8A13A]' : 'text-border-strong'}>
          ★
        </span>
      ))}
    </span>
  )
}

export function Review({ review: rev }: { review: RestaurantDetails['reviews'][number] }) {
  const [open, setOpen] = useState(false)
  const long = rev.text.length > 260
  return (
    <article className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-3">
      <span className="flex items-center gap-2">
        {rev.photo ? (
          <img src={rev.photo} alt="" className="size-[30px] rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex size-[30px] items-center justify-center rounded-full bg-raised text-[13px] font-semibold">{rev.author.slice(0, 1)}</span>
        )}
        <span className="flex min-w-0 flex-col">
          <a href={rev.authorUrl} target="_blank" rel="noopener noreferrer" className="truncate text-[13px] font-semibold">
            {rev.author}
          </a>
          <span className="text-[11px] text-muted">
            {rev.rating ? <span className="text-[#E8A13A]">{'★'.repeat(rev.rating)}</span> : null}
            {rev.when ? ` · ${rev.when}` : ''}
          </span>
        </span>
      </span>
      <p className={cx('text-[13px] leading-relaxed whitespace-pre-line', !open && long && 'line-clamp-5')}>{rev.text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="self-start text-xs font-semibold text-accent">
          {open ? 'פחות' : 'עוד'}
        </button>
      )}
      {rev.translatedFrom && <span className="text-[11px] text-muted">תורגם מ{LANG[rev.translatedFrom] ?? rev.translatedFrom} · Google</span>}
    </article>
  )
}
