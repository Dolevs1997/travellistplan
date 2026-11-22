import { directionsUrl } from './helpers'
import type { Trip } from './types'

/**
 * The trip as a calendar file (.ics): one event per stop, at the stop's planned time. Times are "floating"
 * (no time zone), so 10:00 shows as 10:00 wherever the phone is – the local time at the destination.
 */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const stamp = (iso: string, hhmm: string) => `${iso.replace(/-/g, '')}T${hhmm.replace(':', '')}00`

/** Lines longer than 75 bytes are folded, as the calendar format requires */
function fold(line: string) {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) {
      out.push(cur)
      cur = ' ' + ch
    } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}

export function tripCalendar(trip: Trip) {
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//trip-planner//HE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(trip.name)}`]
  trip.days.forEach((d, i) =>
    d.stops.forEach((s) => {
      const notes = [`יום ${i + 1} בטיול`, s.note, s.needsBooking && !s.booked ? 'צריך להזמין מראש' : undefined, `ניווט: ${directionsUrl(s)}`].filter(Boolean).join('\n')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${trip.id}-${s.id}@trip-planner`,
        `DTSTAMP:${now}`,
        `DTSTART:${stamp(d.date, s.start)}`,
        `DTEND:${stamp(d.date, s.end)}`,
        `SUMMARY:${esc(s.name)}`,
        `LOCATION:${esc(s.area || s.name)}`,
        `GEO:${s.lat};${s.lng}`,
        `DESCRIPTION:${esc(notes)}`,
        'END:VEVENT',
      )
    }),
  )
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Save the file: the phone or computer then offers to add it to the calendar */
export function downloadCalendar(trip: Trip) {
  const blob = new Blob([tripCalendar(trip)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${trip.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'trip'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
