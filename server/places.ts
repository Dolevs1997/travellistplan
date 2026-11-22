/**
 * Google Places lookup for one place, run on the server so the API key never reaches the browser.
 * Used by the Vite dev server (vite.config.ts) and the Netlify function (netlify/functions/place.mts).
 *
 * One Text Search (name + location bias) and, when the place has photos, one photo lookup.
 * Google requires showing the photo's author, so it is returned with the photo.
 */

export interface PlaceResult {
  found: boolean;
  name?: string;
  rating?: number;
  ratingCount?: number;
  address?: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  photo?: string;
  photoAuthor?: string;
  photoAuthorUrl?: string;
}

const FIELDS = [
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.photos",
  "places.location",
].join(",");

interface GooglePlace {
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: {
    name: string;
    authorAttributions?: { displayName?: string; uri?: string }[];
  }[];
  location?: { latitude: number; longitude: number };
}

const cache = new Map<string, Promise<PlaceResult>>();

export function lookupPlace(
  key: string,
  name: string,
  lat: number,
  lng: number,
): Promise<PlaceResult> {
  const id = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
  let hit = cache.get(id);
  if (!hit) {
    hit = fetchPlace(key, name, lat, lng);
    hit.catch(() => cache.delete(id)); // don't keep failures
    cache.set(id, hit);
  }
  return hit;
}

async function fetchPlace(
  key: string,
  name: string,
  lat: number,
  lng: number,
): Promise<PlaceResult> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELDS,
      },
      body: JSON.stringify({
        textQuery: name,
        pageSize: 1,
        languageCode: "he",
        // Only results inside a ~400 m box around the place (a same-named hotel elsewhere isn't this one)
        locationRestriction: {
          rectangle: {
            low: {
              latitude: lat - 0.0036,
              longitude: lng - 0.0036 / Math.cos((lat * Math.PI) / 180),
            },
            high: {
              latitude: lat + 0.0036,
              longitude: lng + 0.0036 / Math.cos((lat * Math.PI) / 180),
            },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    // Google's own message (never the key) helps tell a disabled API from a bad request
    const err = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string };
    };
    throw new Error(
      `places search ${res.status} ${err.error?.status ?? ""}: ${err.error?.message ?? ""}`,
    );
  }
  const place = ((await res.json()) as { places?: GooglePlace[] }).places?.[0];
  if (!place) return { found: false };
  // The bias only prefers nearby results; a same-named place elsewhere isn't this one
  if (
    place.location &&
    metersBetween(lat, lng, place.location.latitude, place.location.longitude) >
      400
  )
    return { found: false };

  const out: PlaceResult = {
    found: true,
    name: place.displayName?.text,
    rating: place.rating,
    ratingCount: place.userRatingCount,
    address: place.formattedAddress,
    phone: place.internationalPhoneNumber,
    website: place.websiteUri,
    mapsUrl: place.googleMapsUri,
  };
  const photo = place.photos?.[0];
  if (photo) {
    // skipHttpRedirect returns a public image URL (no key in it) that the browser can load
    const media = await fetch(
      `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=960&skipHttpRedirect=true`,
      {
        headers: { "X-Goog-Api-Key": key },
      },
    );
    if (media.ok) {
      out.photo = ((await media.json()) as { photoUri?: string }).photoUri;
      out.photoAuthor = photo.authorAttributions?.[0]?.displayName;
      out.photoAuthorUrl = photo.authorAttributions?.[0]?.uri;
    }
  }
  return out;
}

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

/** Validate the query string; null when it isn't a sensible request */
export function parseQuery(params: URLSearchParams) {
  const name = (params.get("name") ?? "").trim();
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (
    !name ||
    name.length > 120 ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return { name, lat, lng };
}

/* ---------- Places to stay near a point (Nearby Search) ---------- */

export interface NearbyLodging {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Google's main type: hotel, hostel, guest_house, bed_and_breakfast… */
  type?: string;
  rating?: number;
  ratingCount?: number;
  address?: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  /** Photo resource name, loaded through /api/photo (so the key stays here) */
  photo?: string;
  photoAuthor?: string;
  photoAuthorUrl?: string;
}

const NEARBY_FIELDS = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.primaryType",
  "places.rating",
  "places.userRatingCount",
  "places.shortFormattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.photos",
  "places.businessStatus",
].join(",");

interface GoogleNearby extends GooglePlace {
  id: string;
  primaryType?: string;
  shortFormattedAddress?: string;
  businessStatus?: string;
}

/** Main types that are places to stay (a park or a restaurant that also has rooms isn't one) */
const STAY_TYPES = new Set([
  "lodging",
  "hotel",
  "motel",
  "hostel",
  "guest_house",
  "bed_and_breakfast",
  "inn",
  "resort_hotel",
  "extended_stay_hotel",
  "private_guest_room",
  "cottage",
  "farmstay",
  "budget_japanese_inn",
  "japanese_inn",
]);

const nearbyCache = new Map<string, Promise<NearbyLodging[]>>();

/** Up to 20 places to stay in a circle, most popular first (Google's limit for one request) */
export function lodgingNearby(
  key: string,
  lat: number,
  lng: number,
  radiusM: number,
): Promise<NearbyLodging[]> {
  const id = `${lat.toFixed(3)}|${lng.toFixed(3)}|${Math.round(radiusM / 100)}`;
  let hit = nearbyCache.get(id);
  if (!hit) {
    hit = fetchNearby(key, lat, lng, radiusM);
    hit.catch(() => nearbyCache.delete(id));
    nearbyCache.set(id, hit);
  }
  return hit;
}

async function fetchNearby(
  key: string,
  lat: number,
  lng: number,
  radiusM: number,
): Promise<NearbyLodging[]> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": NEARBY_FIELDS,
      },
      body: JSON.stringify({
        includedTypes: ["lodging"],
        excludedTypes: ["campground", "rv_park", "mobile_home_park"],
        maxResultCount: 20,
        rankPreference: "POPULARITY",
        languageCode: "he",
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusM,
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string };
    };
    throw new Error(
      `places nearby ${res.status} ${err.error?.status ?? ""}: ${err.error?.message ?? ""}`,
    );
  }
  const places =
    ((await res.json()) as { places?: GoogleNearby[] }).places ?? [];
  return places.flatMap((p) => {
    const name = p.displayName?.text?.trim();
    if (
      !name ||
      !p.location ||
      (p.businessStatus && p.businessStatus !== "OPERATIONAL")
    )
      return [];
    if (p.primaryType && !STAY_TYPES.has(p.primaryType)) return [];
    const photo = p.photos?.[0];
    return [
      {
        id: p.id,
        name,
        lat: p.location.latitude,
        lng: p.location.longitude,
        type: p.primaryType,
        rating: p.rating,
        ratingCount: p.userRatingCount,
        address: p.shortFormattedAddress ?? p.formattedAddress,
        phone: p.internationalPhoneNumber,
        website: p.websiteUri,
        mapsUrl: p.googleMapsUri,
        photo: photo?.name,
        photoAuthor: photo?.authorAttributions?.[0]?.displayName,
        photoAuthorUrl: photo?.authorAttributions?.[0]?.uri,
      },
    ];
  });
}

export function parseNearby(params: URLSearchParams) {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radius = Number(params.get("radius"));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  if (!Number.isFinite(radius) || radius < 100 || radius > 5000) return null;
  return { lat, lng, radius };
}

/* ---------- One photo, by its resource name ---------- */

const PHOTO_NAME =
  /^places\/[A-Za-z0-9_-]{1,200}\/photos\/[A-Za-z0-9_-]{1,1000}$/;
const photoCache = new Map<string, Promise<string | null>>();

export function parsePhoto(params: URLSearchParams) {
  const name = params.get("name") ?? "";
  const width = Math.min(1200, Math.max(120, Number(params.get("w")) || 480));
  return PHOTO_NAME.test(name) ? { name, width } : null;
}

/** A public image URL for the photo (no key in it), for the browser to be redirected to */
export function photoUrl(
  key: string,
  name: string,
  width: number,
): Promise<string | null> {
  const id = `${name}|${width}`;
  let hit = photoCache.get(id);
  if (!hit) {
    hit = fetch(
      `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
      { headers: { "X-Goog-Api-Key": key } },
    ).then(async (r) =>
      r.ok
        ? (((await r.json()) as { photoUri?: string }).photoUri ?? null)
        : null,
    );
    hit.catch(() => photoCache.delete(id));
    photoCache.set(id, hit);
  }
  return hit;
}

/* ---------- Searching for a street, area, station or landmark ---------- */

export interface Suggestion {
  id: string
  /** e.g. "Avenida da Liberdade" */
  main: string
  /** e.g. "Lisbon, Portugal" */
  secondary?: string
  types: string[]
  distanceMeters?: number
}

/** Places matching what was typed, near the city. A session token ties typing and the pick together (cheaper) */
export async function suggestPlaces(key: string, input: string, lat: number, lng: number, session: string): Promise<Suggestion[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({
      input,
      sessionToken: session,
      languageCode: 'he',
      origin: { latitude: lat, longitude: lng },
      // Only places around the city (a same-named street in another country is no use here)
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 25000 } },
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } }
    throw new Error(`places autocomplete ${res.status} ${err.error?.status ?? ''}: ${err.error?.message ?? ''}`)
  }
  type Prediction = {
    placeId: string
    text?: { text?: string }
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
    types?: string[]
    distanceMeters?: number
  }
  const json = (await res.json()) as { suggestions?: { placePrediction?: Prediction }[] }
  return (json.suggestions ?? []).flatMap(({ placePrediction: p }) =>
    p
      ? [
          {
            id: p.placeId,
            main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
            secondary: p.structuredFormat?.secondaryText?.text,
            types: p.types ?? [],
            distanceMeters: p.distanceMeters,
          },
        ]
      : [],
  )
}

export interface PlaceSpot {
  id: string
  /** The local name (used to find a street's line on OpenStreetMap) */
  name: string
  lat: number
  lng: number
  types: string[]
  /** The area the place covers: tight around a street, a neighbourhood's extent */
  viewport?: { low: { lat: number; lng: number }; high: { lat: number; lng: number } }
}

const spotCache = new Map<string, Promise<PlaceSpot>>()

/** Where a picked suggestion is. Asked without a language, so the name is the local one OpenStreetMap uses */
export function placeSpot(key: string, id: string, session: string): Promise<PlaceSpot> {
  let hit = spotCache.get(id)
  if (!hit) {
    hit = (async () => {
      const qs = session ? `?sessionToken=${encodeURIComponent(session)}` : ''
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${qs}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,location,viewport,types' },
      })
      if (!res.ok) throw new Error(`place details ${res.status}`)
      const p = (await res.json()) as {
        id: string
        displayName?: { text?: string }
        location?: { latitude: number; longitude: number }
        viewport?: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } }
        types?: string[]
      }
      if (!p.location) throw new Error('place has no location')
      return {
        id: p.id,
        name: p.displayName?.text ?? '',
        lat: p.location.latitude,
        lng: p.location.longitude,
        types: p.types ?? [],
        viewport: p.viewport
          ? { low: { lat: p.viewport.low.latitude, lng: p.viewport.low.longitude }, high: { lat: p.viewport.high.latitude, lng: p.viewport.high.longitude } }
          : undefined,
      }
    })()
    hit.catch(() => spotCache.delete(id))
    spotCache.set(id, hit)
  }
  return hit
}

const SESSION = /^[A-Za-z0-9-]{8,64}$/

export function parseSuggest(params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim()
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  const session = params.get('session') ?? ''
  if (q.length < 2 || q.length > 80 || !Number.isFinite(lat) || !Number.isFinite(lng) || !SESSION.test(session)) return null
  return { q, lat, lng, session }
}

export function parseSpot(params: URLSearchParams) {
  const id = params.get('id') ?? ''
  const session = params.get('session') ?? ''
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(id) || (session && !SESSION.test(session))) return null
  return { id, session }
}

/* ---------- Places to visit: recommendations by category, and search ---------- */

export interface ExplorePlace {
  id: string
  name: string
  lat: number
  lng: number
  types: string[]
  /** Google's own label for the main type, in Hebrew ("מוזיאון לאמנות") */
  typeLabel?: string
  rating?: number
  ratingCount?: number
  address?: string
  summary?: string
  /** Opening hours per weekday, Monday first ("יום שני: 10:00–18:00") */
  hours?: string[]
  website?: string
  mapsUrl?: string
  photo?: string
  photoAuthor?: string
  photoAuthorUrl?: string
}

/** Each category is a Nearby Search by place types, or a Text Search where Google has no fitting type */
const EXPLORE: Record<string, { types?: string[]; text?: string }> = {
  top: { types: ['tourist_attraction', 'museum', 'historical_landmark', 'park', 'art_gallery'] },
  sights: { types: ['tourist_attraction', 'historical_landmark', 'church', 'amusement_park', 'zoo', 'aquarium'] },
  museums: { types: ['museum', 'art_gallery'] },
  views: { text: 'viewpoint' },
  food: { types: ['restaurant', 'cafe', 'bakery'] },
  cafes: { types: ['cafe', 'coffee_shop', 'bakery'] },
  kosher: { text: 'kosher restaurant' },
  // 'market' alone finds supermarkets; this finds market halls and flea markets
  markets: { text: 'flea market' },
  nature: { types: ['park', 'national_park', 'hiking_area'] },
}
export const EXPLORE_CATEGORIES = Object.keys(EXPLORE)

const EXPLORE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.primaryTypeDisplayName',
  'places.rating',
  'places.userRatingCount',
  'places.shortFormattedAddress',
  'places.editorialSummary',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.photos',
  'places.businessStatus',
].join(',')

interface GoogleExplore {
  id: string
  displayName?: { text?: string }
  location?: { latitude: number; longitude: number }
  types?: string[]
  primaryTypeDisplayName?: { text?: string }
  rating?: number
  userRatingCount?: number
  shortFormattedAddress?: string
  editorialSummary?: { text?: string }
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  websiteUri?: string
  googleMapsUri?: string
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[]
  businessStatus?: string
}

const exploreCache = new Map<string, Promise<ExplorePlace[]>>()

/** Places in a circle for one category (most popular first), or matching a typed query near the point */
export function explorePlaces(key: string, q: { cat?: string; text?: string; lat: number; lng: number; radius: number }): Promise<ExplorePlace[]> {
  const id = `${q.cat ?? ''}|${q.text ?? ''}|${q.lat.toFixed(3)}|${q.lng.toFixed(3)}|${Math.round(q.radius / 100)}`
  let hit = exploreCache.get(id)
  if (!hit) {
    hit = fetchExplore(key, q)
    hit.catch(() => exploreCache.delete(id))
    exploreCache.set(id, hit)
  }
  return hit
}

async function fetchExplore(key: string, q: { cat?: string; text?: string; lat: number; lng: number; radius: number }): Promise<ExplorePlace[]> {
  const conf = q.text ? { text: q.text } : EXPLORE[q.cat ?? 'top']
  const circle = { center: { latitude: q.lat, longitude: q.lng }, radius: q.radius }
  const dLat = q.radius / 111320
  const dLng = q.radius / (111320 * Math.cos((q.lat * Math.PI) / 180))
  const body = conf.types
    ? {
        includedTypes: conf.types,
        // A petrol station or supermarket with a café counter isn't a café
        excludedTypes: ['gas_station', 'supermarket', 'grocery_store', 'convenience_store', 'lodging'],
        maxResultCount: 20,
        rankPreference: 'POPULARITY',
        languageCode: 'he',
        locationRestriction: { circle },
      }
    : {
        textQuery: conf.text,
        pageSize: 20,
        languageCode: 'he',
        // Text Search takes a box, not a circle
        locationRestriction: { rectangle: { low: { latitude: q.lat - dLat, longitude: q.lng - dLng }, high: { latitude: q.lat + dLat, longitude: q.lng + dLng } } },
      }
  const res = await fetch(`https://places.googleapis.com/v1/places:${conf.types ? 'searchNearby' : 'searchText'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': EXPLORE_FIELDS },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } }
    throw new Error(`places explore ${res.status} ${err.error?.status ?? ''}: ${err.error?.message ?? ''}`)
  }
  const places = ((await res.json()) as { places?: GoogleExplore[] }).places ?? []
  return places.flatMap((p) => {
    const name = p.displayName?.text?.trim()
    if (!name || !p.location || (p.businessStatus && p.businessStatus !== 'OPERATIONAL')) return []
    // Hotels show up under "tourist attraction" too; they belong on the lodging screen
    if (p.types?.includes('lodging')) return []
    const photo = p.photos?.[0]
    return [
      {
        id: p.id,
        name,
        lat: p.location.latitude,
        lng: p.location.longitude,
        types: p.types ?? [],
        typeLabel: p.primaryTypeDisplayName?.text,
        rating: p.rating,
        ratingCount: p.userRatingCount,
        address: p.shortFormattedAddress,
        summary: p.editorialSummary?.text,
        hours: p.regularOpeningHours?.weekdayDescriptions,
        website: p.websiteUri,
        mapsUrl: p.googleMapsUri,
        photo: photo?.name,
        photoAuthor: photo?.authorAttributions?.[0]?.displayName,
        photoAuthorUrl: photo?.authorAttributions?.[0]?.uri,
      },
    ]
  })
}

export function parseExplore(params: URLSearchParams) {
  const cat = params.get('cat') ?? undefined
  const text = (params.get('q') ?? '').trim() || undefined
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  const radius = Number(params.get('radius'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (!Number.isFinite(radius) || radius < 200 || radius > 30000) return null
  if (text ? text.length < 2 || text.length > 80 : !cat || !EXPLORE[cat]) return null
  return { cat: text ? undefined : cat, text, lat, lng, radius }
}

/* ---------- Restaurants: by meal near a point, and one restaurant's full details ---------- */

/** Opening periods as Google gives them: day 0 = Sunday, times in the place's local time */
export type Periods = { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[]

export interface EatPlace {
  id: string
  name: string
  lat: number
  lng: number
  typeLabel?: string
  rating?: number
  ratingCount?: number
  /** 1–4 (€ to €€€€) */
  price?: number
  /** Per person, e.g. "25–35 €" */
  priceRange?: string
  vegetarian?: boolean
  periods?: Periods
  hours?: string[]
  /** Up to three photo names for the card's strip */
  photos: string[]
}

/** Full details of any place (the restaurant page and the place page both use it) */
export interface RestaurantDetails extends EatPlace {
  types: string[]
  address?: string
  summary?: string
  phone?: string
  website?: string
  mapsUrl?: string
  /** Yes/no facts Google knows: reservable, outdoorSeating, goodForChildren, servesBeer… */
  facts: Record<string, boolean>
  /** Up to ten photos with their authors (Google requires showing who took them) */
  gallery: { name: string; author?: string; authorUrl?: string }[]
  reviews: { author: string; authorUrl?: string; photo?: string; rating?: number; when?: string; text: string; translatedFrom?: string }[]
}

const PRICE: Record<string, number> = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 }

type Money = { currencyCode?: string; units?: string }
interface GoogleEat {
  id: string
  displayName?: { text?: string }
  location?: { latitude: number; longitude: number }
  types?: string[]
  primaryTypeDisplayName?: { text?: string }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  priceRange?: { startPrice?: Money; endPrice?: Money }
  servesVegetarianFood?: boolean
  regularOpeningHours?: { periods?: Periods; weekdayDescriptions?: string[] }
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[]
  businessStatus?: string
}

const SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', ILS: '₪' }
function priceRange(r?: { startPrice?: Money; endPrice?: Money }) {
  if (!r?.startPrice?.units) return undefined
  const sym = SYMBOL[r.startPrice.currencyCode ?? ''] ?? r.startPrice.currencyCode ?? ''
  return r.endPrice?.units ? `${r.startPrice.units}–${r.endPrice.units} ${sym}` : `${r.startPrice.units}+ ${sym}`
}

function toEat(p: GoogleEat): EatPlace | null {
  const name = p.displayName?.text?.trim()
  if (!name || !p.location || (p.businessStatus && p.businessStatus !== 'OPERATIONAL')) return null
  return {
    id: p.id,
    name,
    lat: p.location.latitude,
    lng: p.location.longitude,
    typeLabel: p.primaryTypeDisplayName?.text,
    rating: p.rating,
    ratingCount: p.userRatingCount,
    price: PRICE[p.priceLevel ?? ''],
    priceRange: priceRange(p.priceRange),
    vegetarian: p.servesVegetarianFood,
    periods: p.regularOpeningHours?.periods,
    hours: p.regularOpeningHours?.weekdayDescriptions,
    photos: (p.photos ?? []).slice(0, 3).map((ph) => ph.name),
  }
}

const EAT_FIELDS = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.primaryTypeDisplayName',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.priceRange',
  'places.servesVegetarianFood',
  'places.regularOpeningHours',
  'places.photos',
  'places.businessStatus',
].join(',')

/** What to look for: a meal by place types, or a kind of food by text */
const EAT_KIND: Record<string, { types?: string[]; text?: string }> = {
  breakfast: { types: ['cafe', 'bakery', 'breakfast_restaurant', 'brunch_restaurant', 'coffee_shop'] },
  lunch: { types: ['restaurant'] },
  dinner: { types: ['restaurant'] },
  // 'kosher' alone also finds kosher shops and caterers, which travellers keeping kosher want too
  kosher: { text: 'kosher' },
  vegetarian: { text: 'vegetarian restaurant' },
  seafood: { text: 'seafood restaurant' },
}
export const EAT_KINDS = Object.keys(EAT_KIND)

const eatCache = new Map<string, Promise<EatPlace[]>>()

export function eatNear(key: string, q: { kind: string; lat: number; lng: number; radius: number }): Promise<EatPlace[]> {
  const id = `${q.kind}|${q.lat.toFixed(3)}|${q.lng.toFixed(3)}|${Math.round(q.radius / 100)}`
  let hit = eatCache.get(id)
  if (!hit) {
    hit = fetchEat(key, q)
    hit.catch(() => eatCache.delete(id))
    eatCache.set(id, hit)
  }
  return hit
}

async function fetchEat(key: string, q: { kind: string; lat: number; lng: number; radius: number }): Promise<EatPlace[]> {
  const conf = EAT_KIND[q.kind]
  const dLat = q.radius / 111320
  const dLng = q.radius / (111320 * Math.cos((q.lat * Math.PI) / 180))
  const body = conf.types
    ? {
        includedTypes: conf.types,
        excludedTypes: ['fast_food_restaurant', 'lodging', 'supermarket', 'grocery_store', 'convenience_store'],
        maxResultCount: 20,
        rankPreference: 'POPULARITY',
        languageCode: 'he',
        locationRestriction: { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: q.radius } },
      }
    : {
        textQuery: conf.text,
        pageSize: 20,
        languageCode: 'he',
        locationRestriction: { rectangle: { low: { latitude: q.lat - dLat, longitude: q.lng - dLng }, high: { latitude: q.lat + dLat, longitude: q.lng + dLng } } },
      }
  const res = await fetch(`https://places.googleapis.com/v1/places:${conf.types ? 'searchNearby' : 'searchText'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': EAT_FIELDS },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } }
    throw new Error(`places eat ${res.status} ${err.error?.status ?? ''}: ${err.error?.message ?? ''}`)
  }
  const places = ((await res.json()) as { places?: GoogleEat[] }).places ?? []
  return places.map(toEat).filter((p): p is EatPlace => !!p)
}

export function parseEat(params: URLSearchParams) {
  const kind = params.get('kind') ?? ''
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  const radius = Number(params.get('radius'))
  if (!EAT_KIND[kind] || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (!Number.isFinite(radius) || radius < 200 || radius > 10000) return null
  return { kind, lat, lng, radius }
}

/** Yes/no facts asked for every place (restaurants use most; sights use children, groups, toilets, dogs) */
const FACTS = ['reservable', 'outdoorSeating', 'goodForChildren', 'goodForGroups', 'restroom', 'menuForChildren', 'servesVegetarianFood', 'servesBeer', 'servesWine', 'servesCocktails', 'servesDessert', 'servesCoffee', 'takeout', 'delivery', 'dineIn', 'liveMusic', 'allowsDogs']

const DETAIL_FIELDS = [
  'id',
  'displayName',
  'location',
  'types',
  'primaryTypeDisplayName',
  'rating',
  'userRatingCount',
  'priceLevel',
  'priceRange',
  'regularOpeningHours',
  'photos',
  'businessStatus',
  'shortFormattedAddress',
  'formattedAddress',
  'editorialSummary',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'reviews',
  'accessibilityOptions',
  ...FACTS,
].join(',')

interface GoogleReview {
  rating?: number
  relativePublishTimeDescription?: string
  text?: { text?: string; languageCode?: string }
  originalText?: { text?: string; languageCode?: string }
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string }
}

const detailCache = new Map<string, Promise<RestaurantDetails>>()

export function restaurantDetails(key: string, id: string): Promise<RestaurantDetails> {
  let hit = detailCache.get(id)
  if (!hit) {
    hit = (async () => {
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=he`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': DETAIL_FIELDS },
      })
      if (!res.ok) throw new Error(`restaurant details ${res.status}`)
      const p = (await res.json()) as GoogleEat & {
        shortFormattedAddress?: string
        formattedAddress?: string
        editorialSummary?: { text?: string }
        internationalPhoneNumber?: string
        websiteUri?: string
        googleMapsUri?: string
        reviews?: GoogleReview[]
      } & Record<string, unknown>
      const base = toEat(p)
      if (!base) throw new Error('restaurant not found')
      const facts: Record<string, boolean> = {}
      for (const f of FACTS) if (typeof p[f] === 'boolean') facts[f] = p[f] as boolean
      const access = p.accessibilityOptions as { wheelchairAccessibleEntrance?: boolean } | undefined
      if (typeof access?.wheelchairAccessibleEntrance === 'boolean') facts.wheelchair = access.wheelchairAccessibleEntrance
      return {
        ...base,
        types: p.types ?? [],
        address: p.shortFormattedAddress ?? p.formattedAddress,
        summary: p.editorialSummary?.text,
        phone: p.internationalPhoneNumber,
        website: p.websiteUri,
        mapsUrl: p.googleMapsUri,
        facts,
        gallery: (p.photos ?? []).slice(0, 10).map((ph) => ({ name: ph.name, author: ph.authorAttributions?.[0]?.displayName, authorUrl: ph.authorAttributions?.[0]?.uri })),
        reviews: (p.reviews ?? []).flatMap((r) => {
          const text = r.text?.text ?? r.originalText?.text
          if (!text) return []
          const from = r.originalText?.languageCode
          return [
            {
              author: r.authorAttribution?.displayName ?? '',
              authorUrl: r.authorAttribution?.uri,
              photo: r.authorAttribution?.photoUri,
              rating: r.rating,
              when: r.relativePublishTimeDescription,
              text,
              translatedFrom: from && from !== r.text?.languageCode ? from : undefined,
            },
          ]
        }),
      }
    })()
    hit.catch(() => detailCache.delete(id))
    detailCache.set(id, hit)
  }
  return hit
}

export function parseRestaurant(params: URLSearchParams) {
  const id = params.get('id') ?? ''
  return /^[A-Za-z0-9_-]{10,300}$/.test(id) ? { id } : null
}

/* ---------- A trip stop's Google id, by name and place ---------- */

const idCache = new Map<string, Promise<string | null>>()

/** The Google place with this name within ~400 m (a same-named place elsewhere isn't this one) */
export function findPlaceId(key: string, name: string, lat: number, lng: number): Promise<string | null> {
  const id = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`
  let hit = idCache.get(id)
  if (!hit) {
    hit = (async () => {
      const d = 0.0036
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id' },
        body: JSON.stringify({
          textQuery: name,
          pageSize: 1,
          locationRestriction: {
            rectangle: {
              low: { latitude: lat - d, longitude: lng - d / Math.cos((lat * Math.PI) / 180) },
              high: { latitude: lat + d, longitude: lng + d / Math.cos((lat * Math.PI) / 180) },
            },
          },
        }),
      })
      if (!res.ok) throw new Error(`find place ${res.status}`)
      return ((await res.json()) as { places?: { id: string }[] }).places?.[0]?.id ?? null
    })()
    hit.catch(() => idCache.delete(id))
    idCache.set(id, hit)
  }
  return hit
}
