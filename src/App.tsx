import { useEffect } from 'react'
import { useRoute } from './router'
import { useTrip } from './state/TripStore'
import Home from './screens/Home'
import TripScreen from './screens/TripScreen'
import Budget from './screens/Budget'
import Profile from './screens/Profile'
import PlaceDetail from './screens/PlaceDetail'
import AddStop from './screens/AddStop'
import ChooseDestination from './screens/ChooseDestination'

export default function App() {
  const route = useRoute()
  const { state } = useTrip()
  const [, section, param, extra] = route.split('/')
  const hasDestination = !!state.trip.destination && state.trip.days.length > 0

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  switch (section) {
    case 'trip':
      return hasDestination ? <TripScreen expanded={param === 'schedule'} /> : <ChooseDestination />
    case 'budget':
      return <Budget />
    case 'profile':
      return <Profile />
    case 'place':
      return hasDestination ? <PlaceDetail stopId={param ?? ''} /> : <ChooseDestination />
    case 'add':
      return hasDestination ? <AddStop dayId={param ?? ''} highlight={extra} /> : <ChooseDestination />
    default:
      return <Home />
  }
}
