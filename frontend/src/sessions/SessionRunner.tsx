import { useEffect, useId, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, ClipboardCheck, Pause, Play, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Action } from '../workflows/builder-ui'
import { choices } from '../workflows/model'
import type { CaptureField } from '../workflows/model'
import { navigateTo } from '../workspace/navigation'
import { useSessions } from './store'
import { evaluateResponse, responseValue, sessionStages, stageResults } from './model'
import type { WorkSession } from './model'
import SessionRecord from './SessionRecord'
import VoiceControls from './VoiceControls'

function ResponseInput({ session, field, update, attempted }: { session: WorkSession; field: CaptureField; update: (value: string) => void; attempted: boolean }) {
  const id = useId()
  const store = useSessions()
  const [value, setValue] = useState(session.drafts[field.id] || '')
  useEffect(() => { if (!store.busy) setValue(session.drafts[field.id] || '') }, [session.drafts[field.id], store.busy])
  const change = (next: string) => { setValue(next); update(next) }
  const result = evaluateResponse(field, value)
  const error = attempted && result.kind === 'blocked' ? result.message : undefined
  const props = { id, value, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined }
  return <div className="wb-field sr-response-input">
    {field.type === 'confirmation' ? <label className="wb-check"><input type="checkbox" checked={value === 'confirmed'} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => change(event.target.checked ? 'confirmed' : '')} /><span>{field.name}{field.required && <small>Required</small>}</span></label> : <><label htmlFor={id}>{field.name}{field.type === 'number' && field.unit ? ` (${field.unit})` : ''}<span>{field.required ? 'Required' : 'Optional'}</span></label>{field.type === 'choice' ? <select {...props} onChange={event => change(event.target.value)}><option value="">Choose a response</option>{choices(field).map(choice => <option key={choice}>{choice}</option>)}</select> : <input {...props} type={field.type === 'number' ? 'number' : 'text'} step="any" placeholder={field.type === 'number' ? 'Enter a measurement' : 'Type your response'} onChange={event => change(event.target.value)} />}</>}
    {error && <p id={`${id}-error`} className="wb-field-error">{error}</p>}
    {field.type === 'number' && field.handling !== 'record' && <p className="sr-limit-hint"><ShieldCheck size={13} />{field.min !== '' && field.max !== '' ? `Acceptable range: ${field.min}–${field.max}` : field.min !== '' ? `Minimum: ${field.min}` : `Maximum: ${field.max}`} {field.unit} · {field.handling === 'flag' ? 'Flag outside range' : 'Resolve outside range'}</p>}
    {value && session.sources[field.id] === 'bolna' && <span className="sr-source-note">Voice response</span>}
  </div>
}

export default function SessionRunner({ session }: { session: WorkSession }) {
  const store = useSessions()
  const [outlineOpen, setOutlineOpen] = useState(() => !matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)')
    const resize = () => setOutlineOpen(!media.matches)
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])
  const dispatch = (action: Parameters<typeof store.dispatch>[1]) => store.dispatch(session.id, action)
  const stages = sessionStages(session)
  const stage = stages[session.position]
  const firstIncomplete = stages.findIndex(item => !session.completedSteps.includes(item.id))
  const lastReachable = firstIncomplete < 0 ? stages.length : firstIncomplete
  const attempted = stage ? session.attemptedSteps.includes(stage.id) : false
  const results = stage ? stageResults(session, stage) : []
  const stepComplete = stage ? session.completedSteps.includes(stage.id) : false
  const flags = results.filter(item => item.result.kind === 'flagged').length
  useEffect(() => {
    requestAnimationFrame(() => document.getElementById(session.status === 'completed' || !stage ? 'record-title' : 'current-step-title')?.focus())
  }, [session.position, session.status])
  if (session.status === 'completed') return <SessionRecord session={session} dispatch={dispatch} />
  return <>
    <div className="sr-session-heading"><div><a href="/sessions" className="wb-back-link"><ArrowLeft size={14} />All sessions</a><div className="sr-session-title"><h1>{session.label}</h1><span className={`sr-status ${session.status === 'paused' ? 'is-paused' : ''}`}>{session.status === 'paused' ? <Pause size={12} /> : <Play size={12} />}{session.status === 'paused' ? 'Paused' : 'In progress'}</span></div><p>{session.workflow.title} <span>·</span> Version {session.workflow.version}</p></div>{session.status === 'active' && <Action onClick={async () => { if (await dispatch({ type: 'pause' })) navigateTo('/sessions') }}><Pause size={15} />Pause & leave</Action>}</div>
    {session.status === 'active' && <VoiceControls session={session} />}
    {session.status === 'paused' ? <section className="sr-paused"><span className="sr-record-icon"><Pause size={24} /></span><h2>Session paused</h2><p>{stage ? `Next: ${stage.title}` : 'Ready for review'}</p><Action primary onClick={() => dispatch({ type: 'resume' })}><Play size={15} />Resume session</Action></section> : !stage ? <SessionRecord session={session} dispatch={dispatch} /> : <div className="sr-run-layout">
      <aside className="sr-step-outline" aria-label="Session progress"><div className="sr-outline-heading"><strong>Steps</strong><span>{session.completedSteps.length} / {stages.length}</span></div><div className="sr-progress" role="progressbar" aria-label="Completed steps" aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={session.completedSteps.length}><span style={{ width: `${session.completedSteps.length / stages.length * 100}%` }} /></div><details className="sr-outline-details" open={outlineOpen} onToggle={event => setOutlineOpen(event.currentTarget.open)}><summary>View all {stages.length} steps<ChevronDown size={15} /></summary><ol>{stages.map((item, index) => <li key={item.id}><button type="button" disabled={index > lastReachable} aria-current={index === session.position ? 'step' : undefined} onClick={() => dispatch({ type: 'go', position: index })}><span className={session.completedSteps.includes(item.id) ? 'is-complete' : ''}>{session.completedSteps.includes(item.id) ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><span>{item.title}</span>{index === session.position && <ChevronRight size={14} />}</button></li>)}</ol>{firstIncomplete < 0 && <button type="button" className="wb-text-button sr-review-link" onClick={() => dispatch({ type: 'go', position: stages.length })}><ClipboardCheck size={14} />Review record</button>}</details></aside>
      <section className="sr-stage" aria-labelledby="current-step-title"><div className="sr-stage-topline"><span className="wb-eyebrow">STEP {String(session.position + 1).padStart(2, '0')} OF {String(stages.length).padStart(2, '0')}</span>{stepComplete && <span className="sr-stage-complete"><Check size={13} />Recorded</span>}</div><h2 id="current-step-title" tabIndex={-1}>{stage.title}</h2>
        <div className="sr-instruction"><span className="sr-lattice-avatar">L<span>.</span></span><div><span className="wb-eyebrow">LATTICE</span><p>{stage.instructions || stage.title}</p>{stage.fields.length === 1 && stage.fields[0].type === 'number' && <p className="sr-instruction-prompt">What is the {stage.fields[0].name.toLowerCase()}?</p>}</div></div>
        {session.workflow.reference && <details className="sr-procedure"><summary><BookOpen size={14} />Procedure reference</summary><p>{session.workflow.reference}</p></details>}

        <form noValidate onSubmit={event => { event.preventDefault(); dispatch({ type: 'record' }) }}>
          {stage.fields.length > 0 && <div className="sr-capture-heading"><h3>Responses</h3></div>}
          {stage.fields.map(field => <ResponseInput key={field.id} field={field} session={session} attempted={attempted} update={value => dispatch({ type: 'draft', fieldId: field.id, value, source: 'typed' })} />)}
          {attempted && <div className={`sr-acknowledgement ${!stepComplete || flags ? 'has-warning' : ''}`} role="status">{stepComplete && !flags ? <Check size={18} /> : <TriangleAlert size={18} />}<div><strong>{!stepComplete ? results.some(item => item.value.trim()) ? 'Resolve the highlighted responses before continuing.' : 'Add the required responses before continuing.' : flags ? `Recorded with ${flags} ${flags === 1 ? 'deviation' : 'deviations'}. You can continue.` : stage.fields.length ? 'Responses recorded.' : 'Step confirmed.'}</strong>{results.map(({ field, value, result }) => <p key={field.id}><span>{field.name}: {responseValue(field, value)}</span><small>{result.kind === 'blocked' || result.kind === 'flagged' ? result.message : field.type === 'number' && field.handling !== 'record' && value ? 'Within configured range.' : value ? 'Recorded.' : 'Optional response not provided.'}</small></p>)}</div></div>}
          <div className="sr-stage-actions">{session.position > 0 && <Action onClick={event => { event.preventDefault(); dispatch({ type: 'go', position: session.position - 1 }) }}><ArrowLeft size={15} />Previous</Action>}{!stepComplete ? <Action type="submit" primary>{stage.fields.length ? 'Record responses' : 'Confirm step'}<Check size={15} /></Action> : <Action primary onClick={event => { event.preventDefault(); dispatch({ type: 'next' }); requestAnimationFrame(() => document.getElementById('current-step-title')?.focus()) }}>{session.position === stages.length - 1 ? 'Review record' : 'Next step'}<ArrowRight size={15} /></Action>}</div>
        </form>
      </section>
    </div>}
  </>
}
