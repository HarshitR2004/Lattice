import { choices, evaluate, uid, validate } from '../workflows/model'
import type { CaptureField, Workflow, WorkflowContent, WorkStep } from '../workflows/model'

export type ResponseSource = 'typed' | 'bolna'
export type ResponseRevision = { value: string; source: ResponseSource; at: string; kind: 'recorded' | 'flagged' | 'blocked' }
export type SessionResponse = ResponseRevision & { history: ResponseRevision[] }
export type WorkSession = {
  revision?: number
  id: string
  workflowId: string
  workflow: WorkflowContent & { version: number }
  label: string
  status: 'active' | 'paused' | 'completed'
  position: number
  createdAt: string
  updatedAt: string
  completedAt?: string
  drafts: Record<string, string>
  sources: Record<string, ResponseSource>
  responses: Record<string, SessionResponse>
  completedSteps: string[]
  attemptedSteps: string[]
}

export type SessionAction =
  | { type: 'draft'; fieldId: string; value: string; source: ResponseSource }
  | { type: 'record' }
  | { type: 'next' }
  | { type: 'go'; position: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'finish' }

export function sessionStages(session: WorkSession): WorkStep[] {
  return [
    ...(session.workflow.setup.length ? [{ id: 'setup', title: 'Before starting', instructions: 'Identify the work before you begin.', fields: session.workflow.setup }] : []),
    ...session.workflow.steps,
  ]
}

export function canStart(workflow: Workflow): boolean {
  return workflow.status === 'ready' && Boolean(workflow.published) && validate({ ...workflow, ...workflow.published }).length === 0
}

export function createSession(workflow: Workflow, label: string): WorkSession {
  if (!canStart(workflow) || !workflow.published) throw new Error('Mark this workflow ready before starting a session.')
  const now = new Date().toISOString()
  return {
    id: uid(), workflowId: workflow.id, workflow: structuredClone(workflow.published),
    label: label.trim() || workflow.published.title, status: 'active', position: 0,
    createdAt: now, updatedAt: now, drafts: {}, sources: {}, responses: {}, completedSteps: [], attemptedSteps: [],
  }
}

export function evaluateResponse(field: CaptureField, value: string) {
  if (value.trim() && field.type === 'choice' && !choices(field).includes(value)) return { kind: 'blocked' as const, message: 'Choose one of the configured responses.' }
  if (value.trim() && field.type === 'confirmation' && value !== 'confirmed') return { kind: 'blocked' as const, message: 'Confirm this response before continuing.' }
  return evaluate(field, value)
}

export function stageResults(session: WorkSession, stage: WorkStep) {
  return stage.fields.map(field => ({ field, value: session.drafts[field.id] || '', result: evaluateResponse(field, session.drafts[field.id] || '') }))
}

export function sessionReducer(session: WorkSession, action: SessionAction): WorkSession {
  if (session.status === 'completed') return session
  const now = new Date().toISOString()
  if (action.type === 'pause') return { ...session, status: 'paused', updatedAt: now }
  if (action.type === 'resume') return { ...session, status: 'active', updatedAt: now }
  if (session.status === 'paused') return session
  const stages = sessionStages(session)
  const stage = stages[session.position]
  if (action.type === 'draft') {
    if (!stage?.fields.some(field => field.id === action.fieldId)) return session
    if ((session.drafts[action.fieldId] || '') === action.value) return session
    return { ...session, updatedAt: now, drafts: { ...session.drafts, [action.fieldId]: action.value }, sources: { ...session.sources, [action.fieldId]: action.source }, completedSteps: session.completedSteps.filter(id => id !== stage.id), attemptedSteps: session.attemptedSteps.filter(id => id !== stage.id) }
  }
  if (action.type === 'record' && stage) {
    const results = stageResults(session, stage)
    const responses = { ...session.responses }
    for (const { field, value, result } of results) {
      const previous = responses[field.id]
      const history = previous ? previous.value !== value ? [...previous.history, { value: previous.value, source: previous.source, at: previous.at, kind: previous.kind }] : previous.history : []
      responses[field.id] = { value, source: session.sources[field.id] || 'typed', kind: result.kind, at: now, history }
    }
    return { ...session, responses, updatedAt: now, attemptedSteps: [...new Set([...session.attemptedSteps, stage.id])], completedSteps: results.some(item => item.result.kind === 'blocked') ? session.completedSteps.filter(id => id !== stage.id) : [...new Set([...session.completedSteps, stage.id])] }
  }
  if (action.type === 'next' && stage && session.completedSteps.includes(stage.id)) return { ...session, position: Math.min(session.position + 1, stages.length), updatedAt: now }
  if (action.type === 'go') {
    const firstIncomplete = stages.findIndex(item => !session.completedSteps.includes(item.id))
    const lastReachable = firstIncomplete < 0 ? stages.length : firstIncomplete
    if (Number.isInteger(action.position) && action.position >= 0 && action.position <= lastReachable) return { ...session, position: action.position, updatedAt: now }
  }
  if (action.type === 'finish' && stages.every(item => session.completedSteps.includes(item.id) && !stageResults(session, item).some(response => response.result.kind === 'blocked'))) return { ...session, status: 'completed', completedAt: now, updatedAt: now }
  return session
}

export function responseValue(field: CaptureField, value: string) {
  return !value ? 'Not provided' : field.type === 'confirmation' ? 'Confirmed' : `${value}${field.type === 'number' && field.unit ? ` ${field.unit}` : ''}`
}

export function sampleResponses(field: CaptureField): { label: string; spoken: string; value: string }[] {
  if (field.type === 'choice') return choices(field).map(value => ({ label: value, spoken: `Record ${field.name.toLowerCase()} as ${value.toLowerCase()}.`, value }))
  if (field.type === 'confirmation') return [{ label: 'Confirm', spoken: `Confirmed: ${field.name}.`, value: 'confirmed' }]
  if (field.type === 'text') {
    const identifier = /\bid\b|identifier|batch|serial/i.test(field.name)
    return (identifier ? ['CMP-014', 'CMP-015'] : ['No visible defects.', 'A small scratch is visible on the surface.']).map(value => ({ label: value, spoken: `Record ${field.name.toLowerCase()}: ${value}`, value }))
  }
  const min = field.handling !== 'record' && field.min !== '' ? Number(field.min) : undefined
  const max = field.handling !== 'record' && field.max !== '' ? Number(field.max) : undefined
  const inside = min !== undefined && max !== undefined ? min / 2 + max / 2 : min ?? max ?? 10.02
  const value = String(Number(inside.toPrecision(10)))
  const samples = [{ label: min !== undefined || max !== undefined ? 'Within range' : 'Sample measurement', spoken: `The ${field.name.toLowerCase()} is ${value} ${field.unit}.`, value }]
  const limit = max ?? min
  if (limit !== undefined) {
    const delta = Math.max(Math.abs(limit) * .01, .03)
    const outside = String(Number((max !== undefined ? limit + delta : limit - delta).toPrecision(10)))
    samples.push({ label: 'Outside range', spoken: `The ${field.name.toLowerCase()} is ${outside} ${field.unit}.`, value: outside })
  }
  return samples
}
