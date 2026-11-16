import { useEffect, useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { Accessibility, Clock, ExternalLink, Lightbulb, ListChecks, MapPin, Navigation, Phone, Sparkles, Star, Ticket } from 'lucide-react'
import PlaceMap from './PlaceMap'
import { IconTile, Tag } from './ui'
import { KIND_LABEL, formatHours, googleMapsUrl, placeDetails, placeHours, type PlaceDetails, type PlaceHours } from '../data/places'
import { directionsUrl } from '../data/helpers'
import type { PlaceInfo } from '../data/types'

/**
 * Bottom sheet with everything about a place: photo, summary, where it is,
 * interesting facts, tips, a small map and navigation. `action` is the main
 * button (add to the day / remove), supplied by the screen that opens it.
 */
export default function PlaceSheet({
  place,
  onClose,
  action,
}: {
  place: PlaceInfo | null
  onClose: () => void
  action?: ReactNode
}) {
  return (
    <Drawer.Root open={!!place} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Drawer.Content
          aria-describedby={undefined}
          dir="rtl"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92%] max-w-[560px] flex-col rounded-t-sheet border-t border-border bg-surface font-sans text-text shadow-sheet outline-none"
        >
          <span className="mx-auto mt-3 mb-1 h-[5px] w-10 shrink-0 rounded-full bg-handle" aria-hidden="true" />
          {place && <PlaceBody place={place} action={action} />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function PlaceBody({ place, action }: { place: PlaceInfo; action?: ReactNode }) {
  const [details, setDetails] = useState<PlaceDetails | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [hours, setHours] = useState<{ status: 'loading' | 'done' | 'error'; data?: PlaceHours }>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setDetails(null)
    placeDetails(place)
      .then((d) => alive && (setDetails(d), setStatus('done')))
      .catch(() => alive && setStatus('error'))
    // Opening hours come from a slower service: load them separately so the rest shows right away
    setHours({ status: 'loading' })
    placeHours(place)
      .then((data) => alive && setHours({ status: 'done', data }))
      .catch(() => alive && setHours({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [place])

  const photos = details?.gallery.length ? details.gallery : place.image ? [{ url: place.image, page: place.imagePage ?? '' }] : []
  const website = hours.data?.website ?? details?.website ?? place.website
  const phone = hours.data?.phone ?? place.phone
  const hideEmptyHours = place.kind === 'beach' || place.kind === 'view' || place.kind === 'nature'

  const where = place.address ?? place.description

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4" data-vaul-no-drag>
        {photos.length ? (
          <Gallery name={place.name} photos={photos} />
        ) : (
          <div className="flex aspect-[16/7] items-center justify-center rounded-card bg-raised">
            <IconTile kind={place.kind} size={64} />
          </div>
        )}

        <header className="flex flex-col gap-1.5">
          <Drawer.Title className="text-2xl leading-tight font-bold" dir="auto">
            {place.name}
          </Drawer.Title>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="accent">{KIND_LABEL[place.kind]}</Tag>
            {!!place.popularity && place.popularity >= 20 && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Star size={13} aria-hidden="true" />
                מוכר בעולם
              </span>
            )}
          </div>
        </header>

        {where && (
          <p className="flex items-start gap-2 text-[14px] text-muted">
            <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span dir="auto">{where}</span>
          </p>
        )}

        <section aria-labelledby="about" className="flex flex-col gap-1.5">
          <h3 id="about" className="text-base font-semibold">
            על המקום
          </h3>
          {status === 'loading' && <p className="text-[14px] text-muted">טוענים מידע…</p>}
          {status === 'error' && <p className="text-[14px] text-muted">לא הצלחנו לטעון מידע כרגע.</p>}
          {status === 'done' &&
            (details?.summary ? (
              <p className="text-[15px] leading-relaxed" dir={details.summaryLang === 'en' ? 'ltr' : 'rtl'} lang={details.summaryLang}>
                {details.summary}
              </p>
            ) : (
              <p className="text-[14px] text-muted">אין עדיין תקציר למקום הזה.</p>
            ))}
          {details?.summaryLang === 'en' && <p className="text-xs text-muted">התקציר מוויקיפדיה האנגלית, כי אין ערך בעברית.</p>}
          {place.article && (
            <a
              href={`https://${place.article.lang}.wikipedia.org/wiki/${encodeURIComponent(place.article.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-[13px] font-medium text-accent"
            >
              המשך קריאה בוויקיפדיה
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
        </section>

        {/* Outdoor spots rarely have opening hours: skip the box for them unless hours were found */}
        {!(hideEmptyHours && hours.status !== 'loading' && !hours.data?.hours) && (
        <section aria-labelledby="hours-title" className="flex flex-col gap-2 rounded-card border border-border bg-raised p-3">
          <h3 id="hours-title" className="flex items-center gap-1.5 text-base font-semibold">
            <Clock size={16} className="text-accent" aria-hidden="true" />
            שעות פתיחה
          </h3>
          {hours.status === 'loading' && <p className="text-[14px] text-muted">בודקים שעות פתיחה…</p>}
          {hours.status !== 'loading' &&
            (hours.data?.hours ? (
              <ul className="flex flex-col gap-0.5">
                {formatHours(hours.data.hours).map((line, i) => (
                  <li key={i} className="text-[14px]">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">
                {hours.status === 'error' ? 'לא הצלחנו לבדוק כרגע.' : 'אין לנו שעות פתיחה למקום הזה.'} שעות עדכניות –{' '}
                <a href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
                  בגוגל מפות
                </a>
              </p>
            ))}
          {(hours.data?.fee !== undefined || hours.data?.wheelchair !== undefined || phone) && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
              {hours.data?.fee !== undefined && (
                <li className="flex items-center gap-1">
                  <Ticket size={14} aria-hidden="true" />
                  {hours.data.fee ? 'כניסה בתשלום' : 'כניסה חופשית'}
                </li>
              )}
              {hours.data?.wheelchair !== undefined && (
                <li className="flex items-center gap-1">
                  <Accessibility size={14} aria-hidden="true" />
                  {hours.data.wheelchair ? 'נגיש לכיסא גלגלים' : 'לא נגיש לכיסא גלגלים'}
                </li>
              )}
              {phone && (
                <li>
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-1 text-accent" dir="ltr">
                    <Phone size={14} aria-hidden="true" />
                    {phone}
                  </a>
                </li>
              )}
            </ul>
          )}
        </section>
        )}

        {!!details?.activities.length && (
          <section aria-labelledby="todo" className="flex flex-col gap-2">
            <h3 id="todo" className="flex items-center gap-1.5 text-base font-semibold">
              <ListChecks size={16} className="text-accent" aria-hidden="true" />
              מה עושים כאן
            </h3>
            <ul className="flex flex-col gap-1.5 ps-4">
              {details.activities.map((a, i) => (
                <li key={i} className="list-disc text-[14px] leading-relaxed">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!!details?.facts.length && (
          <section aria-labelledby="facts" className="flex flex-col gap-2">
            <h3 id="facts" className="flex items-center gap-1.5 text-base font-semibold">
              <Sparkles size={16} className="text-accent" aria-hidden="true" />
              עובדות מעניינות
            </h3>
            <ul className="flex flex-col gap-1.5 ps-4">
              {details.facts.map((f, i) => (
                <li key={i} className="list-disc text-[14px] leading-relaxed" dir="auto">
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="tips" className="flex flex-col gap-2">
          <h3 id="tips" className="flex items-center gap-1.5 text-base font-semibold">
            <Lightbulb size={16} className="text-accent-2" aria-hidden="true" />
            טיפים
          </h3>
          <ul className="flex flex-col gap-1.5 ps-4">
            {details?.tips.map((t, i) => (
              <li key={i} className="list-disc text-[14px] leading-relaxed">
                {t}
              </li>
            ))}
            <li className="list-disc text-[14px] leading-relaxed">
              טיפים וביקורות של מבקרים –{' '}
              <a href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
                בגוגל מפות
              </a>
            </li>
          </ul>
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-1 text-[13px] font-medium text-accent">
              לאתר הרשמי
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
        </section>

        <div className="h-40 overflow-hidden rounded-card border border-border">
          <PlaceMap lat={place.lat} lng={place.lng} zoom={15} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {action}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={directionsUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong text-[15px] font-medium"
          >
            <Navigation size={18} aria-hidden="true" />
            ניווט
          </a>
          <a
            href={googleMapsUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong text-[15px] font-medium"
          >
            <Star size={18} aria-hidden="true" />
            ביקורות בגוגל
          </a>
        </div>
      </div>
    </div>
  )
}

/** Swipeable photo strip with a counter and a credit link for the photo in view */
function Gallery({ name, photos }: { name: string; photos: { url: string; page: string }[] }) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const shown = photos.filter((p) => !failed.has(p.url))
  if (!shown.length) return null
  const current = shown[Math.min(index, shown.length - 1)]

  return (
    <figure className="m-0 flex flex-col gap-1">
      <div className="relative">
        <div
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-card"
          aria-label={`תמונות של ${name}`}
          role="group"
          onScroll={(e) => {
            const el = e.currentTarget
            setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth))
          }}
        >
          {shown.map((p, i) => (
            <img
              key={p.url}
              src={p.url}
              alt={i === 0 ? name : `${name} – תמונה ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              onError={() => setFailed((f) => new Set(f).add(p.url))}
              className="aspect-[16/9] w-full shrink-0 snap-center bg-raised object-cover"
            />
          ))}
        </div>
        {shown.length > 1 && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white" aria-hidden="true">
            {Math.min(index, shown.length - 1) + 1}/{shown.length}
          </span>
        )}
      </div>
      <figcaption className="flex justify-between text-[11px] text-muted">
        {shown.length > 1 ? <span>החליקו לעוד תמונות</span> : <span />}
        {current.page && (
          <a href={current.page} target="_blank" rel="noopener noreferrer" className="text-muted underline">
            תמונה: ויקישיתוף
          </a>
        )}
      </figcaption>
    </figure>
  )
}
