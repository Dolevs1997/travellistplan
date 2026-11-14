import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { BottomNav, ScreenHeader } from '../components/ui'
import { useTrip } from '../state/TripStore'

export default function Profile() {
  const { dispatch } = useTrip()
  const [done, setDone] = useState(false)

  return (
    <div className="mx-auto min-h-full max-w-[560px] px-5 pt-5 pb-[120px]">
      <div className="flex flex-col gap-5">
        <ScreenHeader eyebrow="הגדרות" title="פרופיל" />
        <dl className="flex flex-col rounded-phone border border-border bg-surface px-4 py-1.5">
          <Row label="שפה" value="עברית" />
          <Row label="מטבע ברירת מחדל" value="אירו (EUR)" />
          <Row label="יחידות מרחק" value="קילומטרים" last />
        </dl>
        <section className="flex flex-col gap-3 rounded-phone border border-border bg-surface p-4">
          <h2 className="text-base font-semibold">נתוני הדמו</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            הטיול נשמר בדפדפן הזה בלבד. איפוס מחזיר את ליסבון ופורטו למצב ההתחלתי.
          </p>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'reset' })
              setDone(true)
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-tile border border-border-strong text-[15px] font-medium transition-colors duration-200 ease-out hover:bg-raised"
          >
            <RotateCcw size={18} aria-hidden="true" />
            איפוס הטיול
          </button>
          <p role="status" className="text-[13px] text-accent">
            {done ? 'הטיול אופס.' : ''}
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
