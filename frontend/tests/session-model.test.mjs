import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// Use Node's TypeScript stripping to test the production models without a new dependency.
function moduleUrl(source) { return `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}` }
const workflowModule = moduleUrl(await readFile(new URL('../src/workflows/model.ts', import.meta.url), 'utf8'))
const sessionSource = (await readFile(new URL('../src/sessions/model.ts', import.meta.url), 'utf8')).replace("'../workflows/model'", JSON.stringify(workflowModule))
const { newWorkflow, newStep, newField } = await import(workflowModule)
const { canStart, createSession, sessionReducer: reduce, sessionStages } = await import(moduleUrl(sessionSource))

function workflow(handling = 'flag') {
  const draft = newWorkflow()
  const field = { ...newField('number', 'Diameter'), unit: 'mm', min: '9.95', max: '10.05', handling }
  const content = { title: 'Inspection', description: '', reference: 'Example WI-012', procedure: '', setup: [newField('text', 'Component ID')], steps: [{ ...newStep('Measure diameter'), fields: [field] }, newStep('Inspect the surface')] }
  return { ...draft, ...structuredClone(content), status: 'ready', version: 1, published: { ...structuredClone(content), version: 1 } }
}

function recordValue(session, fieldId, value, source = 'typed') {
  return reduce(reduce(session, { type: 'draft', fieldId, value, source }), { type: 'record' })
}

test('only currently ready workflows can start, and each session keeps an independent version', () => {
  const ready = workflow()
  const session = createSession(ready, 'CMP-014')
  ready.published.steps[0].fields[0].max = '20'
  ready.title = 'Changed draft'
  ready.status = 'draft'
  assert.equal(canStart(ready), false)
  assert.throws(() => createSession(ready, ''), /Mark this workflow ready/)
  assert.equal(session.workflow.steps[0].fields[0].max, '10.05')
  assert.equal(session.workflow.version, 1)
  assert.equal(session.label, 'CMP-014')
})

test('starting information and required responses gate progression and finalization', () => {
  let session = createSession(workflow(), '')
  assert.equal(sessionStages(session)[0].id, 'setup')
  session = reduce(session, { type: 'next' })
  assert.equal(session.position, 0)
  assert.equal(reduce(session, { type: 'go', position: 2 }).position, 0)
  session = reduce(session, { type: 'record' })
  assert.equal(session.completedSteps.length, 0)
  assert.equal(reduce(session, { type: 'finish' }).status, 'active')
  session = recordValue(session, session.workflow.setup[0].id, 'CMP-014')
  session = reduce(session, { type: 'next' })
  assert.equal(session.position, 1)
})

test('flagged measurements are captured and allow continuing', () => {
  let session = createSession(workflow('flag'), '')
  session = recordValue(session, session.workflow.setup[0].id, 'CMP-014')
  session = reduce(session, { type: 'next' })
  const field = session.workflow.steps[0].fields[0]
  session = recordValue(session, field.id, '10.08', 'typed')
  assert.equal(session.responses[field.id].kind, 'flagged')
  assert.equal(session.responses[field.id].source, 'typed')
  assert.equal(reduce(session, { type: 'next' }).position, 2)
})

test('resolve behavior blocks, and a correction preserves the original response', () => {
  let session = createSession(workflow('resolve'), '')
  session = recordValue(session, session.workflow.setup[0].id, 'CMP-014')
  session = reduce(session, { type: 'next' })
  const field = session.workflow.steps[0].fields[0]
  session = recordValue(session, field.id, '10.08', 'typed')
  assert.equal(reduce(session, { type: 'next' }).position, 1)
  session = recordValue(session, field.id, '10.02')
  assert.equal(session.responses[field.id].kind, 'recorded')
  assert.equal(session.responses[field.id].history[0].value, '10.08')
  assert.equal(session.responses[field.id].history[0].kind, 'blocked')
  assert.equal(reduce(session, { type: 'next' }).position, 2)
})

test('editing an already recorded response requires recording it again', () => {
  let session = createSession(workflow(), '')
  const id = session.workflow.setup[0].id
  session = recordValue(session, id, 'CMP-014')
  assert.equal(session.completedSteps.includes('setup'), true)
  session = reduce(session, { type: 'draft', fieldId: id, value: 'CMP-015', source: 'typed' })
  assert.equal(session.completedSteps.includes('setup'), false)
  assert.equal(reduce(session, { type: 'next' }).position, 0)
  session = reduce(session, { type: 'record' })
  assert.equal(session.responses[id].history[0].value, 'CMP-014')
})

test('pause preserves unrecorded drafts, resume restores editing, and completion is immutable', () => {
  let session = createSession(workflow(), '')
  const id = session.workflow.setup[0].id
  session = reduce(session, { type: 'draft', fieldId: id, value: 'CMP-014', source: 'typed' })
  session = reduce(session, { type: 'pause' })
  assert.equal(reduce(session, { type: 'draft', fieldId: id, value: 'changed', source: 'typed' }), session)
  session = reduce(session, { type: 'resume' })
  assert.equal(session.drafts[id], 'CMP-014')
  session = reduce(session, { type: 'record' })
  session = reduce(session, { type: 'next' })
  session = recordValue(session, session.workflow.steps[0].fields[0].id, '10.02')
  session = reduce(session, { type: 'next' })
  session = reduce(session, { type: 'record' })
  session = reduce(session, { type: 'next' })
  session = reduce(session, { type: 'finish' })
  assert.equal(session.status, 'completed')
  assert.ok(session.completedAt)
  assert.equal(reduce(session, { type: 'go', position: 0 }), session)
  assert.equal(reduce(session, { type: 'draft', fieldId: id, value: 'changed', source: 'typed' }), session)
})

