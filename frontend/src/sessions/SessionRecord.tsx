import { ArrowLeft, ArrowRight, Check, CheckCheck, Download, History, PencilLine, TriangleAlert } from 'lucide-react'
import { Action } from '../workflows/builder-ui'
import { download } from '../api/client'
import { useState } from 'react'
import type { CaptureField } from '../workflows/model'
import { responseValue, sessionStages } from './model'
import type { SessionAction, WorkSession } from './model'

export function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function Result({ session, field }: { session: WorkSession; field: CaptureField }) {
  const response = session.responses[field.id]
  const flagged = response?.kind === 'flagged'
  return <div className="sr-record-response"><div><dt>{field.name}</dt><dd>{responseValue(field, response?.value || '')}</dd><small>{response?.value ? response.source === 'bolna' ? 'Voice response' : 'Typed response' : 'Optional response not provided'}{response ? ` · ${formatTime(response.at)}` : ''}</small></div><span className={`sr-result-label ${flagged ? 'is-flagged' : ''}`}>{flagged ? <TriangleAlert size={13} /> : <Check size={13} />}{flagged ? 'Flagged for review' : !response?.value ? 'Not provided' : field.type === 'number' && field.handling !== 'record' ? 'Within range' : 'Recorded'}</span>{response && response.history.length > 0 && <details className="sr-history"><summary><History size={13} />{response.history.length} previous {response.history.length === 1 ? 'response' : 'responses'}</summary><ol>{response.history.map((revision, index) => <li key={index}><span>{responseValue(field, revision.value)}{revision.kind === 'blocked' ? ' · Needed resolution' : revision.kind === 'flagged' ? ' · Flagged' : ''}</span><small>{formatTime(revision.at)} · {revision.source === 'bolna' ? 'Voice response' : 'Typed'}</small></li>)}</ol></details>}</div>
}

export default function SessionRecord({ session, dispatch }: { session: WorkSession; dispatch: (action: SessionAction) => void }) {
  const [exportError, setExportError] = useState('')
  const completed = session.status === 'completed'
  const stages = sessionStages(session)
  const flags = Object.values(session.responses).filter(response => response.kind === 'flagged').length
  const Heading = completed ? 'h1' : 'h2'
  const StepHeading = completed ? 'h2' : 'h3'
  async function exportRecord() {
    try { await download(`/sessions/${session.id}/export`, `lattice-session-${session.id}.json`); setExportError('') }
    catch (e) { setExportError((e as Error).message) }
  }
  return <section className="sr-record" aria-labelledby="record-title">
    <div className="sr-record-intro"><span className="sr-record-icon"><CheckCheck size={25} /></span><Heading id="record-title" tabIndex={-1}>{completed ? 'Session record' : 'Review session'}</Heading>{completed && <p>Awaiting human review</p>}</div>
    <div className="sr-record-meta"><div><span>Session</span><strong>{session.label}</strong></div><div><span>Workflow</span><strong>{session.workflow.title} · v{session.workflow.version}</strong></div><div><span>Started</span><strong>{formatTime(session.createdAt)}</strong></div>{session.completedAt && <div><span>Completed</span><strong>{formatTime(session.completedAt)}</strong></div>}</div>
    {flags > 0 && <div className="sr-record-notice has-flags"><TriangleAlert size={18} /><strong>{flags} {flags === 1 ? 'deviation' : 'deviations'} flagged for review</strong></div>}
    {session.workflow.reference && <p className="sr-record-reference">Procedure reference: {session.workflow.reference}</p>}
    <ol className="sr-record-steps">{stages.map((stage, index) => <li key={stage.id}><div className="sr-record-step-heading"><span>{String(index + 1).padStart(2, '0')}</span><StepHeading>{stage.title}</StepHeading>{!completed && <button type="button" className="wb-text-button" onClick={() => dispatch({ type: 'go', position: index })} aria-label={`Edit ${stage.title}`}><PencilLine size={13} />Edit</button>}</div>{stage.instructions && <p className="sr-record-instruction">{stage.instructions}</p>}{stage.fields.length ? <dl>{stage.fields.map(field => <Result key={field.id} field={field} session={session} />)}</dl> : <p className="sr-instruction-confirmed"><Check size={14} />Instruction confirmed.</p>}</li>)}</ol>
    <div className="sr-record-footer">{completed ? <><a href="/sessions" className="wb-action"><ArrowLeft size={15} />All sessions</a><Action primary onClick={() => { void exportRecord() }}><Download size={15} />Export record</Action></> : <><Action onClick={() => dispatch({ type: 'go', position: stages.length - 1 })}><ArrowLeft size={15} />Back to last step</Action><Action primary onClick={() => dispatch({ type: 'finish' })}>Finish session<ArrowRight size={15} /></Action></>}</div>
    <p className="sr-retention-note">{exportError || (completed ? 'Record saved. Export a copy for sharing.' : 'Your inspection progress is saved.')}</p>
  </section>
}
