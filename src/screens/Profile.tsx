import { useState } from 'react'
import { Map as MapIcon, Moon, RotateCcw, Sun } from 'lucide-react'
import { BottomNav, ScreenHeader, cx } from '../components/ui'
import { mockTrip } from '../data/mockTrip'
import { useTrip } from '../state/TripStore'
import { setTheme, useTheme, type Theme } from '../theme'
import { navigate } from '../router'

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'בהיר', icon: Sun },
  { id: 'dark', label: 'כהה', icon: Moon },
]

export default function Profile() {
  const { dispatch } = useTrip()
  const theme = useTheme()
  const [done, setDone] = useState(false)

  return (
    <div className="mx-auto min-h-full max-w-[560px] px-5 pt-5 pb-[120px]">
      <div className="flex flex-col gap-5">
        <ScreenHeader eyebrow="הגדרות" title="פרופיל" />

        <section className="flex flex-col gap-3 rounded-phone border border-border bg-surface p-4" aria-labelledby="theme-title">
          <h2 id="theme-title" className="text-base font-semibold">
            מראה
          </h2>
          <div role="radiogroup" aria-labelledby="theme-title" className="grid grid-cols-2 gap-2">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                onClick={() => setTheme(id)}
                className={cx(
                  'flex h-12 items-center justify-center gap-2 rounded-tile border text-[15px] transition-colors duration-200 ease-out',
                  theme === id ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-raised font-medium text-muted',
                )}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <dl className="flex flex-col rounded-phone border border-border bg-surface px-4 py-1.5">
          <Row label="שפה" value="עברית" />
          <Row label="מטבע ברירת מחדל" value="אירו (EUR)" />
          <Row label="יחידות מרחק" value="קילומטרים" last />
        </dl>

        <section className="flex flex-col gap-3 rounded-phone border border-border bg-surface p-4">
          <h2 className="text-base font-semibold">טיול לדוגמה</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            טיול מוכן ({mockTrip.name}) כדי לראות איך נראים לו״ז, מפה ותקציב מלאים. הוא לא מופיע במסך הבית.
          </p>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'setActiveTrip', tripId: mockTrip.id })
              navigate('/trip')
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-tile bg-accent text-[15px] font-semibold text-on-accent"
          >
            <MapIcon size={18} aria-hidden="true" />
            פתיחת הטיול לדוגמה
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'reset' })
              setDone(true)
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong text-[15px] font-medium transition-colors duration-200 ease-out hover:bg-raised"
          >
            <RotateCcw size={18} aria-hidden="true" />
            איפוס הטיול לדוגמה
          </button>
          <p role="status" className="text-[13px] text-accent">
            {done ? 'הטיול לדוגמה אופס. הטיולים שלך לא השתנו.' : ''}
          </p>
        </section>
      </div>
      <BottomNav active="profile" />
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex min-h-[52px] items-center justify-between ${last ? '' : 'border-b border-border'}`}>
      <dt className="text-[15px]">{label}</dt>
      <dd className="text-[13px] text-muted">{value}</dd>
    </div>
  )
}
