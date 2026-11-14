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

export default function App() {
  const route = useRoute()
  const { state } = useTrip()
  const [, section, param, extra] = route.split('/')
  const hasDestination = !!state.trip.destination && state.trip.days.length > 0

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  // Any trip screen for a trip without a destination goes to the new-trip setup
  const tripScreen = (screen: React.ReactNode) => (hasDestination ? screen : <NewTrip key={state.trip.id} />)

  switch (section) {
    case 'trip':
      return tripScreen(<TripScreen expanded={param === 'schedule'} />)
    case 'plan':
      return tripScreen(<TripPlan key={state.trip.id} />)
    case 'budget':
      return <Budget />
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
