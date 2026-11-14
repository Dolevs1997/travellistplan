import { useSyncExternalStore } from 'react'

const read = () => window.location.hash.replace(/^#/, '') || '/'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export const useRoute = () => useSyncExternalStore(subscribe, read)

export const navigate = (path: string) => {
  window.location.hash = path
}

export const href = (path: string) => `#${path}`

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
