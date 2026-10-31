import { useSyncExternalStore } from 'react'

const navigationEvent = 'lattice:navigate'

export function navigateTo(path: string) {
  if (location.pathname + location.search !== path) history.pushState({}, '', path)
  window.dispatchEvent(new Event(navigationEvent))
  window.scrollTo({ top: 0, behavior: 'instant' })
}

export function useLocation() {
  return useSyncExternalStore(listener => {
    window.addEventListener('popstate', listener)
    window.addEventListener(navigationEvent, listener)
    return () => {
      window.removeEventListener('popstate', listener)
      window.removeEventListener(navigationEvent, listener)
    }
  }, () => location.pathname + location.search)
}
