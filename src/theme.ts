import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'trip-planner:theme'
const EVENT = 'trip-planner:theme'

/** Light is the default; dark is opt-in from Profile */
export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0E13' : '#F4F6F9')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

export const useTheme = () => useSyncExternalStore(subscribe, getTheme)

/** Read a color token (CSS custom property) for libraries like MapLibre that can't use CSS */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Base map that matches the theme (CARTO, no key needed) */
export const mapStyleUrl = (theme: Theme) =>
  theme === 'dark'
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

/** Map colors for the current theme, from the CSS tokens */
export const mapColors = () => ({
  bg: cssVar('--map-bg'),
  water: cssVar('--map-water'),
  park: cssVar('--map-park'),
  building: cssVar('--map-building'),
  boundary: cssVar('--map-boundary'),
  label: cssVar('--map-label'),
  accent: cssVar('--color-accent'),
  accent2: cssVar('--color-accent-2'),
  pinStroke: cssVar('--color-bg'),
  onAccent: cssVar('--color-on-accent'),
})
