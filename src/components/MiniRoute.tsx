import type { Trip } from '../data/types'

/** Static, lightweight route preview for the home card (no map tiles). */
export default function MiniRoute({ trip }: { trip: Trip }) {
  const W = 350
  const H = 168
  const pad = 28
  const pts = trip.days.flatMap((d) => d.stops)
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  // Stretch horizontally a bit so a mostly north–south trip still reads as a route
  const x = (lng: number) => pad + 60 + ((lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * pad - 120)
  const y = (lat: number) => H - pad - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * pad)

  const d = pts
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.lng).toFixed(1)} ${y(p.lat).toFixed(1)}`)
    .join(' ')

  const cities = trip.days.reduce<{ name: string; lat: number; lng: number }[]>((acc, day) => {
    if (day.stops.length && !acc.some((c) => c.name === day.city)) acc.push({ name: day.city, lat: day.stops[0].lat, lng: day.stops[0].lng })
    return acc
  }, [])
  const first = pts[0]
  const last = pts[pts.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-[168px] w-full" role="img" aria-label={`תצוגה מקדימה של מסלול ${trip.name}`}>
      <rect width={W} height={H} fill="#11151C" />
      <path d={`M0 0 H70 C60 40 52 80 40 120 C30 145 18 160 0 ${H} Z`} fill="#0E2633" />
      <path d="M210 120 C240 100 275 112 290 140 C300 160 270 168 230 168 C205 160 195 135 210 120 Z" fill="#13261F" />
      <g stroke="#1B212B" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d="M80 0 L130 168" />
        <path d="M70 90 L350 70" />
        <path d="M180 0 L240 168" />
        <path d="M60 140 L350 150" />
      </g>
      <path d={d} fill="none" stroke="#2EE6C5" strokeOpacity="0.22" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#2EE6C5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(first.lng)} cy={y(first.lat)} r="14" fill="#2EE6C5" fillOpacity="0.2" />
      <circle cx={x(first.lng)} cy={y(first.lat)} r="7" fill="#2EE6C5" />
      <circle cx={x(last.lng)} cy={y(last.lat)} r="7" fill="#151A22" stroke="#2EE6C5" strokeWidth="3" />
      {cities.map((c) => (
        <text key={c.name} x={x(c.lng) - 14} y={y(c.lat) + 4} textAnchor="end" fill="#A3ADBD" fontFamily="Rubik, sans-serif" fontSize="11">
          {c.name}
        </text>
      ))}
    </svg>
  )
}
