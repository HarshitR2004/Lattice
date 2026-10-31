import { lazy, Suspense, useEffect } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { SessionsProvider } from '../sessions/store'
import { WorkflowsProvider } from '../workflows/store'
import { navigateTo, useLocation } from './navigation'
import '../sessions/sessions.css'

const App = lazy(() => import('../App'))
const WorkflowBuilder = lazy(() => import('../workflows/WorkflowBuilder'))
const Sessions = lazy(() => import('../sessions/Sessions'))

function ClientLinks({ children }: { children: ReactNode }) {
  function follow(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element).closest('a')
    if (!anchor || anchor.hasAttribute('download') || anchor.target || anchor.getAttribute('href')?.startsWith('#')) return
    const url = new URL(anchor.href)
    if (url.origin !== location.origin || !(url.pathname === '/' || /^\/(workflows|sessions)(\/|$)/.test(url.pathname))) return
    event.preventDefault()
    navigateTo(url.pathname + url.search + url.hash)
  }
  return <div onClick={follow}>{children}</div>
}

export default function Workspace() {
  const path = useLocation()
  useEffect(() => {
    if (!path.startsWith('/workflows') && !path.startsWith('/sessions')) document.title = 'Lattice — The voice copilot for the physical world'
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true }))
  }, [path])
  return <WorkflowsProvider><SessionsProvider><ClientLinks><Suspense fallback={<main className="wb-app wb-loading" tabIndex={-1}><p role="status">Opening Lattice…</p></main>}>{path.startsWith('/sessions') ? <Sessions /> : path.startsWith('/workflows') ? <WorkflowBuilder /> : <App />}</Suspense></ClientLinks></SessionsProvider></WorkflowsProvider>
}
