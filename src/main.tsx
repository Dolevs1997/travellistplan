import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'
import { TripProvider } from './state/TripStore.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TripProvider>
      <App />
    </TripProvider>
  </StrictMode>,
)
