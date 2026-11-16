# מתכנן טיולים

Mobile-first trip planner in Hebrew (RTL). React + TypeScript + Vite, Tailwind CSS v4, MapLibre GL, vaul, dnd-kit, Lucide.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## Structure

| Path | What |
|---|---|
| `src/index.css` | Color tokens (`@theme`, light by default, dark under `[data-theme="dark"]`), map colors, pin styles, reduced-motion rule |
| `src/theme.ts` | Light/dark choice (saved in `localStorage`), map style URL and colors per theme |
| `src/data/mockTrip.ts` | Sample trip (Lisbon & Porto, 8 days, 14 stops), opened from Profile only |
| `src/data/helpers.ts` | Time math, stop status, free-slot detection, Hebrew labels |
| `src/state/TripStore.tsx` | Reducer + context, persisted to `localStorage` |
| `src/components/TripMap.tsx` | MapLibre map recolored to the theme tokens: route + glow, pins, dotted detours |
| `src/components/Timeline.tsx` | Day timeline with drag-to-reorder (pointer + keyboard) |
| `src/screens/*` | Home, Trip (map + bottom sheet), Place details, Add stop, Budget, Profile |

Routes are hash-based: `#/`, `#/trip`, `#/trip/schedule`, `#/place/:stopId`, `#/add/:dayId`, `#/budget`, `#/profile`.

## Notes

- The app is light by default; Profile → מראה switches to dark. The base map is CARTO "Positron" in light mode and "Dark Matter" in dark mode (no API key), recolored at runtime from the tokens (`applyMapTheme` in `src/maplibreSetup.ts`). An inline script in `index.html` applies the saved theme before first paint.
- No trip is open by default and Home never shows a default city: with no destination chosen, Home shows an empty state and the map/schedule/budget tabs show `src/screens/NoTrip.tsx`. The sample trip is only reachable from Profile.
- Routes are straight lines between stops; there is no routing service yet.
- "Now" is simulated: the traveller is at stop 2 of day 2 (`trip.progress` in the mock data).
- MapLibre 6 needs its worker bundled separately; see `src/maplibreSetup.ts`.
- Profile → "איפוס הטיול לדוגמה" restores the sample trip; the user's own trips are kept.
- "+" on Home creates a new trip with no destination (`src/screens/NewTrip.tsx`). Until it's created the map is a zoomed-out world view with all labels hidden, so no city is shown. The page sets the destination (93 popular cities, regions and islands in `src/data/destinations.ts`, filterable by region, plus a world-wide search for cities, islands and regions through the free Open-Meteo geocoding API in `src/data/citySearch.ts`; only the typed text is sent, and it is free for non-commercial use), departure and return dates, and optionally lodging, restaurants and activities (museum, shopping, extreme, cruise, guided tour, nature, show, other).
- Those details stay editable on the trip details screen (`#/plan`, `src/screens/TripPlan.tsx`), opened from the clipboard button on the trip map. Changing the dates keeps the stops of days still in range and warns before dropping others. The form sections live in `src/components/PlanSections.tsx`.
- Day planner (`#/day/:dayId`, `src/screens/DayPlanner.tsx`), opened from a free day, the free-time button or "תכנון היום" in the schedule: edit the day's start/end hours, each visit's length and the travel mode/time between places (times re-flow automatically), add recommended places by category, or add a place by name.
- Place data (`src/data/places.ts`) is free and key-less: Wikidata ranks places near the day by popularity (number of Wikipedia editions) per category, with Hebrew names and Commons photos; Wikipedia (Hebrew, else English) gives the summary and facts; manual search combines Wikipedia search near the destination, Wikidata name search and Photon (OpenStreetMap) for places like restaurants. No Google ratings yet: every place links to Google Maps for reviews. Google Places could be added later behind the same functions (it needs an API key with billing, kept in a Netlify function).
- `src/components/PlaceSheet.tsx` shows a place: photo with credit, summary, location, facts, tips, a small map, navigation and Google reviews links.
- Restaurants (`src/data/restaurants.ts`) are a static list for Lisbon, Sintra and Porto only; in any other city the schedule shows the trip's saved restaurants and a Google Maps restaurant search for that area, never another city's list. The app shows no ratings or reviews: each item opens a Google Maps search, where reviews and photos live. "מסעדות לידי" asks for the location once and opens Google Maps' restaurant search around it. A rating-sorted nearby list inside the app would need a Google Places API key.
