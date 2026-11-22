import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowRight, Check, Images, Lightbulb, Sparkles } from 'lucide-react'
import { LinkButton, Review, Stars } from './PlaceParts'
import { cx } from './ui'
import type { RestaurantDetails } from '../data/eat'
import { ticketLinks, type Photo } from '../data/placeFull'
import { FACT_LABEL } from '../data/placeLabels'
import type { PlaceDetails } from '../data/places'

/* The parts of a place's page shared by a trip stop's page and any place's page (from the map) */

/** A swipeable photo strip with a counter, the photo's credit, thumbnails and a back button */
export function PlaceGallery({ photos, name, onBack, fallback }: { photos: Photo[]; name: string; onBack: () => void; fallback: ReactNode }) {
  const [photo, setPhoto] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  const current = photos[photo]
  const show = (i: number) => {
    strip.current?.scrollTo({ left: -i * strip.current.clientWidth, behavior: 'smooth' }) // RTL scrolls negative
    setPhoto(i)
  }
  return (
    <>
      <div className="relative h-[280px] shrink-0 bg-raised">
        {photos.length ? (
          <div
            ref={strip}
            role="region"
            aria-label={`תמונות של ${name}`}
            className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
            onScroll={(e) => {
              const i = Math.round(Math.abs(e.currentTarget.scrollLeft) / e.currentTarget.clientWidth)
              if (i !== photo) setPhoto(i)
            }}
          >
            {photos.map((p, i) => (
              <img key={p.src} src={p.src} alt={`${name} – תמונה ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} className="h-full w-full shrink-0 snap-center object-cover" />
            ))}
          </div>
        ) : (
          fallback
        )}
        <button type="button" aria-label="חזרה" onClick={onBack} className="absolute top-3.5 right-3.5 z-10 flex size-[42px] items-center justify-center rounded-full bg-surface/94 text-text shadow">
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        {photos.length > 1 && (
          <span className="absolute bottom-3 left-3 flex h-[26px] items-center gap-1.5 rounded-full bg-black/65 px-2.5 text-xs text-white">
            <Images size={13} aria-hidden="true" />
            {photo + 1} / {photos.length}
          </span>
        )}
        {current?.credit && (
          <a href={current.creditUrl} target="_blank" rel="noopener noreferrer" className="absolute right-3.5 bottom-3.5 max-w-[55%] truncate text-[10px] text-white/90 drop-shadow">
            תמונה: {current.credit}
          </a>
        )}
      </div>
      {photos.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-2">
          {photos.map((p, i) => (
            <button key={p.src} type="button" aria-label={`תמונה ${i + 1}`} aria-pressed={i === photo} onClick={() => show(i)} className="shrink-0">
              <img
                src={p.thumb ?? p.src}
                alt=""
                loading="lazy"
                className={cx('size-16 rounded-xl object-cover', i === photo && 'outline-[2.5px] -outline-offset-[2.5px] outline-accent outline-solid')}
              />
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export interface TicketInfo {
  name: string
  city: string
  website?: string
  needsBooking?: boolean
  /** Only for a trip stop: whether its tickets are booked, and how to mark it */
  booked?: boolean
  onBooked?: () => void
}

/** About, what to do, tickets, good to know, rating and reviews */
export function PlaceSections({
  google,
  wiki,
  tickets,
  ticketsRef,
}: {
  google: RestaurantDetails | null | undefined
  wiki: PlaceDetails | null | undefined
  /** Shown only for places that usually sell tickets */
  tickets?: TicketInfo
  ticketsRef?: RefObject<HTMLElement | null>
}) {
  const summary = google?.summary ?? wiki?.summary
  const facts = google ? FACT_LABEL.filter(([k]) => google.facts[k] && !['dineIn', 'takeout', 'delivery'].includes(k)) : []
  return (
    <>
      {(summary || wiki === undefined) && (
        <section aria-label="על המקום" className="flex flex-col gap-2 px-4 pt-5">
          <h2 className="text-[17px] font-bold">על המקום</h2>
          {summary ? (
            <p className="text-[15px] leading-relaxed" lang={google?.summary ? 'he' : wiki?.summaryLang}>
              {summary}
            </p>
          ) : (
            <p role="status" className="text-sm text-muted">
              טוענים מידע…
            </p>
          )}
        </section>
      )}

      {wiki && (wiki.activities.length > 0 || wiki.tips.length > 0) && (
        <section aria-label="מה יש לעשות" className="flex flex-col gap-2.5 px-4 pt-5">
          <h2 className="text-[17px] font-bold">מה יש לעשות</h2>
          <ul className="flex flex-col gap-2">
            {wiki.activities.map((a) => (
              <li key={a} className="flex items-start gap-2.5 rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                {a}
              </li>
            ))}
            {wiki.tips.map((t) => (
              <li key={t} className="flex items-start gap-2.5 rounded-2xl bg-raised px-3 py-2.5 text-sm">
                <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent-2" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tickets && (
        <section ref={ticketsRef} aria-label="כרטיסים" className="flex scroll-mt-4 flex-col gap-2.5 px-4 pt-5">
          <h2 className="text-[17px] font-bold">כרטיסים</h2>
          <div className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-surface p-3.5">
            <p className="text-[13px] leading-relaxed text-muted">
              {tickets.needsBooking ? 'למקום הזה כדאי להזמין כרטיסים מראש. ' : 'לא בכל מקום צריך כרטיס – כדאי לבדוק באתר הרשמי. '}
              מחירים וזמינות לתאריך שלכם – באתרים האלה.
            </p>
            <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
              {ticketLinks(tickets.name, tickets.city, tickets.website).map((l) => (
                <LinkButton key={l.id} href={l.url}>
                  {l.label}
                </LinkButton>
              ))}
            </div>
            {tickets.onBooked && (
              <button
                type="button"
                aria-pressed={!!tickets.booked}
                onClick={tickets.onBooked}
                className={cx('flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold', tickets.booked ? 'bg-accent text-on-accent' : 'border border-border-strong')}
              >
                <Check size={16} aria-hidden="true" />
                {tickets.booked ? 'הכרטיסים הוזמנו' : 'סימון שהזמנתי כרטיסים'}
              </button>
            )}
          </div>
        </section>
      )}

      {(facts.length > 0 || (wiki?.facts.length ?? 0) > 0) && (
        <section aria-label="כדאי לדעת" className="flex flex-col gap-2.5 px-4 pt-5">
          <h2 className="text-[17px] font-bold">כדאי לדעת</h2>
          {facts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {facts.map(([k, label]) => (
                <span key={k} className="inline-flex h-8 items-center rounded-full bg-raised px-3 text-xs font-medium">
                  {label}
                </span>
              ))}
            </div>
          )}
          {wiki && wiki.facts.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed" lang={wiki.summaryLang}>
              {wiki.facts.slice(0, 4).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {google && (google.rating || google.reviews.length > 0) && (
        <section aria-label="דירוג וביקורות" className="flex flex-col gap-2.5 px-4 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold">דירוג וביקורות</h2>
            {google.mapsUrl && (
              <a href={google.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-accent">
                כל הביקורות בגוגל
              </a>
            )}
          </div>
          {google.rating ? (
            <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-3.5 py-3">
              <b className="text-[38px] leading-none font-bold">{google.rating.toFixed(1)}</b>
              <span className="flex flex-col gap-1">
                <Stars n={google.rating} />
                <span className="text-xs text-muted">{(google.ratingCount ?? 0).toLocaleString('en-US')} ביקורות בגוגל</span>
              </span>
            </div>
          ) : null}
          {google.reviews.slice(0, 3).map((rev, i) => (
            <Review key={i} review={rev} />
          ))}
        </section>
      )}
    </>
  )
}
