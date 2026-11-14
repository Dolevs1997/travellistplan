import type { Trip, TripSummary } from './types'

export const mockTrip: Trip = {
  id: 'lisbon-porto',
  name: 'ליסבון ופורטו',
  destination: { id: 'lisbon', name: 'ליסבון', country: 'פורטוגל', lat: 38.7223, lng: -9.1393, zoom: 12 },
  progress: { dayId: 'd2', stopId: 's5' },
  budget: {
    currency: 'EUR',
    categories: [
      { id: 'stay', label: 'לינה', spent: 480, planned: 700 },
      { id: 'flights', label: 'טיסות', spent: 390, planned: 400 },
      { id: 'food', label: 'אוכל', spent: 210, planned: 450 },
      { id: 'transport', label: 'תחבורה', spent: 70, planned: 150 },
      { id: 'tickets', label: 'אטרקציות', spent: 90, planned: 300 },
    ],
  },
  days: [
    {
      id: 'd1',
      date: '2026-11-26',
      city: 'ליסבון',
      title: 'באיישה ואלפאמה',
      stops: [
        { id: 's1', name: 'כיכר הקומרסיו', area: 'באיישה', lat: 38.7075, lng: -9.1364, start: '10:00', end: '10:45', kind: 'heritage', transitToNext: { mode: 'walk', minutes: 20 } },
        { id: 's2', name: 'טירת סאו ז׳ורז׳ה', area: 'אלפאמה', lat: 38.7139, lng: -9.1335, start: '11:15', end: '13:00', kind: 'heritage', heritage: true, transitToNext: { mode: 'walk', minutes: 8 } },
        { id: 's3', name: 'מירדורו סנטה לוזיה', area: 'אלפאמה', lat: 38.7118, lng: -9.1302, start: '13:15', end: '17:30', kind: 'view' },
      ],
      suggestions: [],
    },
    {
      id: 'd2',
      date: '2026-11-27',
      city: 'ליסבון',
      title: 'בלם',
      stops: [
        { id: 's4', name: 'פסטייש דה בלם', area: 'בלם', lat: 38.6975, lng: -9.2032, start: '09:00', end: '09:45', kind: 'food', transitToNext: { mode: 'walk', minutes: 4 } },
        { id: 's5', name: 'מנזר ז׳רונימוש', area: 'בלם', lat: 38.6979, lng: -9.2068, start: '10:00', end: '11:30', kind: 'heritage', heritage: true, transitToNext: { mode: 'walk', minutes: 12 } },
        { id: 's6', name: 'מגדל בלם', area: 'בלם', lat: 38.6916, lng: -9.216, start: '11:45', end: '12:30', kind: 'heritage', heritage: true, needsBooking: true, note: 'להגיע כמה דקות לפני הזמן – התור בכניסה יכול להיות ארוך.', transitToNext: { mode: 'tram', minutes: 25, line: '15' } },
        { id: 's7', name: 'MAAT – מוזיאון לאמנות ואדריכלות', area: 'בלם', lat: 38.6957, lng: -9.195, start: '13:00', end: '14:30', kind: 'museum' },
      ],
      suggestions: [
        { id: 'g1', name: 'אנדרטת התגליות', area: 'בלם', lat: 38.6935, lng: -9.2057, kind: 'heritage', travel: { mode: 'walk', minutes: 6 }, durationMin: 30 },
        { id: 'g2', name: 'הגן הבוטני הטרופי', area: 'בלם', lat: 38.6966, lng: -9.2027, kind: 'nature', travel: { mode: 'walk', minutes: 8 }, durationMin: 60 },
        { id: 'g3', name: 'ארמון אז׳ודה', area: 'אז׳ודה', lat: 38.7076, lng: -9.1979, kind: 'heritage', travel: { mode: 'bus', minutes: 15 }, durationMin: 90 },
        { id: 'g4', name: 'LX Factory', area: 'אלקנטרה', lat: 38.7037, lng: -9.1785, kind: 'market', travel: { mode: 'tram', minutes: 15, line: '15' }, durationMin: 120 },
      ],
    },
    {
      id: 'd3',
      date: '2026-11-28',
      city: 'ליסבון',
      title: 'סינטרה',
      stops: [
        { id: 's8', name: 'ארמון פנה', area: 'סינטרה', lat: 38.7876, lng: -9.3906, start: '10:00', end: '12:30', kind: 'heritage', heritage: true, needsBooking: true, transitToNext: { mode: 'walk', minutes: 20 } },
        { id: 's9', name: 'קינטה דה רגליירה', area: 'סינטרה', lat: 38.7963, lng: -9.3961, start: '13:00', end: '16:30', kind: 'heritage', heritage: true },
      ],
      suggestions: [],
    },
    {
      id: 'd4',
      date: '2026-11-29',
      city: 'ליסבון',
      title: 'יום פנוי',
      stops: [],
      suggestions: [
        { id: 'g5', name: 'אוקאנריו ליסבון', area: 'פארק האומות', lat: 38.7635, lng: -9.0937, kind: 'museum', travel: { mode: 'metro', minutes: 30 }, durationMin: 150 },
        { id: 'g6', name: 'שוק טיים אאוט', area: 'קאיש דו סודרה', lat: 38.7069, lng: -9.1459, kind: 'food', travel: { mode: 'metro', minutes: 15 }, durationMin: 60 },
        { id: 'g7', name: 'LX Factory', area: 'אלקנטרה', lat: 38.7037, lng: -9.1785, kind: 'market', travel: { mode: 'tram', minutes: 20, line: '15' }, durationMin: 120 },
      ],
    },
    {
      id: 'd5',
      date: '2026-11-30',
      city: 'פורטו',
      title: 'מעבר לפורטו',
      stops: [
        { id: 's10', name: 'ליבראריה לו', area: 'מרכז העיר', lat: 41.1469, lng: -8.6149, start: '15:00', end: '15:45', kind: 'heritage', needsBooking: true, transitToNext: { mode: 'walk', minutes: 3 } },
        { id: 's11', name: 'מגדל קלריגוש', area: 'מרכז העיר', lat: 41.1458, lng: -8.614, start: '16:00', end: '17:00', kind: 'view' },
      ],
      suggestions: [],
    },
    {
      id: 'd6',
      date: '2026-12-01',
      city: 'פורטו',
      title: 'ריביירה',
      stops: [
        { id: 's12', name: 'רציף ריביירה', area: 'ריביירה', lat: 41.1408, lng: -8.6131, start: '10:00', end: '12:00', kind: 'view', heritage: true, transitToNext: { mode: 'walk', minutes: 5 } },
        { id: 's13', name: 'גשר דום לואיש הראשון', area: 'ריביירה', lat: 41.1399, lng: -8.6094, start: '12:15', end: '13:00', kind: 'view' },
      ],
      suggestions: [
        { id: 'g8', name: 'מרתפי הפורט בגאיה', area: 'וילה נובה דה גאיה', lat: 41.1375, lng: -8.6129, kind: 'food', travel: { mode: 'walk', minutes: 10 }, durationMin: 90 },
        { id: 'g9', name: 'שוק בוליאו', area: 'מרכז העיר', lat: 41.1493, lng: -8.6066, kind: 'market', travel: { mode: 'metro', minutes: 12 }, durationMin: 60 },
      ],
    },
    {
      id: 'd7',
      date: '2026-12-02',
      city: 'פורטו',
      title: 'סרלבש',
      stops: [
        { id: 's14', name: 'מוזיאון סרלבש', area: 'בושטה', lat: 41.1597, lng: -8.6598, start: '10:00', end: '13:00', kind: 'museum' },
      ],
      suggestions: [
        { id: 'g10', name: 'חוף מטוזינוש', area: 'מטוזינוש', lat: 41.1757, lng: -8.6898, kind: 'nature', travel: { mode: 'bus', minutes: 20 }, durationMin: 120 },
      ],
    },
    {
      id: 'd8',
      date: '2026-12-03',
      city: 'פורטו',
      title: 'יום פנוי',
      stops: [],
      suggestions: [
        { id: 'g11', name: 'שוק בוליאו', area: 'מרכז העיר', lat: 41.1493, lng: -8.6066, kind: 'market', travel: { mode: 'metro', minutes: 12 }, durationMin: 60 },
      ],
    },
  ],
}

export const otherTrips: TripSummary[] = [
  { id: 'tokyo', name: 'טוקיו וקיוטו', meta: 'אפריל 2027 · 10 ימים', status: 'טיוטה', tile: 'water' },
  { id: 'crete', name: 'כרתים', meta: 'יוני 2027 · 6 ימים', status: 'טיוטה', tile: 'park' },
]
