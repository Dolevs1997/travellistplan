import { useState } from 'react'
import { ArrowRight, Bus, Car, ExternalLink, Plane, Search, Ship, TrainFront, type LucideIcon } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import { addDays, travelers } from '../data/brief'
import { distanceKm, shortDate } from '../data/helpers'
import { compareUrl, crossesSea, hoursLabel, recommendedMode, transferOptions, type TransferMode } from '../data/transport'
import { useEditableBrief } from '../data/tripEdit'
import { useTrip } from '../state/TripStore'
import { navigate } from '../router'

const ICON: Record<TransferMode, LucideIcon> = { רכבת: TrainFront, אוטובוס: Bus, טיסה: Plane, רכב: Car, מעבורת: Ship }
const formatDay = (iso: string) => new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(`${iso}T12:00:00`))

/** How to get from destination i to destination i+1: estimated time and price per mode, links to check and book */
export default function Transfer({ index }: { index: number }) {
  const { state, dispatch } = useTrip()
  const { brief, update, editing } = useEditableBrief(state.trip, dispatch)
  const from = brief.legs[index]?.destination
  const to = brief.legs[index + 1]?.destination
  const saved = (brief.transfers?.[index] as TransferMode | undefined) ?? undefined
  const [picked, setPicked] = useState<TransferMode | undefined>(saved)
  const [ticketOpen, setTicketOpen] = useState(!!brief.transferTickets?.[index])
  const [ticket, setTicket] = useState(brief.transferTickets?.[index] ?? '')
  // Return to wherever this was opened from (the city screen or the edit screen)
  const back = () => (history.length > 1 ? history.back() : navigate(editing ? '/edit' : '/plan'))

  if (!from || !to) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">אין מעבר כזה בטיול.</p>
        <button type="button" onClick={back} className="h-11 rounded-tile bg-accent px-5 font-semibold text-on-accent">
          חזרה
        </button>
      </div>
    )
  }

  const options = transferOptions(from, to)
  const recommended = recommendedMode(from, to)
  const chosen = picked ?? recommended
  const day = brief.start ? addDays(brief.start, brief.legs.slice(0, index + 1).reduce((n, l) => n + l.nights, 0)) : ''
  const km = Math.round((distanceKm(from, to) * 1.2) / 10) * 10

  const save = () => {
    const transfers = [...(brief.transfers ?? [])]
    transfers[index] = chosen
    const tickets = [...(brief.transferTickets ?? [])]
    tickets[index] = ticket.trim()
    update({ transfers, transferTickets: tickets, intercity: [...new Set(transfers.filter(Boolean))] })
    back()
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col pb-[130px]">
      <div className="flex flex-col gap-3 px-5 pt-4">
        <header className="flex items-center gap-3">
          <IconButton label="חזרה" onClick={back}>
            <ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[22px] font-bold">
              {from.name} ← {to.name}
            </h1>
            <span className="text-[13px] text-muted">
              {day ? `${formatDay(day)} ${shortDate(day)} · ` : ''}
              {travelers(brief)} נוסעים · כ-{km.toLocaleString('en-US')} ק״מ
            </span>
          </div>
        </header>

        <div role="radiogroup" aria-label="אמצעי מעבר" className="flex flex-col gap-2">
          {options.map((o) => {
            const Icon = ICON[o.mode]
            const on = chosen === o.mode
            const ferry = o.mode === 'מעבורת'
            const price = ferry ? '' : o.low === o.high ? `~€${o.low}` : `~€${o.low}–${o.high}`
            return (
              <div
                key={o.mode}
                className={cx(
                  'flex flex-col gap-2.5 rounded-card bg-surface',
                  on ? 'border-2 border-accent p-[11px] shadow-[0_6px_18px_rgba(11,127,109,0.12)]' : ferry ? 'border border-dashed border-border-strong p-3' : 'border border-border p-3',
                )}
              >
                <button type="button" role="radio" aria-checked={on} onClick={() => setPicked(o.mode)} className="flex items-center gap-3 text-start">
                  <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-tile', on ? 'bg-accent text-on-accent' : ferry ? 'bg-raised text-muted' : 'bg-accent/12 text-accent')}>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-base font-semibold">{o.mode === 'טיסה' ? 'טיסה פנימית' : o.mode}</span>
                      {o.mode === recommended && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">מומלץ</span>}
                    </span>
                    <span className="text-[13px] text-muted">{ferry && !crossesSea(from, to) ? o.note : `${hoursLabel(o.hours)} · ${o.note}`}</span>
                  </span>
                  {price && (
                    <span className={cx('text-end text-sm font-bold', on && 'text-accent')}>
                      <bdi dir="ltr">{price}</bdi>
                      <span className="block text-[11px] font-normal text-muted">{o.perCar ? 'לרכב' : 'לאדם'}</span>
                    </span>
                  )}
                </button>
                {on && (
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-accent text-sm font-semibold text-accent"
                  >
                    {o.mode === 'טיסה' ? 'חיפוש טיסות' : o.mode === 'מעבורת' ? 'חיפוש קווי מעבורת' : o.mode === 'רכב' ? 'מסלול נסיעה במפות' : 'שעות ומסלול במפות'}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                )}
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={compareUrl(from, to)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-1.5 rounded-[14px] bg-accent/12 text-[13px] font-semibold text-accent"
          >
            <Search size={14} aria-hidden="true" />
            השוואת כל האפשרויות
          </a>
          <button type="button" aria-expanded={ticketOpen} onClick={() => setTicketOpen(!ticketOpen)} className="h-12 rounded-[14px] border border-border-strong bg-surface text-[13px] font-medium">
            כבר יש לי כרטיס
          </button>
        </div>
        {ticketOpen && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">פרטי הכרטיס (חברה, שעה, מספר הזמנה)</span>
            <input
              type="text"
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              placeholder="למשל: רכבת 09:39, הזמנה 4821"
              className="h-12 rounded-[14px] border border-border-strong bg-surface px-3.5 text-[15px] outline-none focus:border-accent"
            />
          </label>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[560px] flex-col gap-1.5 border-t border-border bg-surface px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <span className="text-center text-xs text-muted">זמנים ומחירים משוערים – הסופיים באתר המפעיל</span>
        <button type="button" onClick={save} className="h-[52px] rounded-2xl bg-accent text-base font-semibold text-on-accent">
          שמירת {chosen === 'טיסה' ? 'טיסה' : chosen} למעבר
        </button>
      </div>
    </div>
  )
}
