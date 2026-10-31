import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { useLocation } from './navigation'

export default function WorkspaceHeader({ active, crumb }: { active: 'workflows' | 'sessions'; crumb?: string }) {
  const path = useLocation()
  useEffect(() => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true }))
  }, [path])
  return <header className="wb-topbar">
    <a href="/" aria-label="Lattice home"><span className="brand brand-small"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m20 4 14 8v16l-14 8-14-8V12ZM6 12l14 8 14-8M20 20v16M20 4v16M6 28l14-8 14 8" stroke="currentColor" strokeWidth="1.6" /></svg>Lattice<span className="brand-dot">.</span></span></a>
    <span className="wb-top-divider" />
    <nav className="sr-workspace-nav" aria-label="Workspace"><a href="/workflows" aria-current={active === 'workflows' ? 'page' : undefined}>Workflows</a><a href="/sessions" aria-current={active === 'sessions' ? 'page' : undefined}>Sessions</a></nav>
    {crumb && <><ChevronRight className="sr-crumb-chevron" size={14} /><span className="wb-crumb-name">{crumb}</span></>}
  </header>
}
