export type FieldType = 'text' | 'number' | 'choice' | 'confirmation'
export type CaptureField = { id: string; name: string; type: FieldType; unit: string; required: boolean; options: string; min: string; max: string; handling: 'record' | 'flag' | 'resolve' }
export type WorkStep = { id: string; title: string; instructions: string; fields: CaptureField[] }
export type WorkflowContent = { title: string; description: string; reference: string; procedure: string; setup: CaptureField[]; steps: WorkStep[] }
export type Workflow = WorkflowContent & { revision?: number; id: string; status: 'draft' | 'ready'; version: number; updatedAt: string; published?: WorkflowContent & { version: number } }
export type Issue = { target: string; message: string; control: string }
export const storageKey = 'lattice.workflows.v1'
export const uid = () => crypto.randomUUID()
export const newField = (type: FieldType = 'text', name = ''): CaptureField => ({ id: uid(), name, type, unit: '', required: true, options: '', min: '', max: '', handling: 'record' })
export const newStep = (title = ''): WorkStep => ({ id: uid(), title, instructions: '', fields: [] })
export const newWorkflow = (): Workflow => ({ id: uid(), title: '', description: '', reference: '', procedure: '', setup: [], steps: [], status: 'draft', version: 0, updatedAt: new Date().toISOString() })
export const choices = (field: CaptureField) => [...new Set(field.options.split('\n').map(s => s.trim()).filter(Boolean))]

export function stepsFromProcedure(procedure: string): WorkStep[] {
  return procedure.split(/\r?\n/).map(line => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean).map(title => newStep(title))
}

export function exampleWorkflow(): Workflow {
  const workflow = newWorkflow()
  workflow.title = 'Incoming component inspection'
  workflow.description = 'Identify a component, inspect its condition and record the measurements and observations.'
  workflow.steps = [
    { ...newStep('Identify the component'), instructions: 'Read the component identifier from its label.', fields: [newField('text', 'Component ID')] },
    { ...newStep('Inspect its condition'), instructions: 'Check the component for visible damage or surface defects.', fields: [{ ...newField('choice', 'Condition'), options: 'No visible damage\nDamage found' }] },
    { ...newStep('Measure its diameter'), instructions: 'Measure the component diameter using a caliper. Use your approved procedure for the measurement location.', fields: [{ ...newField('number', 'Diameter'), unit: 'mm' }] },
    { ...newStep('Record your observations'), instructions: 'Note anything that should be included in the inspection record.', fields: [{ ...newField('text', 'Observations'), required: false }] },
  ]
  return workflow
}

export function fieldIssues(field: CaptureField): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!field.name.trim()) errors.name = field.type === 'confirmation' ? 'Describe what the person should confirm.' : 'Give this response a name.'
  if (field.type === 'choice' && choices(field).length < 2) errors.options = 'Add at least two different choices, one per line.'
  if (field.type === 'number') {
    if (!field.unit.trim()) errors.unit = 'Add a unit, such as mm, g, or °C.'
    if (field.handling !== 'record') {
      if (field.min === '' && field.max === '') errors.min = 'Add a minimum or a maximum.'
      if (field.min !== '' && !Number.isFinite(Number(field.min))) errors.min = 'Enter a valid minimum.'
      if (field.max !== '' && !Number.isFinite(Number(field.max))) errors.max = 'Enter a valid maximum.'
      if (field.min !== '' && field.max !== '' && Number(field.min) > Number(field.max)) errors.max = 'The maximum must be greater than or equal to the minimum.'
    }
  }
  return errors
}

export function validate(workflow: Workflow): Issue[] {
  const issues: Issue[] = []
  if (!workflow.title.trim()) issues.push({ target: 'overview', control: 'workflow-title', message: 'Give your workflow a name.' })
  if (!workflow.steps.length) issues.push({ target: 'overview', control: 'add-step', message: 'Add at least one work step.' })
  function checkFields(fields: CaptureField[], target: string, prefix: string) {
    fields.forEach((field, i) => {
      const label = `${prefix}: ${field.name.trim() || `field ${i + 1}`}`
      for (const [key, message] of Object.entries(fieldIssues(field))) issues.push({ target, control: `${field.id}-${key}`, message: `${label}: ${message}` })
    })
  }
  checkFields(workflow.setup, 'setup', 'Before starting')
  workflow.steps.forEach((step, i) => {
    if (!step.title.trim()) issues.push({ target: step.id, control: `step-title-${step.id}`, message: `Name step ${i + 1}.` })
    checkFields(step.fields, step.id, step.title || `Step ${i + 1}`)
  })
  return issues
}

export function evaluate(field: CaptureField, value: string) {
  if (!value.trim()) return field.required ? { kind: 'blocked' as const, message: `Enter ${field.name || 'a value'}.` } : { kind: 'recorded' as const, message: 'Not provided.' }
  if (field.type === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) return { kind: 'blocked' as const, message: 'Enter a valid measurement.' }
    const outside = (field.min !== '' && number < Number(field.min)) || (field.max !== '' && number > Number(field.max))
    if (outside && field.handling !== 'record') return { kind: field.handling === 'resolve' ? 'blocked' as const : 'flagged' as const, message: field.handling === 'resolve' ? 'Outside the configured range. Resolve before continuing.' : 'Outside the configured range. Flagged for review.' }
  }
  return { kind: 'recorded' as const, message: 'Recorded.' }
}

export function loadWorkflows(): { items: Workflow[]; error: string } {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { items: [], error: '' }
    const data: unknown = JSON.parse(raw)
    const validField = (field: unknown): field is CaptureField => {
      if (!field || typeof field !== 'object') return false
      const f = field as CaptureField
      return ['id','name','unit','options','min','max'].every(key => typeof f[key as keyof CaptureField] === 'string') && typeof f.required === 'boolean' && ['text','number','choice','confirmation'].includes(f.type) && ['record','flag','resolve'].includes(f.handling)
    }
    if (!Array.isArray(data) || !data.every(w => w && typeof w.id === 'string' && typeof w.title === 'string' && typeof w.description === 'string' && typeof w.reference === 'string' && typeof w.procedure === 'string' && ['draft','ready'].includes(w.status) && Number.isInteger(w.version) && typeof w.updatedAt === 'string' && Array.isArray(w.setup) && w.setup.every(validField) && Array.isArray(w.steps) && w.steps.every((s: WorkStep) => s && typeof s.id === 'string' && typeof s.title === 'string' && typeof s.instructions === 'string' && Array.isArray(s.fields) && s.fields.every(validField)))) throw new Error('Invalid drafts')
    return { items: data, error: '' }
  } catch { return { items: [], error: 'Saved workflows could not be loaded. Existing storage has not been changed.' } }
}
