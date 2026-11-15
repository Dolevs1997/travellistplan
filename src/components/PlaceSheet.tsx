import { useEffect, useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { ExternalLink, Lightbulb, MapPin, Navigation, Sparkles, Star } from 'lucide-react'
import PlaceMap from './PlaceMap'
import { IconTile, Tag } from './ui'
import { KIND_LABEL, googleMapsUrl, placeDetails, type PlaceDetails } from '../data/places'
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
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setDetails(null)
    placeDetails(place)
      .then((d) => alive && (setDetails(d), setStatus('done')))
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [place])

  const where = place.address ?? place.description

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4" data-vaul-no-drag>
        {place.image && !imgFailed ? (
          <figure className="m-0 flex flex-col gap-1">
            <img
              src={place.image}
              alt={place.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="aspect-[16/9] w-full rounded-card bg-raised object-cover"
            />
            {place.imagePage && (
              <figcaption className="text-[11px] text-muted">
                <a href={place.imagePage} target="_blank" rel="noopener noreferrer" className="text-muted underline">
                  תמונה: ויקישיתוף
                </a>
              </figcaption>
            )}
          </figure>
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
          {details?.website && (
            <a href={details.website} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-1 text-[13px] font-medium text-accent">
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
