# מתכנן טיולים – Dark Map-first

Mobile-first trip planner in Hebrew (RTL). React + TypeScript + Vite, Tailwind CSS v4, MapLibre GL, vaul, dnd-kit, Lucide.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## Structure

| Path | What |
|---|---|
| `src/index.css` | Color tokens (`@theme`), map pin styles, reduced-motion rule |
| `src/data/mockTrip.ts` | Lisbon & Porto, 8 days, 14 stops, suggestions, budget |
| `src/data/helpers.ts` | Time math, stop status, free-slot detection, Hebrew labels |
| `src/state/TripStore.tsx` | Reducer + context, persisted to `localStorage` |
| `src/components/TripMap.tsx` | MapLibre map: dark style recolored to the tokens, route + glow, pins, dotted detours |
| `src/components/Timeline.tsx` | Day timeline with drag-to-reorder (pointer + keyboard) |
| `src/screens/*` | Home, Trip (map + bottom sheet), Place details, Add stop, Budget, Profile |

Routes are hash-based: `#/`, `#/trip`, `#/trip/schedule`, `#/place/:stopId`, `#/add/:dayId`, `#/budget`, `#/profile`.

## Notes

- The base map is CARTO "Dark Matter" (no API key). Tiles are recolored at runtime so water, parks and background match the tokens.
- Routes are straight lines between stops; there is no routing service yet.
- "Now" is simulated: the traveller is at stop 2 of day 2 (`trip.progress` in the mock data).
- MapLibre 6 needs its worker bundled separately; see `src/maplibreSetup.ts`.
- Profile → "איפוס הטיול" restores the mock data.
- "+" on Home creates a new trip with no destination. Until a destination is chosen (`src/screens/ChooseDestination.tsx`, list in `src/data/destinations.ts`) the map is a zoomed-out world view with all labels hidden, so no city is shown. Choosing one creates empty days and centres the map on that city.
- Restaurants (`src/data/restaurants.ts`) are a static list per city (Lisbon, Sintra, Porto). The app shows no ratings or reviews: each item opens a Google Maps search, where reviews and photos live. "מסעדות לידי" asks for the location once and opens Google Maps' restaurant search around it. A rating-sorted nearby list inside the app would need a Google Places API key.
