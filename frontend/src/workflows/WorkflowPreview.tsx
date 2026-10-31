import { useId, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCheck, MessageSquareText, RotateCcw, TriangleAlert } from 'lucide-react'
import { Action, Modal } from './builder-ui'
import { choices, evaluate, fieldIssues } from './model'
import type { CaptureField, WorkStep, Workflow } from './model'

function RecordInput({ field, value, onChange, submitted }: { field: CaptureField; value: string; onChange: (value: string) => void; submitted: boolean }) {
  const id = useId()
  const result = evaluate(field, value)
  const error = submitted && result.kind === 'blocked' ? result.message : undefined
  if (field.type === 'confirmation') return <div className="wb-field"><label className="wb-check"><input type="checkbox" checked={value === 'confirmed'} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange(event.target.checked ? 'confirmed' : '')} />{field.name || 'Confirm this step'}{field.required ? ' (required)' : ''}</label>{error && <p className="wb-field-error" id={`${id}-error`}>{error}</p>}</div>
  const props = { id, value, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(event.target.value) }
  return <div className="wb-field"><label htmlFor={id}>{field.name || 'Untitled response'}{field.type === 'number' && field.unit ? ` (${field.unit})` : ''}{field.required ? ' (required)' : ''}</label>{field.type === 'choice' ? <select {...props}><option value="">Choose a response</option>{choices(field).map(choice => <option key={choice}>{choice}</option>)}</select> : <input {...props} type={field.type === 'number' ? 'number' : 'text'} step="any" placeholder={field.type === 'number' ? 'Enter a measurement' : 'Type a response'} />}{error && <p className="wb-field-error" id={`${id}-error`}>{error}</p>}</div>
}

export default function WorkflowPreview({ workflow, stepId, close, editStep, tryFull, review }: { workflow: Workflow; stepId?: string; close: () => void; editStep: (id: string) => void; tryFull: () => void; review: () => void }) {
  const allStages: WorkStep[] = [...(workflow.setup.length ? [{ id: 'setup', title: 'Before starting', instructions: 'Identify the work before you begin.', fields: workflow.setup }] : []), ...workflow.steps]
  const stages = stepId ? allStages.filter(step => step.id === stepId) : allStages
  const [position, setPosition] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [finished, setFinished] = useState(false)
  const step = stages[position]
  const results = step?.fields.map(field => ({ field, result: evaluate(field, values[field.id] || '') })) || []
  const blocked = results.some(item => item.result.kind === 'blocked')
  const configIssues = step?.fields.flatMap(field => Object.values(fieldIssues(field))) || []
  function reset() { setPosition(0); setValues({}); setSubmitted(false); setFinished(false) }
  return <Modal title={stepId ? 'Step preview' : 'Workflow preview'} close={close}>
    <div className="wb-preview-content">
      <p className="wb-simulation-note"><MessageSquareText size={15} />Text preview · not recorded</p>
      {finished ? <div className="wb-test-finished"><span className="wb-completion-icon"><CheckCheck size={26} /></span><h3>Preview complete</h3><div className="wb-result-list">{stages.flatMap(stage => stage.fields).map(field => {
        const result = evaluate(field, values[field.id] || '')
        return <div key={field.id}><span>{field.name}</span><strong>{values[field.id] || 'Not provided'}{values[field.id] && field.type === 'number' ? ` ${field.unit}` : ''}</strong><small className={result.kind === 'flagged' ? 'wb-amber' : ''}>{result.kind === 'flagged' ? 'Flagged for review' : field.type === 'number' && field.handling !== 'record' && values[field.id] ? 'Within configured range' : 'Recorded in simulation'}</small></div>
      })}</div><div className="wb-modal-actions"><Action onClick={reset}><RotateCcw size={15} />Try again</Action><Action primary onClick={review}>Review workflow<ArrowRight size={15} /></Action></div></div> : step ? <>
        {!stepId && <><div className="wb-preview-progress" aria-label={`Step ${position + 1} of ${stages.length}`}>{stages.map((stage, index) => <span key={stage.id} className={index <= position ? 'is-current' : ''} />)}</div><p className="wb-eyebrow">{position + 1} / {stages.length}</p></>}
        <h3>{step.title || 'Untitled step'}</h3>
        <div className="wb-chat-message"><span className="wb-chat-avatar">L<span>.</span></span><div><span className="wb-eyebrow">Lattice</span><p>{step.instructions || step.title || 'Follow the instruction, then confirm when you’re done.'}</p>{step.fields.length > 0 && <p className="wb-chat-prompt">{step.fields.length === 1 ? step.fields[0].type === 'number' ? `What is the ${step.fields[0].name.toLowerCase() || 'measurement'}?` : step.fields[0].type === 'confirmation' ? `Please confirm: ${step.fields[0].name || 'this step is complete'}.` : `Please record ${step.fields[0].name.toLowerCase() || 'your response'}.` : 'Please provide the following responses.'}</p>}</div></div>
        {configIssues.length > 0 && <div className="wb-inline-warning"><TriangleAlert size={17} /><div><strong>Complete the response settings.</strong><ul>{configIssues.map((message, index) => <li key={index}>{message}</li>)}</ul><button type="button" className="wb-text-button" onClick={() => editStep(step.id)}>Edit this step<ArrowRight size={14} /></button></div></div>}
        {step.fields.map(field => <RecordInput key={field.id} field={field} value={values[field.id] || ''} submitted={submitted} onChange={value => { setValues(previous => ({ ...previous, [field.id]: value })); setSubmitted(false) }} />)}
        {submitted && <div className={`wb-feedback ${blocked ? 'has-warning' : ''}`} role="status">{results.map(({ field, result }) => <div key={field.id} className={result.kind !== 'recorded' ? 'wb-amber' : ''}>{result.kind === 'recorded' ? <Check size={16} /> : <TriangleAlert size={16} />}<span><strong>{field.name}: {values[field.id] || 'Not provided'}{values[field.id] && field.type === 'number' ? ` ${field.unit}` : ''}</strong><small>{result.kind === 'recorded' && field.type === 'number' && field.handling !== 'record' && values[field.id] ? 'Recorded · Within configured range' : result.message}</small></span></div>)}{!step.fields.length && <div><CheckCheck size={17} /><span>Step confirmed in simulation.</span></div>}</div>}
        <div className="wb-modal-actions">
          {!stepId && position > 0 && <Action onClick={() => { setPosition(value => value - 1); setSubmitted(false) }}><ArrowLeft size={15} />Back</Action>}
          <Action primary disabled={configIssues.length > 0} onClick={() => {
            if (!submitted || blocked || stepId) { setSubmitted(true); return }
            if (position === stages.length - 1) setFinished(true)
            else { setPosition(value => value + 1); setSubmitted(false) }
          }}>{stepId && submitted && !blocked ? 'Test again' : !submitted || blocked ? step.fields.length ? 'Record response' : 'Confirm step' : position === stages.length - 1 ? 'See test record' : 'Next step'}<ArrowRight size={15} /></Action>
        </div>
        <div className="wb-preview-links"><button type="button" className="wb-text-button" onClick={() => editStep(step.id)}>Edit this step</button>{stepId && <button type="button" className="wb-text-button" onClick={tryFull}>Try the full workflow<ArrowRight size={14} /></button>}</div>
      </> : <div className="wb-empty"><h3>No steps to preview</h3></div>}
    </div>
  </Modal>
}
