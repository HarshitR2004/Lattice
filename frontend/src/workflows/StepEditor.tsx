import { Check, CircleCheck, ListFilter, MessageSquareText, Plus, Ruler, ShieldCheck, Trash2 } from 'lucide-react'
import { Action, Input } from './builder-ui'
import { fieldIssues, newField } from './model'
import type { CaptureField, FieldType, WorkStep } from './model'

const responseTypes = [
  { type: 'number', label: 'A measurement', short: 'Measurement', icon: Ruler },
  { type: 'text', label: 'An observation', short: 'Observation', icon: MessageSquareText },
  { type: 'choice', label: 'A choice', short: 'Choice', icon: ListFilter },
  { type: 'confirmation', label: 'Confirmation', short: 'Confirmation', icon: CircleCheck },
] as const

export function fieldSummary(field: CaptureField) {
  const parts = [field.name || responseTypes.find(item => item.type === field.type)!.short]
  if (field.type === 'number' && field.unit) parts.push(field.unit)
  parts.push(field.required ? 'Required' : 'Optional')
  if (field.type === 'number' && field.handling !== 'record') {
    parts.push(field.min && field.max ? `${field.min}–${field.max} ${field.unit}` : field.min ? `At least ${field.min} ${field.unit}` : field.max ? `Up to ${field.max} ${field.unit}` : 'Limits need attention')
    parts.push(field.handling === 'flag' ? 'Flag outside range' : 'Resolve outside range')
  }
  return parts.join(' · ')
}

export function ResponsePicker({ add }: { add: (type: FieldType) => void }) {
  return <div className="wb-response-picker" role="group" aria-label="Add a response">{responseTypes.map(({ type, label, icon: Icon }) => <button type="button" key={type} onClick={() => add(type)}><Icon size={17} /><span>{label}</span><Plus size={13} /></button>)}</div>
}

function FieldEditor({ field, update, remove, showErrors }: { field: CaptureField; update: (patch: Partial<CaptureField>) => void; remove: () => void; showErrors: boolean }) {
  const type = responseTypes.find(item => item.type === field.type)!
  const errors = fieldIssues(field)
  const inputProps = { validateOnBlur: !showErrors }
  const exampleLimit = field.max !== '' ? `above ${field.max}` : `below ${field.min}`
  return <section className="wb-response" aria-label={`${type.short}: ${field.name || 'New response'}`}>
    <div className="wb-response-heading"><span><type.icon size={16} />{type.short}</span><button type="button" className="wb-icon-button" onClick={remove} aria-label={`Remove ${field.name || type.short.toLowerCase()}`}><Trash2 size={16} /></button></div>
    <div className={field.type === 'number' ? 'wb-measurement-fields' : ''}>
      <Input {...inputProps} id={`${field.id}-name`} label={field.type === 'confirmation' ? 'What should they confirm?' : field.type === 'number' ? 'What are they measuring?' : field.type === 'choice' ? 'What are they choosing?' : 'What should they record?'} value={field.name} onChange={name => update({ name })} error={errors.name} placeholder={field.type === 'number' ? 'e.g. Diameter' : field.type === 'confirmation' ? 'e.g. Equipment is switched off' : field.type === 'choice' ? 'e.g. Component condition' : 'e.g. Surface observations'} />
      {field.type === 'number' && <Input {...inputProps} id={`${field.id}-unit`} label="Unit" value={field.unit} onChange={unit => update({ unit })} error={errors.unit} placeholder="e.g. mm" />}
    </div>
    {field.type === 'choice' && <Input {...inputProps} id={`${field.id}-options`} label="Available choices" multiline value={field.options} onChange={options => update({ options })} error={errors.options} hint="One choice per line." placeholder={'No visible damage\nDamage found'} />}
    <label className="wb-check"><input type="checkbox" checked={field.required} onChange={event => update({ required: event.target.checked })} />Required before continuing</label>
    {field.type === 'number' && <div className="wb-limits">
      <label className="wb-check"><input type="checkbox" checked={field.handling !== 'record'} onChange={event => update({ handling: event.target.checked ? 'flag' : 'record' })} /><ShieldCheck size={15} />Add acceptable limits</label>
      {field.handling !== 'record' && <div className="wb-limit-settings">
        <p className="wb-hint">Leave either limit blank for an open range.</p>
        <div className="wb-two-col"><Input {...inputProps} id={`${field.id}-min`} label="Minimum" type="number" value={field.min} onChange={min => update({ min })} error={errors.min} placeholder="No minimum" /><Input {...inputProps} id={`${field.id}-max`} label="Maximum" type="number" value={field.max} onChange={max => update({ max })} error={errors.max} placeholder="No maximum" /></div>
        <fieldset className="wb-handling"><legend>If a measurement is outside the range</legend><label><input type="radio" name={`handling-${field.id}`} checked={field.handling === 'flag'} onChange={() => update({ handling: 'flag' })} /><span>Flag for review and continue</span></label><label><input type="radio" name={`handling-${field.id}`} checked={field.handling === 'resolve'} onChange={() => update({ handling: 'resolve' })} /><span>Resolve before continuing</span></label></fieldset>
        {!errors.min && !errors.max && (field.min !== '' || field.max !== '') && <p className="wb-consequence"><Check size={15} /><span>A response {exampleLimit} {field.unit || '(unit)'} will {field.handling === 'flag' ? 'be recorded and flagged for review.' : 'keep this step open until resolved.'}</span></p>}
      </div>}
    </div>}
  </section>
}

export function FieldsEditor({ fields, update, showErrors }: { fields: CaptureField[]; update: (fields: CaptureField[]) => void; showErrors: boolean }) {
  return <>{fields.map(field => <FieldEditor key={field.id} field={field} update={patch => update(fields.map(item => item.id === field.id ? { ...item, ...patch } : item))} remove={() => update(fields.filter(item => item.id !== field.id))} showErrors={showErrors} />)}<ResponsePicker add={type => update([...fields, newField(type)])} /></>
}

export function StepEditor({ step, update, showErrors, tryStep, done }: { step: WorkStep; update: (patch: Partial<WorkStep>) => void; showErrors: boolean; tryStep: () => void; done: () => void }) {
  return <div className="wb-step-body">
    <Input id={`step-title-${step.id}`} label="Step name" value={step.title} onChange={title => update({ title })} error={!step.title.trim() ? 'Give this step a name.' : undefined} validateOnBlur={!showErrors} placeholder="e.g. Measure the component diameter" />
    <Input label="Instructions" multiline value={step.instructions} onChange={instructions => update({ instructions })} placeholder="Step instructions" />
    <div className="wb-question-heading"><h3>Responses</h3><span>Optional</span></div>
    <FieldsEditor fields={step.fields} update={fields => update({ fields })} showErrors={showErrors} />
    <div className="wb-step-footer"><Action onClick={tryStep}>Try this step</Action><Action primary onClick={done}><Check size={15} />Done editing</Action></div>
  </div>
}
