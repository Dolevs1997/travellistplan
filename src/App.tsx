import { useEffect } from 'react'
import { useRoute } from './router'
import { useTrip } from './state/TripStore'
import Home from './screens/Home'
import TripScreen from './screens/TripScreen'
import Budget from './screens/Budget'
import Profile from './screens/Profile'
import PlaceDetail from './screens/PlaceDetail'
import AddStop from './screens/AddStop'
import NewTrip from './screens/NewTrip'
import TripPlan from './screens/TripPlan'
import NoTrip from './screens/NoTrip'
import DayPlanner from './screens/DayPlanner'
import Chat from './screens/Chat'

export default function App() {
  const route = useRoute()
  const { state } = useTrip()
  const [, section, param, extra] = route.split('/')
  const hasDestination = !!state.trip.destination && state.trip.days.length > 0

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  // No trip open: show an empty state, never a default city.
  // An open trip without a destination goes to the new-trip setup.
  const tripScreen = (screen: React.ReactNode, tab: 'map' | 'schedule' = 'map') =>
    !state.hasActiveTrip ? <NoTrip tab={tab} /> : hasDestination ? screen : <NewTrip key={state.trip.id} />

  switch (section) {
    case 'trip':
      return tripScreen(<TripScreen expanded={param === 'schedule'} />, param === 'schedule' ? 'schedule' : 'map')
    case 'day':
      return tripScreen(<DayPlanner key={param} dayId={param ?? ''} />, 'schedule')
    case 'plan':
      return tripScreen(<TripPlan key={state.trip.id} />)
    case 'budget':
      return state.hasActiveTrip ? <Budget /> : <NoTrip tab="budget" />
    case 'chat':
      return <Chat />
    case 'profile':
      return <Profile />
    case 'place':
      return tripScreen(<PlaceDetail stopId={param ?? ''} />)
    case 'add':
      return tripScreen(<AddStop dayId={param ?? ''} highlight={extra} />)
    default:
      return <Home />
  }
}
