import type { Day } from './types'

export type RestaurantCity = 'lisbon' | 'sintra' | 'porto'

export interface Restaurant {
  id: string
  name: string
  /** Short Hebrew description of the food */
  cuisine: string
  area: string
}

/** Name used in the Google Maps search query */
export const CITY_QUERY: Record<RestaurantCity, string> = {
  lisbon: 'Lisbon',
  sintra: 'Sintra',
  porto: 'Porto',
}

export const CITY_LABEL: Record<RestaurantCity, string> = {
  lisbon: 'ליסבון',
  sintra: 'סינטרה',
  porto: 'פורטו',
}

/**
 * Static list of well-known restaurants. No ratings or reviews are stored in the app;
 * each item links to Google Maps, where the reviews and photos live.
 * An in-app list sorted by live rating would need a Google Places API key.
 */
export const RESTAURANTS: Record<RestaurantCity, Restaurant[]> = {
  lisbon: [
    { id: 'r-ramiro', name: 'Cervejaria Ramiro', cuisine: 'פירות ים', area: 'אינטנדנטה' },
    { id: 'r-flores', name: 'Taberna da Rua das Flores', cuisine: 'טברנה פורטוגלית', area: 'שיאדו' },
    { id: 'r-cevicheria', name: 'A Cevicheria', cuisine: 'פרואני', area: 'פרינסיפה ריאל' },
    { id: 'r-belcanto', name: 'Belcanto', cuisine: 'פיין דיינינג', area: 'שיאדו' },
  ],
  sintra: [
    { id: 'r-tascantiga', name: 'Tascantiga', cuisine: 'טאפאס פורטוגלי', area: 'מרכז סינטרה' },
    { id: 'r-incomum', name: 'Incomum by Luís Santos', cuisine: 'מטבח עכשווי', area: 'מרכז סינטרה' },
    { id: 'r-piriquita', name: 'Piriquita', cuisine: 'מאפייה וקינוחים', area: 'מרכז סינטרה' },
  ],
  porto: [
    { id: 'r-guedes', name: 'Casa Guedes', cuisine: 'כריכי חזיר', area: 'באליאו' },
    { id: 'r-mercadores', name: 'Taberna dos Mercadores', cuisine: 'טברנה פורטוגלית', area: 'ריביירה' },
    { id: 'r-avillez', name: 'Cantinho do Avillez', cuisine: 'מטבח פורטוגלי מודרני', area: 'מרכז העיר' },
    { id: 'r-paparico', name: 'O Paparico', cuisine: 'מטבח מסורתי', area: 'קושטה קבראל' },
  ],
}

export function restaurantCityForDay(day: Day): RestaurantCity {
  if (day.title === 'סינטרה') return 'sintra'
  if (day.city === 'פורטו') return 'porto'
  return 'lisbon'
}

export const googleSearchUrl = (r: Restaurant, city: RestaurantCity) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${CITY_QUERY[city]}`)}`

export const nearbyRestaurantsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/restaurants/@${lat.toFixed(5)},${lng.toFixed(5)},16z`
