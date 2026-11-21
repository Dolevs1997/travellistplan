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
- "+" on Home creates a new trip with no destination (`src/screens/NewTrip.tsx`). Until it's created the map is a zoomed-out world view with all labels hidden, so no city is shown. The page sets the destination (43 countries plus 93 popular cities, regions and islands in `src/data/destinations.ts`, filterable by region, plus a world-wide search for countries, cities, islands and regions through the free Open-Meteo geocoding API in `src/data/citySearch.ts`; only the typed text is sent, and it is free for non-commercial use), departure and return dates, and optionally lodging, restaurants and activities (museum, shopping, extreme, cruise, guided tour, nature, show, other).
- Those details stay editable on the trip details screen (`#/plan`, `src/screens/TripPlan.tsx`), opened from the clipboard button on the trip map. Changing the dates keeps the stops of days still in range and warns before dropping others. The form sections live in `src/components/PlanSections.tsx`.
- A trip can have several destinations ("יעדים במסלול" on `#/plan`): pick a day range and a new city, region or whole country, and those days move to it (`day.destination`; `dayDestination()` and `tripLegs()` in `src/data/helpers.ts`). Removing a leg gives its days back to the previous one. The trip name, Home map pins, the trip map and the day planner follow each day's own destination. A day in a whole country first asks where in it (built-in places there, or a search limited to that country through Open-Meteo's `countryCode` filter), then shows recommendations there.
- Day planner (`#/day/:dayId`, `src/screens/DayPlanner.tsx`), opened from a free day, the free-time button or "תכנון היום" in the schedule: edit the day's start/end hours, each visit's length and the travel mode/time between places (times re-flow automatically), add recommended places by category, or add a place by name.
- Place data (`src/data/places.ts`) is free and key-less: Wikidata ranks places near the day by popularity (number of Wikipedia editions) per category, with Hebrew names and Commons photos; Wikipedia (Hebrew, else English) gives the summary and facts; manual search combines Wikipedia search near the destination, Wikidata name search and Photon (OpenStreetMap) for places like restaurants. No Google ratings yet: every place links to Google Maps for reviews. Google Places could be added later behind the same functions (it needs an API key with billing, kept in a Netlify function).
- Recommendations can come from any area (`src/components/AreaControls.tsx`): near the day's route (default), a typed city/town/village/region (Open-Meteo search plus the built-in Hebrew list), a spot chosen on a map, or the device's live location (follows you, refreshing after ~300 m). Radius 1–45 km. If the Wikidata query service is down or slow (20 s timeout), recommendations fall back to Wikipedia's nearby search, with categories guessed from descriptions.
- Any stop can be removed: the trash button on schedule cards and in the day planner removes it with a few seconds to undo (`src/components/UndoRemove.tsx`, restoring the day exactly as it was); the stop details screen asks for confirmation first. Times re-flow from the day's start hour, or from where the day already started.
- Categories ("קניונים" = malls, shopping centres, department stores and arcades, plus market halls, bazaars and shopping streets) include beaches (Wikidata beach / river beach), famous streets and boulevards ("רחובות ושדרות": street, boulevard, avenue, pedestrian street, promenade, shopping street, ranked by popularity so the Champs-Élysées comes before ordinary streets) and restaurants. The Wikidata query picks the 80 best-known places first and only then fetches labels, photos and articles, so dense cities like Paris don't time out. Restaurants combine well-known ones from Wikidata with OpenStreetMap restaurants and cafés (via several public Overpass servers in parallel, 10 s cap), plus a Google Maps link for rated restaurants nearby. The place sheet adds a swipeable gallery (Commons category, else the Wikipedia article's photos), "what to do here" by kind of place, and opening hours, fee, accessibility and phone from OpenStreetMap when available.
- `src/components/PlaceSheet.tsx` shows a place: photo with credit, summary, location, facts, tips, a small map, navigation and Google reviews links.
- Restaurants (`src/data/restaurants.ts`) are a static list for Lisbon, Sintra and Porto only; in any other city the schedule shows the trip's saved restaurants and a Google Maps restaurant search for that area, never another city's list. The app shows no ratings or reviews: each item opens a Google Maps search, where reviews and photos live. "מסעדות לידי" asks for the location once and opens Google Maps' restaurant search around it. A rating-sorted nearby list inside the app would need a Google Places API key.

## AI trip assistant (`#/chat`)

- `src/screens/Chat.tsx` talks to `netlify/functions/chat.mts` (served at `/api/chat`), which calls the Claude API (`claude-opus-5-5`, adaptive thinking, low effort for quick answers, server-side refusal fallback) with web search for current restaurants, lodging prices and reviews. The reply streams back as NDJSON.
- The assistant never changes the trip itself: it calls the `propose_trip_changes` tool, the app shows the operations as a list (`src/data/aiPlan.ts`), and only "אישור ועדכון" applies them (one `applyPlan` store action; it creates a trip when none is open). The decision goes back to Claude as the tool result with the next message.
- Each message sends the current trip as text (`tripContext`) and, when the user turns it on, their location.
- Setup on Netlify (Site configuration → Environment variables): `ANTHROPIC_API_KEY` (required) and `CHAT_ACCESS_CODE` (recommended: the site is public, so without a code anyone with the link can use the key). The app asks for the code once and keeps it in the browser.
- Netlify ends a function after 60 s: the function stops a long web-search turn at ~40 s and the app continues it with a follow-up request.
- Local development: `npm run dev` serves `/api/chat` through a Vite plugin, reading `ANTHROPIC_API_KEY` (and `CHAT_ACCESS_CODE`) from the environment or a git-ignored `.env.local`. Without a key the chat says it isn't connected; there are no canned answers.
- Before planning or recommending lodging, the assistant asks what it's missing (travelers, rooms, lodging and trip budget, interests, pace, days per destination, transport between destinations) with the `ask_user_questions` tool. The app shows them as a form with tappable options plus free text; the answers go back as the tool result.
- Chat history is kept in the browser (`trip-planner:chat`, last 60 messages); "שיחה חדשה" clears it.

## New-trip wizard (`#/new`)

- Home ("בנו לי טיול", the + button and the quick destination chips) opens `src/screens/TripWizard.tsx`: five steps, **where** (a city, region or whole country; "יש לי מסלול" for several destinations with nights in each and quick picks of places in the same country), **who** (adults, children with an age band, rooms), **when** (exact dates, or only a month; with a route the return date follows from the nights), **how** (pace, kosher, must-see places, interests, transport in and between cities) and **how much**. The draft is kept in `localStorage` (`trip-planner:wizard`), so a reload doesn't lose it.
- Home shows the whole world map (draggable, zoomable) with the next trip's route points on it, and a where/who card in place of the old search box.
- The budget step shows three levels (חסכוני, נוח, פרימיום) plus a custom amount. The numbers are a **rough estimate** (`estimate()` in `src/data/brief.ts`: nightly rate per room, food, tickets and transfers per person, scaled by a price level per country), not live prices. Flights are left out unless the user types a price per person; flight prices by day need a flight-data provider and aren't shown.
- Lodging: for each destination the budget step opens Booking.com, Airbnb and Google hotels search pages with the destination, dates, guests and rooms already filled in (`lodgingLinks()`). Showing listings with prices inside the app would need partner access or a lodging-data provider.
- "בנו את הטיול" creates a new trip, stores the answers on it (`trip.brief`) and opens the assistant with a `[WIZARD BRIEF]` message; the assistant proposes the whole trip and nothing is saved to it until the user approves. "יצירת טיול ריק" creates just the route and dates without the assistant (`skeletonOps()`).
