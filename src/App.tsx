import { useEffect } from 'react'
import { useRoute } from './router'
import Home from './screens/Home'
import TripScreen from './screens/TripScreen'
import Budget from './screens/Budget'
import Profile from './screens/Profile'
import PlaceDetail from './screens/PlaceDetail'
import AddStop from './screens/AddStop'

export default function App() {
  const route = useRoute()
  const [, section, param, extra] = route.split('/')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  switch (section) {
    case 'trip':
      return <TripScreen expanded={param === 'schedule'} />
    case 'budget':
      return <Budget />
    case 'profile':
      return <Profile />
    case 'place':
      return <PlaceDetail stopId={param ?? ''} />
    case 'add':
      return <AddStop dayId={param ?? ''} highlight={extra} />
    default:
      return <Home />
  }
}
