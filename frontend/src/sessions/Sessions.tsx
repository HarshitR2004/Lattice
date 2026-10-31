import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCheck, ClipboardCheck, Clock3, ListChecks, Play, Plus, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Action, Input } from '../workflows/builder-ui'
import { useWorkflows } from '../workflows/store'
import { useSessions } from './store'
import { navigateTo, useLocation } from '../workspace/navigation'
import WorkspaceHeader from '../workspace/WorkspaceHeader'
import { canStart, sessionStages } from './model'
import type { WorkSession } from './model'
import SessionRunner from './SessionRunner'
import { formatTime } from './SessionRecord'
import './sessions.css'

function SessionList() {
  const { sessions, dispatch } = useSessions()
  const [filter, setFilter] = useState<'all' | WorkSession['status']>('all')
  const visible = sessions.filter(session => filter === 'all' || session.status === filter)
  return <>
    <div className="sr-page-heading"><div><h1>Sessions</h1></div><a href="/sessions/new" className="wb-action wb-primary"><Plus size={16} />Start a session</a></div>
    <p className="sr-retention-inline">Progress is saved to your workspace.</p>
    {sessions.length > 0 && <div className="sr-session-filters" role="group" aria-label="Filter sessions">{([{ id: 'all', label: 'All sessions' }, { id: 'active', label: 'In progress' }, { id: 'paused', label: 'Paused' }, { id: 'completed', label: 'Completed' }] as const).map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{sessions.filter(session => item.id === 'all' || session.status === item.id).length}</span></button>)}</div>}
    {!sessions.length ? <section className="sr-empty"><span className="sr-empty-icon"><ClipboardCheck size={29} /></span><h2>No sessions</h2><a href="/sessions/new" className="wb-action wb-primary">Choose a ready workflow<ArrowRight size={16} /></a></section> : !visible.length ? <section className="sr-empty sr-empty-filter"><h2>No {filter === 'active' ? 'in-progress' : filter} sessions.</h2><Action onClick={() => setFilter('all')}>Show all sessions</Action></section> : <div className="sr-session-list">{visible.map(session => {
      const total = sessionStages(session).length
      return <article key={session.id}><div className={`sr-session-symbol ${session.status === 'completed' ? 'is-completed' : ''}`}>{session.status === 'completed' ? <CheckCheck size={21} /> : session.status === 'paused' ? <Clock3 size={21} /> : <Play size={20} />}</div><div className="sr-session-list-copy"><h2>{session.label}</h2><p>{session.workflow.title} · v{session.workflow.version}</p><small>{session.status === 'completed' ? `Completed ${formatTime(session.completedAt!)} · Human review pending` : `${session.completedSteps.length} of ${total} steps recorded · Started ${formatTime(session.createdAt)}`}</small></div><div className="sr-session-list-actions"><span className={`sr-status ${session.status === 'completed' ? 'is-completed' : session.status === 'paused' ? 'is-paused' : ''}`}>{session.status === 'completed' ? 'Completed' : session.status === 'paused' ? 'Paused' : 'In progress'}</span><Action onClick={async () => { if (session.status === 'paused' && !await dispatch(session.id, { type: 'resume' })) return; navigateTo(`/sessions/${session.id}`) }}>{session.status === 'completed' ? 'View record' : session.status === 'paused' ? 'Resume' : 'Continue'}<ArrowRight size={14} /></Action></div></article>
    })}</div>}
  </>
}

function StartSession({ workflowId }: { workflowId: string | null }) {
  const { start } = useSessions()
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const workflowStore = useWorkflows()
  const loaded = { items: workflowStore.items, error: workflowStore.error }
  const workflow = loaded.items.find(item => item.id === workflowId)
  const ready = loaded.items.filter(canStart)
  if (!workflow || !canStart(workflow)) return <>
    <a href="/sessions" className="wb-back-link"><ArrowLeft size={14} />All sessions</a><div className="sr-page-heading"><div><h1>Select workflow</h1></div></div>
    {loaded.error && <p className="sr-error" role="alert"><TriangleAlert size={16} />{loaded.error}</p>}
    {workflowId && <p className="sr-error" role="alert"><TriangleAlert size={16} />Workflow unavailable or in draft. Mark it ready to start.</p>}
    {ready.length ? <div className="sr-ready-workflows">{ready.map(item => <a key={item.id} href={`/sessions/new?workflow=${encodeURIComponent(item.id)}`}><span className="sr-session-symbol"><ListChecks size={22} /></span><span><strong>{item.published!.title}</strong><small>Version {item.published!.version} · {item.published!.steps.length} steps{item.published!.setup.length ? ' · Starting information' : ''}</small></span><ArrowRight size={17} /></a>)}</div> : <section className="sr-empty"><span className="sr-empty-icon"><ListChecks size={28} /></span><h2>No ready workflows</h2><p>Mark a workflow ready to start a session.</p><a className="wb-action wb-primary" href="/workflows">Go to workflows<ArrowRight size={15} /></a></section>}
  </>
  const snapshot = workflow.published!
  return <div className="sr-start-session"><a href="/sessions/new" className="wb-back-link"><ArrowLeft size={14} />Choose another workflow</a><h1>Start session</h1><section className="sr-start-workflow"><div className="sr-start-workflow-heading"><span className="sr-session-symbol"><ListChecks size={23} /></span><div><h2>{snapshot.title}</h2><span className="wb-badge wb-ready">Ready · v{snapshot.version}</span></div></div>{snapshot.description && <p>{snapshot.description}</p>}<ol>{snapshot.setup.length > 0 && <li><span><ShieldCheck size={13} /></span>Before starting</li>}{snapshot.steps.map((step, index) => <li key={step.id}><span>{String(index + 1).padStart(2, '0')}</span>{step.title}</li>)}</ol>{snapshot.reference && <p className="sr-start-reference">Procedure reference: {snapshot.reference}</p>}</section><form noValidate onSubmit={async event => {
    event.preventDefault()
    const latest = workflowStore.items.find(item => item.id === workflow.id)
    if (!latest || !canStart(latest)) { setError('This workflow has changed. Mark it ready again before starting a session.'); return }
    try { const id = await start(latest, label); navigateTo(`/sessions/${id}`) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'This session could not be started. Try again.') }
  }}><Input label="Session label (optional)" value={label} onChange={setLabel} placeholder="e.g. Component CMP-014" />{error && <p className="sr-error" role="alert"><TriangleAlert size={16} />{error}</p>}<div className="sr-start-action"><Action primary type="submit">Start work session<ArrowRight size={16} /></Action></div></form><p className="sr-retention-note">Progress is saved to your workspace.</p></div>
}

export default function Sessions() {
  const route = useLocation()
  const sessionStore = useSessions()
  const { sessions } = sessionStore
  const workflows = useWorkflows()
  const id = route.split('?')[0].split('/')[2]
  const session = sessions.find(item => item.id === id)
  useEffect(() => { document.title = session ? `${session.label} — Lattice session` : id === 'new' ? 'Start a session — Lattice' : 'Your sessions — Lattice' }, [session?.label, id])
  if (sessionStore.loading || workflows.loading) return <main className="wb-app wb-loading"><p role="status">Loading sessions...</p></main>
  return <div className="wb-app sr-app">{sessionStore.busy && <p className="sr-retention-inline" role="status" style={{ padding: "8px 24px" }}>Saving changes...</p>}{sessionStore.error && <div className="wb-storage-error" role="alert">{sessionStore.error}<Action onClick={() => { void sessionStore.refresh() }}>Reload saved sessions</Action></div>}<a className="skip-link" href="#session-main">Skip to session</a><WorkspaceHeader active="sessions" crumb={id === 'new' ? 'New session' : session?.label} /><main id="session-main" className={`wb-main sr-main ${session && session.status !== 'completed' ? 'sr-main-runner' : ''}`} tabIndex={-1}>{id === 'new' ? <StartSession key={new URLSearchParams(route.split('?')[1]).get('workflow') || 'choose'} workflowId={new URLSearchParams(route.split('?')[1]).get('workflow')} /> : session ? <SessionRunner key={session.id} session={session} /> : id ? <section className="sr-empty"><span className="sr-empty-icon"><Clock3 size={28} /></span><h1>Session not found</h1><p>Progress is saved to your workspace.</p><a className="wb-action wb-primary" href="/sessions">Back to sessions<ArrowRight size={15} /></a></section> : <SessionList />}</main></div>
}
