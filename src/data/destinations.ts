import type { Destination } from './types'

/** Destinations a new trip can start from (city centre coordinates). */
export const DESTINATIONS: Destination[] = [
  { id: 'lisbon', name: 'ליסבון', country: 'פורטוגל', lat: 38.7223, lng: -9.1393, zoom: 12 },
  { id: 'porto', name: 'פורטו', country: 'פורטוגל', lat: 41.1579, lng: -8.6291, zoom: 12.5 },
  { id: 'barcelona', name: 'ברצלונה', country: 'ספרד', lat: 41.3874, lng: 2.1686, zoom: 12 },
  { id: 'madrid', name: 'מדריד', country: 'ספרד', lat: 40.4168, lng: -3.7038, zoom: 12 },
  { id: 'paris', name: 'פריז', country: 'צרפת', lat: 48.8566, lng: 2.3522, zoom: 12 },
  { id: 'london', name: 'לונדון', country: 'בריטניה', lat: 51.5072, lng: -0.1276, zoom: 11.5 },
  { id: 'amsterdam', name: 'אמסטרדם', country: 'הולנד', lat: 52.3676, lng: 4.9041, zoom: 12.5 },
  { id: 'berlin', name: 'ברלין', country: 'גרמניה', lat: 52.52, lng: 13.405, zoom: 11.5 },
  { id: 'prague', name: 'פראג', country: 'צ׳כיה', lat: 50.0755, lng: 14.4378, zoom: 12.5 },
  { id: 'vienna', name: 'וינה', country: 'אוסטריה', lat: 48.2082, lng: 16.3738, zoom: 12 },
  { id: 'budapest', name: 'בודפשט', country: 'הונגריה', lat: 47.4979, lng: 19.0402, zoom: 12 },
  { id: 'rome', name: 'רומא', country: 'איטליה', lat: 41.9028, lng: 12.4964, zoom: 12 },
  { id: 'athens', name: 'אתונה', country: 'יוון', lat: 37.9838, lng: 23.7275, zoom: 12 },
  { id: 'new-york', name: 'ניו יורק', country: 'ארצות הברית', lat: 40.7128, lng: -74.006, zoom: 11.5 },
  { id: 'tokyo', name: 'טוקיו', country: 'יפן', lat: 35.6762, lng: 139.6503, zoom: 11 },
]
