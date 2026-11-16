import type { PlaceInfo, StopKind } from './types'

/*
 * Free place data, no keys:
 *  - Recommendations: Wikidata (query service) – places near a point by category, with Hebrew names,
 *    photos (Wikimedia Commons) and a popularity score (how many Wikipedia editions cover them).
 *  - Summary & facts: Wikipedia (Hebrew first, English as a fallback).
 *  - Manual search: Wikidata search (works in Hebrew) + Photon (OpenStreetMap) for any named place.
 * Google ratings could be added later as another source behind the same functions.
 */

const SPARQL = 'https://query.wikidata.org/sparql'
const WD_API = 'https://www.wikidata.org/w/api.php'
const PHOTON = 'https://photon.komoot.io/api/'

export type CategoryId = 'all' | StopKind

/** Wikidata classes (P31 "instance of") per category */
const CLASSES: Record<StopKind, string[]> = {
  museum: ['Q33506', 'Q207694', 'Q1007870', 'Q17431399', 'Q2772772', 'Q1595639', 'Q3329412', 'Q2087181', 'Q588140'],
  heritage: [
    'Q16970', 'Q2977', 'Q163687', 'Q44613', 'Q32815', 'Q34627', 'Q23413', 'Q16560', 'Q4989906', 'Q5003624',
    'Q839954', 'Q570116', 'Q174782', 'Q483453', 'Q12518', 'Q12280', 'Q24354', 'Q57821', 'Q170980', 'Q179700',
    'Q1081138', 'Q15243209', 'Q2319498',
  ],
  nature: ['Q22698', 'Q1107656', 'Q167346', 'Q8502', 'Q23397', 'Q35509', 'Q34038', 'Q46169', 'Q473972', 'Q43501', 'Q2281788', 'Q4421'],
  beach: ['Q40080', 'Q14713846'], // beach, river beach
  view: ['Q1440300', 'Q6017969', 'Q54050'],
  market: ['Q330284', 'Q37654', 'Q132510', 'Q1047669'],
  shopping: ['Q11315', 'Q216107', 'Q13226383', 'Q1758434'],
  food: ['Q11707', 'Q30022', 'Q187456', 'Q131734', 'Q274393', 'Q1310145'],
}

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'heritage', label: 'תרבות ומורשת' },
  { id: 'museum', label: 'מוזיאונים' },
  { id: 'food', label: 'מסעדות' },
  { id: 'beach', label: 'חופים' },
  { id: 'market', label: 'שווקים' },
  { id: 'nature', label: 'טבע' },
  { id: 'view', label: 'תצפיות' },
  { id: 'shopping', label: 'קניות' },
]

export const KIND_LABEL: Record<StopKind, string> = {
  heritage: 'תרבות ומורשת',
  museum: 'מוזיאון',
  food: 'אוכל',
  market: 'שוק',
  nature: 'טבע',
  beach: 'חוף',
  view: 'תצפית',
  shopping: 'קניות',
}

const classToKind = new Map<string, StopKind>()
;(Object.keys(CLASSES) as StopKind[]).forEach((k) => CLASSES[k].forEach((q) => classToKind.set(q, k)))

const qid = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1)

/** Commons file → resized image URL */
export const commonsImage = (fileOrUrl: string, width = 640) => {
  const file = decodeURIComponent(fileOrUrl.slice(fileOrUrl.lastIndexOf('/') + 1)).replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
}
const commonsPage = (fileOrUrl: string) => {
  const file = decodeURIComponent(fileOrUrl.slice(fileOrUrl.lastIndexOf('/') + 1)).replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`
}

async function sparql(query: string, signal?: AbortSignal, timeoutMs = 20_000) {
  // The public query service is sometimes slow or down (502): give up after a while so callers can fall back
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  signal?.addEventListener('abort', () => ctrl.abort())
  const res = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
    signal: ctrl.signal,
    headers: { Accept: 'application/sparql-results+json' },
  }).finally(() => window.clearTimeout(timer))
  if (!res.ok) throw new Error(`wikidata ${res.status}`)
  const data = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }
  return data.results.bindings
}

/** Search radius for a destination: a city vs. a whole region or island */
export const radiusKmFor = (zoom: number) => (zoom >= 11 ? 5 : zoom >= 9 ? 15 : 45)

/** Recommended places near a point, most popular first. Results are cached for the session. */
const cache = new Map<string, Promise<PlaceInfo[]>>()

export function recommendedPlaces(center: { lat: number; lng: number }, radiusKm: number, category: CategoryId): Promise<PlaceInfo[]> {
  const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)},${radiusKm},${category}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = fetchRecommended(center, radiusKm, category).catch((e) => {
    cache.delete(key) // allow a retry
    throw e
  })
  cache.set(key, p)
  return p
}

/** Wikidata first (categories + popularity); if it fails, Wikipedia's nearby search (fast and reliable) */
async function fetchRecommended(center: { lat: number; lng: number }, radiusKm: number, category: CategoryId) {
  // Restaurants: well-known ones from Wikidata plus many more (with opening hours) from OpenStreetMap.
  // Both run at once; OpenStreetMap's public servers are often slow, so they get 10 s at most.
  if (category === 'food') {
    const [famous, osm] = await Promise.all([
      fetchFromWikidata(center, radiusKm, 'food').catch(() => [] as PlaceInfo[]),
      foodNearby(center, radiusKm, 10_000).catch(() => [] as PlaceInfo[]),
    ])
    const seen = new Set(famous.map((p) => p.name.toLowerCase()))
    const merged = [...famous, ...osm.filter((p) => !seen.has(p.name.toLowerCase()))].slice(0, 40)
    if (merged.length) return merged
  }
  try {
    return await fetchFromWikidata(center, radiusKm, category)
  } catch {
    const fallback = await wikipediaNearby(center, radiusKm, category)
    if (!fallback.length && category === 'all') throw new Error('no recommendations')
    return fallback
  }
}

async function fetchFromWikidata(center: { lat: number; lng: number }, radiusKm: number, category: CategoryId) {
  const kinds: StopKind[] = category === 'all' ? ['heritage', 'museum', 'nature', 'beach', 'view', 'market'] : [category]
  const values = kinds.flatMap((k) => CLASSES[k]).map((q) => `wd:${q}`).join(' ')
  const query = `SELECT ?item ?itemLabel ?itemDescription ?coord ?type ?image ?links ?heTitle ?enTitle WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${center.lng} ${center.lat})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${radiusKm}". }
  VALUES ?type { ${values} }
  ?item wdt:P31 ?type.
  ?item wikibase:sitelinks ?links.
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?he schema:about ?item; schema:isPartOf <https://he.wikipedia.org/>; schema:name ?heTitle. }
  OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?enTitle. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "he,en". }
} ORDER BY DESC(?links) LIMIT 80`
  const rows = await sparql(query)
  const seen = new Set<string>()
  const out: PlaceInfo[] = []
  for (const r of rows) {
    const id = qid(r.item.value)
    const name = r.itemLabel?.value
    if (seen.has(id) || !name || /^Q\d+$/.test(name)) continue // skip duplicates and items with no he/en name
    seen.add(id)
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord.value)
    if (!m) continue
    out.push({
      source: 'wikidata',
      ref: id,
      name,
      kind: classToKind.get(qid(r.type.value)) ?? 'heritage',
      lat: Number(m[2]),
      lng: Number(m[1]),
      description: r.itemDescription?.value,
      image: r.image ? commonsImage(r.image.value) : undefined,
      imagePage: r.image ? commonsPage(r.image.value) : undefined,
      article: r.heTitle ? { lang: 'he', title: r.heTitle.value } : r.enTitle ? { lang: 'en', title: r.enTitle.value } : undefined,
      popularity: Number(r.links.value),
    })
    if (out.length >= 40) break
  }
  return out
}

/* ---------- OpenStreetMap (Overpass): restaurants and opening hours ---------- */

/** Public Overpass servers; they are often busy, so ask several and take the first good answer */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

interface OsmElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Resolve with the first promise that succeeds; reject only if all fail */
function firstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let failed = 0
    promises.forEach((p) =>
      p.then(resolve, (e) => {
        failed += 1
        if (failed === promises.length) reject(e)
      }),
    )
  })
}

async function overpass(query: string, timeoutMs = 25_000): Promise<OsmElement[]> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await firstSuccess(
      OVERPASS.map(async (url) => {
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal })
        if (!res.ok) throw new Error(`overpass ${res.status}`)
        const data = (await res.json()) as { elements?: OsmElement[] }
        if (!data.elements) throw new Error('overpass: no data')
        return data.elements
      }),
    )
  } finally {
    window.clearTimeout(timer)
    ctrl.abort() // stop the slower servers
  }
}

const CUISINE_HE: Record<string, string> = {
  italian: 'איטלקי', pizza: 'פיצה', regional: 'מקומי', portuguese: 'פורטוגלי', spanish: 'ספרדי', french: 'צרפתי',
  greek: 'יווני', seafood: 'פירות ים', fish: 'דגים', japanese: 'יפני', sushi: 'סושי', chinese: 'סיני', indian: 'הודי',
  thai: 'תאילנדי', mexican: 'מקסיקני', burger: 'המבורגר', steak_house: 'סטייקיה', vegetarian: 'צמחוני', vegan: 'טבעוני',
  coffee_shop: 'קפה', ice_cream: 'גלידה', tapas: 'טאפאס', mediterranean: 'ים תיכוני', turkish: 'טורקי', kebab: 'קבב',
  middle_eastern: 'מזרח תיכוני', american: 'אמריקאי', asian: 'אסייתי', vietnamese: 'וייטנאמי', korean: 'קוריאני',
}

const cuisineHe = (raw?: string) =>
  raw
    ?.split(';')
    .map((c) => CUISINE_HE[c.trim()] ?? c.trim().replace(/_/g, ' '))
    .slice(0, 2)
    .join(', ')

function osmToPlace(e: OsmElement, kind: StopKind): PlaceInfo | null {
  const t = e.tags ?? {}
  const lat = e.lat ?? e.center?.lat
  const lng = e.lon ?? e.center?.lon
  const name = t['name:he'] ?? t.name
  if (!name || lat === undefined || lng === undefined) return null
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
  const what = t.amenity === 'cafe' ? 'בית קפה' : t.amenity === 'bar' || t.amenity === 'pub' ? 'בר' : 'מסעדה'
  const cuisine = cuisineHe(t.cuisine)
  return {
    source: 'osm',
    ref: `${e.type}/${e.id}`,
    name,
    kind,
    lat,
    lng,
    description: cuisine ? `${what} · ${cuisine}` : what,
    address: street || undefined,
    openingHours: t.opening_hours,
    website: t.website ?? t['contact:website'],
    phone: t.phone ?? t['contact:phone'],
    cuisine,
    image: t.image?.startsWith('http') ? t.image : t.wikimedia_commons?.startsWith('File:') ? commonsImage(t.wikimedia_commons) : undefined,
  }
}

/**
 * Restaurants and cafés near a point from OpenStreetMap. There are no ratings there, so the
 * better-documented places come first (Wikidata link, website, cuisine, opening hours).
 */
async function foodNearby(center: { lat: number; lng: number }, radiusKm: number, timeoutMs = 25_000): Promise<PlaceInfo[]> {
  const r = Math.round(Math.min(radiusKm, 3) * 1000) // dense in cities: 3 km is plenty
  const els = await overpass(
    `[out:json][timeout:20];nwr(around:${r},${center.lat},${center.lng})[amenity~"^(restaurant|cafe)$"][name];out center tags 400;`,
    timeoutMs,
  )
  const score = (t: Record<string, string> = {}) =>
    (t.wikidata ? 5 : 0) + (t.website || t['contact:website'] ? 2 : 0) + (t.cuisine ? 1 : 0) + (t.opening_hours ? 1 : 0) + (t.phone ? 0.5 : 0)
  return els
    .sort((a, b) => score(b.tags) - score(a.tags))
    .map((e) => osmToPlace(e, 'food'))
    .filter((p): p is PlaceInfo => !!p)
    .slice(0, 40)
}

export interface PlaceHours {
  hours?: string
  website?: string
  phone?: string
  fee?: boolean
  wheelchair?: boolean
}

const hoursCache = new Map<string, Promise<PlaceHours>>()

/** Opening hours and practical info from OpenStreetMap (looked up by Wikidata id when needed) */
export function placeHours(info: PlaceInfo): Promise<PlaceHours> {
  if (info.source === 'osm' && info.openingHours) return Promise.resolve({ hours: info.openingHours, website: info.website, phone: info.phone })
  const key = `${info.source}:${info.ref}`
  const hit = hoursCache.get(key)
  if (hit) return hit
  const q =
    info.source === 'wikidata'
      ? `[out:json][timeout:15];nwr["wikidata"="${info.ref}"];out tags 3;`
      : `[out:json][timeout:15];${info.ref.replace('/', '(')});out tags;`
  const p = overpass(q, 20_000)
    .then((els) => {
      const t = els.find((e) => e.tags?.opening_hours)?.tags ?? els[0]?.tags ?? {}
      return {
        hours: t.opening_hours,
        website: t.website ?? t['contact:website'] ?? info.website,
        phone: t.phone ?? t['contact:phone'] ?? info.phone,
        fee: t.fee === 'yes' ? true : t.fee === 'no' ? false : undefined,
        wheelchair: t.wheelchair === 'yes' ? true : t.wheelchair === 'no' ? false : undefined,
      }
    })
    .catch((e) => {
      hoursCache.delete(key)
      throw e
    })
  hoursCache.set(key, p)
  return p
}

const DAY_HE: Record<string, string> = { Mo: 'ב׳', Tu: 'ג׳', We: 'ד׳', Th: 'ה׳', Fr: 'ו׳', Sa: 'ש׳', Su: 'א׳', PH: 'חגים' }

/** "Mo-Fr 09:00-18:00; Sa 10:00-14:00" → lines in Hebrew day names */
export function formatHours(raw: string): string[] {
  if (raw.trim() === '24/7') return ['פתוח 24 שעות, כל השבוע']
  return raw
    .split(';')
    .map((rule) =>
      rule
        .trim()
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAY_HE[d])
        .replace(/\boff\b|\bclosed\b/gi, 'סגור')
        .replace(/,(?=\S)/g, ', ')
        // Keep each time range in reading order inside Hebrew text: 09:00–18:00
        .replace(/(\d\d:\d\d)\s*-\s*(\d\d:\d\d\+?)/g, '⁦$1–$2⁩'),
    )
    .filter(Boolean)
}

/* ---------- fallback: Wikipedia nearby search ---------- */

interface GeoPage {
  title: string
  index?: number
  description?: string
  coordinates?: { lat: number; lon: number }[]
  thumbnail?: { source: string }
  pageimage?: string
  pageprops?: { wikibase_item?: string }
}

/** Guess a category from a Wikipedia short description (Hebrew or English) */
function kindFromText(text = ''): StopKind | null {
  const t = text.toLowerCase()
  if (/שכונ|רובע|תחנ|רחוב|בית ספר|אוניברסיט|בית חולים|מלון|חברה|עירייה|neighbo|district|station|street|school|universit|hospital|hotel|company|municipal|commune|village|town in|city in|institut|ministry|embassy|office|agency|מכון|משרד|שגרירות|סוכנות/.test(t)) return null
  if (/מוזיאון|גלריה|museum|gallery/.test(t)) return 'museum'
  if (/שוק|market/.test(t)) return 'market'
  if (/קניון|mall|department store|shopping/.test(t)) return 'shopping'
  if (/מסעד|בית קפה|restaurant|café|cafe|bakery|bar\b/.test(t)) return 'food'
  if (/תצפית|viewpoint|observation|lookout|גבעה|hill/.test(t)) return 'view'
  if (/חוף רחצה|^חוף|beach|playa|praia|plage|spiaggia/.test(t)) return 'beach'
  if (/פארק|גן |גנים|חוף|הר |אגם|יער|מפל|park|garden|beach|mountain|lake|forest|waterfall|zoo|aquarium/.test(t)) return 'nature'
  return 'heritage'
}

async function wikipediaNearby(center: { lat: number; lng: number }, radiusKm: number, category: CategoryId): Promise<PlaceInfo[]> {
  const radius = Math.min(10_000, Math.round(radiusKm * 1000)) // the API's maximum is 10 km
  const run = async (lang: 'he' | 'en') => {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${center.lat}%7C${center.lng}&ggsradius=${radius}&ggslimit=60&prop=coordinates%7Cpageimages%7Cdescription%7Cpageprops&ppprop=wikibase_item&piprop=thumbnail%7Cname&pithumbsize=640&colimit=max&pilimit=max`
    const res = await fetch(url)
    if (!res.ok) return []
    const pages = Object.values(((await res.json()) as { query?: { pages?: Record<string, GeoPage> } }).query?.pages ?? {})
    return pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((p) => ({ p, lang }))
  }
  const [he, en] = await Promise.all([run('he').catch(() => []), run('en').catch(() => [])])
  const seen = new Set<string>()
  const out: PlaceInfo[] = []
  // Hebrew articles first (Hebrew names), then English ones for places with no Hebrew article
  for (const { p, lang } of [...he, ...en]) {
    const ref = p.pageprops?.wikibase_item
    const c = p.coordinates?.[0]
    if (!ref || !c || seen.has(ref)) continue
    const kind = kindFromText(`${p.description ?? ''} ${p.title}`)
    if (!kind || (category !== 'all' && kind !== category)) continue
    seen.add(ref)
    out.push({
      source: 'wikidata',
      ref,
      name: p.title,
      kind,
      lat: c.lat,
      lng: c.lon,
      description: p.description,
      image: p.thumbnail?.source,
      imagePage: p.pageimage ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.pageimage)}` : undefined,
      article: { lang, title: p.title },
    })
  }
  // Places with a photo first: usually the better-documented sights
  return out.sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, 40)
}

/* ---------- details ---------- */

export interface PlaceDetails {
  summary?: string
  summaryLang?: 'he' | 'en'
  facts: string[]
  tips: string[]
  website?: string
  /** More photos of the place (Wikimedia Commons / the Wikipedia article) */
  gallery: { url: string; page: string }[]
  /** What visitors typically do there */
  activities: string[]
}

const detailsCache = new Map<string, Promise<PlaceDetails>>()

export function placeDetails(info: PlaceInfo): Promise<PlaceDetails> {
  const key = `${info.source}:${info.ref}`
  const hit = detailsCache.get(key)
  if (hit) return hit
  const p = fetchDetails(info).catch((e) => {
    detailsCache.delete(key)
    throw e
  })
  detailsCache.set(key, p)
  return p
}

/** Split Wikipedia text into sentences (Hebrew or English) */
const sentences = (text: string) =>
  text
    .split('\n')
    // Section headings ("היסטוריה") come as lines without sentence punctuation: drop them
    .filter((line) => /[.!?]/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[^\s])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && !/^[=\s]/.test(s))

async function wikiText(article: { lang: 'he' | 'en'; title: string }) {
  const url = `https://${article.lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&explaintext=1&exsectionformat=plain&exchars=2400&redirects=1&titles=${encodeURIComponent(article.title)}`
  const res = await fetch(url)
  if (!res.ok) return ''
  const data = (await res.json()) as { query?: { pages?: Record<string, { extract?: string }> } }
  return Object.values(data.query?.pages ?? {})[0]?.extract ?? ''
}

const fmtInt = (n: number) => n.toLocaleString('he-IL')

async function fetchDetails(info: PlaceInfo): Promise<PlaceDetails> {
  const facts: string[] = []
  const tips: string[] = []
  let website: string | undefined = info.website
  let commonsCat: string | undefined
  let article = info.article

  if (info.source === 'wikidata') {
    const rows = await sparql(`SELECT ?inception ?visitors ?unesco ?website ?commonsCat ?heTitle ?enTitle WHERE {
  BIND(wd:${info.ref} AS ?item)
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P1174 ?visitors. }
  OPTIONAL { ?item wdt:P1435 wd:Q9259. BIND(true AS ?unesco) }
  OPTIONAL { ?item wdt:P856 ?website. }
  OPTIONAL { ?item wdt:P373 ?commonsCat. }
  OPTIONAL { ?he schema:about ?item; schema:isPartOf <https://he.wikipedia.org/>; schema:name ?heTitle. }
  OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?enTitle. }
} LIMIT 1`).catch(() => [])
    const r = rows[0]
    if (r) {
      if (r.inception) {
        const year = Number(r.inception.value.slice(0, r.inception.value.indexOf('-', 1)))
        if (Number.isFinite(year)) facts.push(year < 0 ? `נבנה או נוסד בשנת ${-year} לפנה״ס` : `נבנה או נוסד בשנת ${year}`)
      }
      if (r.visitors) facts.push(`כ-${fmtInt(Math.round(Number(r.visitors.value)))} מבקרים בשנה`)
      if (r.unesco) {
        facts.push('אתר מורשת עולמית של אונסק״ו')
        tips.push('אתר מוכר ומבוקש – כדאי לבדוק מראש אם צריך להזמין כרטיסים')
      }
      if (r.website) website = r.website.value
      if (r.commonsCat) commonsCat = r.commonsCat.value
      if (!article) article = r.heTitle ? { lang: 'he', title: r.heTitle.value } : r.enTitle ? { lang: 'en', title: r.enTitle.value } : undefined
    }
  }

  let summary: string | undefined
  if (article) {
    const all = sentences(await wikiText(article).catch(() => ''))
    if (all.length) {
      summary = all.slice(0, 2).join(' ')
      facts.push(...all.slice(2, 6))
    }
  }
  if (website) tips.push('שעות פתיחה ומחירים עדכניים – באתר הרשמי')
  if (info.popularity && info.popularity >= 40) tips.push('מהמקומות המפורסמים באזור – הגעה בשעות הבוקר המוקדמות עוזרת להימנע מעומס')

  const gallery = await placeGallery(info, commonsCat, article).catch(() => [])
  const activities = activitiesFor(info, summary)
  return { summary, summaryLang: article?.lang, facts, tips, website, gallery, activities }
}

/* ---------- photo gallery ---------- */

interface ImagePage {
  title: string
  imageinfo?: { thumburl?: string; url?: string; width?: number; height?: number; descriptionurl?: string; mime?: string }[]
}

const usablePhoto = (p: ImagePage) => {
  const ii = p.imageinfo?.[0]
  if (!ii?.thumburl || !/image\/(jpeg|png|webp)/.test(ii.mime ?? 'image/jpeg')) return false
  if ((ii.width ?? 0) < 500 || (ii.height ?? 0) < 300) return false // icons, maps, logos
  return !/logo|icon|flag|coat of arms|map|locator|symbol|signature|\.svg/i.test(p.title)
}

/** Up to 10 photos: the place's Commons category first, else the images in its Wikipedia article */
async function placeGallery(info: PlaceInfo, commonsCat?: string, article?: { lang: 'he' | 'en'; title: string }) {
  const urlFor = (cat: string) =>
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=categorymembers&gcmtitle=${encodeURIComponent(`Category:${cat}`)}&gcmtype=file&gcmlimit=30&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=800`
  const fromArticle = (a: { lang: string; title: string }) =>
    `https://${a.lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=images&titles=${encodeURIComponent(a.title)}&gimlimit=30&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=800`
  let pages: ImagePage[] = []
  for (const url of [commonsCat && urlFor(commonsCat), article && fromArticle(article)].filter(Boolean) as string[]) {
    const res = await fetch(url)
    if (!res.ok) continue
    pages = Object.values(((await res.json()) as { query?: { pages?: Record<string, ImagePage> } }).query?.pages ?? {}).filter(usablePhoto)
    if (pages.length >= 2) break
  }
  const out = pages.slice(0, 10).map((p) => ({ url: p.imageinfo![0].thumburl!, page: p.imageinfo![0].descriptionurl ?? '' }))
  // Keep the main photo first
  if (info.image && !out.some((g) => g.url.split('/').pop() === info.image!.split('/').pop())) out.unshift({ url: info.image, page: info.imagePage ?? '' })
  return out
}

/* ---------- what to do there ---------- */

const ACTIVITIES: Record<StopKind, string[]> = {
  museum: ['לראות את התערוכות והאוספים הקבועים', 'לבדוק אם יש תערוכה מתחלפת או סיור מודרך', 'לחנות המוזיאון ולבית הקפה, אם יש'],
  heritage: ['לסייר במקום ולהכיר את ההיסטוריה שלו', 'לצלם – בשעות הבוקר או לפני השקיעה האור הכי יפה', 'לחפש סיור מודרך או מדריך קולי'],
  nature: ['טיול רגלי או הליכה נינוחה', 'פיקניק או מנוחה בצל', 'צילום נוף וטבע'],
  beach: ['רחצה בים ושיזוף', 'ספורט מים או הליכה לאורך החוף', 'שקיעה על החוף'],
  view: ['תצפית על העיר והסביבה', 'צילום – בעיקר בשקיעה', 'עצירה קצרה במסלול – לרוב 20–40 דקות מספיקות'],
  market: ['טעימות של אוכל מקומי', 'קניית מזכרות ומוצרים מקומיים', 'להגיע בבוקר, כשהדוכנים מלאים'],
  food: ['ארוחה במסעדה', 'לטעום מנה מקומית מוכרת', 'כדאי להזמין מקום מראש בערבים ובסופי שבוע'],
  shopping: ['קניות בחנויות ובמותגים', 'לחפש מוצרים מקומיים', 'הפסקת קפה בין החנויות'],
}

/** What visitors typically do there: by kind of place, plus hints from the summary */
function activitiesFor(info: PlaceInfo, summary = '') {
  const list = [...ACTIVITIES[info.kind]]
  const t = summary.toLowerCase()
  if (/מגדל|tower|כיפה|dome/.test(t)) list.unshift('לעלות לתצפית מלמעלה, אם הגישה פתוחה')
  if (/גן |garden|פארק|park/.test(t) && info.kind !== 'nature') list.push('להסתובב בגנים שמסביב')
  if (/כנסי|בזיליק|קתדר|church|basilica|cathedral|מנזר|monastery/.test(t)) list.push('לבוש צנוע (כתפיים וברכיים מכוסות) נדרש בדרך כלל')
  return list.slice(0, 4)
}

/* ---------- manual search ---------- */

interface WdEntity {
  id: string
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  sitelinks?: Record<string, { title: string }>
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>
}

const isHebrew = (q: string) => /[֐-׿]/.test(q)

/** Loose match for Hebrew spelling variants: drop a leading ה and the letters often added or left out (י ו א) */
const loose = (t: string) =>
  t
    .toLowerCase()
    .replace(/[()"'״׳,.-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^ה(?=.{3})/, '').replace(/[יוא]/g, ''))
    .join(' ')
    .trim()

/** The name contains the query, or the query contains the whole name ("Da Enzo al 29" → "Da Enzo") */
export const nameMatches = (name: string, q: string) => {
  const n = loose(name)
  const l = loose(q)
  return n.includes(l) || (n.length >= 4 && l.includes(n))
}

/** Wikidata ids for the query: prefix search on names (Hebrew or English) */
async function wikidataIds(q: string, signal?: AbortSignal) {
  const lang = isHebrew(q) ? 'he' : 'en' // match the script the user typed in
  const s = await fetch(`${WD_API}?action=wbsearchentities&format=json&origin=*&language=${lang}&uselang=he&limit=10&search=${encodeURIComponent(q)}`, { signal })
  return ((await s.json()) as { search?: { id: string }[] }).search?.map((x) => x.id) ?? []
}

/** Wikidata ids of Wikipedia articles matching the query near a point (tolerates spelling variants) */
async function wikipediaNearIds(q: string, near: { lat: number; lng: number }, signal?: AbortSignal) {
  const lang = isHebrew(q) ? 'he' : 'en'
  const search = `${q} nearcoord:30km,${near.lat.toFixed(4)},${near.lng.toFixed(4)}`
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=12&gsrsearch=${encodeURIComponent(search)}&prop=pageprops&ppprop=wikibase_item`
  const res = await fetch(url, { signal })
  const pages = Object.values(((await res.json()) as { query?: { pages?: Record<string, { title: string; index?: number; pageprops?: { wikibase_item?: string } }> } }).query?.pages ?? {})
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => p.pageprops?.wikibase_item)
    .map((p) => ({ id: p.pageprops!.wikibase_item!, title: p.title }))
}

async function entitiesToPlaces(ids: string[], signal?: AbortSignal): Promise<PlaceInfo[]> {
  if (!ids.length) return []
  const e = await fetch(
    `${WD_API}?action=wbgetentities&format=json&origin=*&props=labels|descriptions|claims|sitelinks&languages=he|en&sitefilter=hewiki|enwiki&ids=${ids.slice(0, 50).join('|')}`,
    { signal },
  )
  const entities = ((await e.json()) as { entities: Record<string, WdEntity> }).entities
  return ids
    .map((id) => entities[id])
    .filter(Boolean)
    .flatMap((en): PlaceInfo[] => {
      const coord = en.claims?.P625?.[0]?.mainsnak.datavalue?.value as { latitude: number; longitude: number } | undefined
      if (!coord) return [] // only real places
      const name = en.labels?.he?.value ?? en.labels?.en?.value
      if (!name) return []
      const types = (en.claims?.P31 ?? []).map((c) => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id ?? '')
      const image = en.claims?.P18?.[0]?.mainsnak.datavalue?.value as string | undefined
      const he = en.sitelinks?.hewiki?.title
      const enT = en.sitelinks?.enwiki?.title
      return [
        {
          source: 'wikidata',
          ref: en.id,
          name,
          kind: types.map((t) => classToKind.get(t)).find(Boolean) ?? 'heritage',
          lat: coord.latitude,
          lng: coord.longitude,
          description: en.descriptions?.he?.value ?? en.descriptions?.en?.value,
          image: image ? commonsImage(image) : undefined,
          imagePage: image ? commonsPage(image) : undefined,
          article: he ? { lang: 'he', title: he } : enT ? { lang: 'en', title: enT } : undefined,
        },
      ]
    })
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_type: string
    osm_id: number
    osm_key?: string
    osm_value?: string
    name?: string
    street?: string
    housenumber?: string
    city?: string
    country?: string
  }
}

function osmKind(key = '', value = ''): StopKind {
  if (key === 'amenity' && ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'biergarten'].includes(value)) return 'food'
  if (key === 'amenity' && value === 'marketplace') return 'market'
  if (key === 'tourism' && ['museum', 'gallery'].includes(value)) return 'museum'
  if (key === 'tourism' && value === 'viewpoint') return 'view'
  if (key === 'shop') return 'shopping'
  if (key === 'natural' && value === 'beach') return 'beach'
  if (key === 'leisure' || key === 'natural') return 'nature'
  return 'heritage'
}

async function searchPhoton(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<PlaceInfo[]> {
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : ''
  const res = await fetch(`${PHOTON}?limit=8&q=${encodeURIComponent(q)}${bias}`, { signal })
  if (!res.ok) return []
  const data = (await res.json()) as { features: PhotonFeature[] }
  return data.features
    .filter((f) => f.properties.name && f.properties.osm_key !== 'place' && f.properties.osm_key !== 'highway' && f.properties.osm_key !== 'boundary')
    .map((f) => {
      const p = f.properties
      const street = [p.street, p.housenumber].filter(Boolean).join(' ')
      return {
        source: 'osm' as const,
        ref: `${p.osm_type}/${p.osm_id}`,
        name: p.name!,
        kind: osmKind(p.osm_key, p.osm_value),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        address: [street, p.city, p.country].filter(Boolean).join(', ') || undefined,
      }
    })
}

/** Search for a place by name (Hebrew or any language). Name matches near the destination come first. */
export async function searchPlaces(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<PlaceInfo[]> {
  const [nearIds, prefixIds, osm] = await Promise.all([
    near ? wikipediaNearIds(q, near, signal).catch(() => []) : Promise.resolve([]),
    wikidataIds(q, signal).catch(() => [] as string[]),
    searchPhoton(q, near, signal).catch(() => [] as PlaceInfo[]),
  ])
  // Articles whose title loosely matches the query first, then the rest of the nearby hits, then prefix matches
  const ordered = [...nearIds.filter((p) => nameMatches(p.title, q)), ...nearIds.filter((p) => !nameMatches(p.title, q))].map((p) => p.id)
  const ids = [...new Set([...ordered, ...prefixIds])]
  const wd = await entitiesToPlaces(ids, signal).catch(() => [] as PlaceInfo[])
  const all = [...wd, ...osm]
  if (!near) return all.slice(0, 12)
  const km = (p: PlaceInfo) => Math.hypot(p.lat - near.lat, (p.lng - near.lng) * Math.cos((near.lat * Math.PI) / 180)) * 111
  const score = (p: PlaceInfo) => (nameMatches(p.name, q) ? 0 : 1) * 2 + (km(p) < 50 ? 0 : 1)
  // Stable sort keeps the search engines' relevance order within each group
  return all
    .map((p, i) => ({ p, i }))
    .sort((a, b) => score(a.p) - score(b.p) || a.i - b.i)
    .map((x) => x.p)
    .slice(0, 12)
}

/** Google Maps search for a place (its reviews and photos live there) */
export const googleMapsUrl = (p: { name: string; lat: number; lng: number }) =>
  `https://www.google.com/maps/search/${encodeURIComponent(p.name)}/@${p.lat},${p.lng},17z`
