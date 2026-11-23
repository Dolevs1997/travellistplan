import { useEffect } from 'react'
import { useRoute } from './router'
import { useTrip } from './state/TripStore'
import Home from './screens/Home'
import TripScreen from './screens/TripScreen'
import Budget from './screens/Budget'
import Profile from './screens/Profile'
import PlaceDetail from './screens/PlaceDetail'
import AddPlaces from './screens/AddPlaces'
import DayFood from './screens/DayFood'
import Nearby from './screens/Nearby'
import AllDays from './screens/AllDays'
import Spot from './screens/Spot'
import Restaurant from './screens/Restaurant'
import TripPlan from './screens/TripPlan'
import NoTrip from './screens/NoTrip'
import TripWizard from './screens/TripWizard'
import EditTrip from './screens/EditTrip'
import Transfer from './screens/Transfer'
import CarRental from './screens/CarRental'
import BuildOwn from './screens/BuildOwn'
import Lodging from './screens/Lodging'
import City from './screens/City'
import Overview from './screens/Overview'

export default function App() {
  const route = useRoute()
  const { state } = useTrip()
  const [, section, param, extra, extra2, extra3] = route.split('/')
  const hasDestination = !!state.trip.destination && state.trip.days.length > 0

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  // No trip open: show an empty state, never a default city.
  // An open trip without a destination goes to the new-trip setup.
  const tripScreen = (screen: React.ReactNode, tab: 'map' | 'schedule' = 'map') =>
    !state.hasActiveTrip ? <NoTrip tab={tab} /> : hasDestination ? screen : <TripWizard />

  switch (section) {
    case 'trip':
      return tripScreen(<TripScreen expanded={param === 'schedule'} />, param === 'schedule' ? 'schedule' : 'map')
    case 'day':
      return tripScreen(<DayRedirect dayId={param ?? ''} />, 'schedule')
    case 'plan':
      return tripScreen(<TripPlan key={state.trip.id} />)
    case 'edit':
      return tripScreen(<EditTrip key={state.trip.id} />)
    case 'transfer':
      return tripScreen(<Transfer key={param} index={Number(param) || 0} />)
    case 'rental':
      return tripScreen(<CarRental key={param} destId={param ?? ''} />)
    case 'overview':
      return tripScreen(<Overview key={state.trip.id} />)
    case 'city':
      return tripScreen(<City key={param} legIndex={Number(param) || 0} />)
    case 'lodging':
      return tripScreen(<Lodging key={param} legIndex={Number(param) || 0} />)
    case 'build':
      return tripScreen(<BuildOwn key={state.trip.id} />, 'schedule')
    case 'budget':
      return state.hasActiveTrip ? <Budget /> : <NoTrip tab="budget" />
    case 'new':
      return <TripWizard />
    case 'profile':
      return <Profile />
    case 'place':
      return tripScreen(<PlaceDetail stopId={param ?? ''} />)
    case 'spot':
      return tripScreen(<Spot key={param} id={param ?? ''} dayId={extra} />)
    case 'days':
      return tripScreen(<AllDays key={state.trip.id} />, 'schedule')
    case 'nearby':
      return tripScreen(<Nearby key={state.trip.id} />)
    case 'eat':
      return tripScreen(<DayFood key={`${param}-${extra ?? ''}-${extra2 ?? ''}`} dayId={param ?? ''} meal={extra} visitId={extra2} />)
    case 'restaurant':
      return tripScreen(<Restaurant key={param} id={param ?? ''} dayId={extra} meal={extra2} visitId={extra3} />)
    case 'add':
      return tripScreen(<AddPlaces key={`${param}-${extra ?? ''}`} dayId={param ?? ''} visitId={extra} />)
    default:
      return <Home />
  }
}

/** Old per-day links open that day in the trip's schedule */
function DayRedirect({ dayId }: { dayId: string }) {
  const { dispatch } = useTrip()
  useEffect(() => {
    if (dayId) dispatch({ type: 'setDay', dayId })
    window.location.replace('#/trip/schedule')
  }, [dayId, dispatch])
  return null
}
