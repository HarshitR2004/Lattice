import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, ClipboardList, Copy, Download, FileText, ListChecks, MoreHorizontal, PencilLine, Play, Plus, ShieldCheck, Trash2, TriangleAlert, X } from 'lucide-react'
import { Action, Input, Modal } from './builder-ui'
import { FieldsEditor, fieldSummary, StepEditor } from './StepEditor'
import WorkflowPreview from './WorkflowPreview'
import { exampleWorkflow, newField, newStep, newWorkflow, stepsFromProcedure, uid, validate } from './model'
import type { Issue, WorkStep, Workflow, WorkflowContent } from './model'
import './workflow-builder.css'
import { canStart } from '../sessions/model'
import { navigateTo, useLocation } from '../workspace/navigation'
import WorkspaceHeader from '../workspace/WorkspaceHeader'
import { useWorkflows } from './store'
import { download } from '../api/client'

function Journey({ stage }: { stage: 1 | 2 | 3 }) {
  return <ol className="wb-journey" aria-label="Workflow creation progress">{['Start', 'Steps', 'Review'].map((label, index) => <li key={label} className={stage === index + 1 ? 'is-current' : stage > index + 1 ? 'is-complete' : ''} aria-current={stage === index + 1 ? 'step' : undefined}><span>{stage > index + 1 ? <Check size={13} /> : `0${index + 1}`}</span>{label}{index < 2 && <ChevronRight size={14} />}</li>)}</ol>
}

function StartingPoint({ create }: { create: (workflow: Workflow) => void }) {
  const [mode, setMode] = useState<'paste' | 'example' | 'write'>('paste')
  const [procedure, setProcedure] = useState('')
  const [firstStep, setFirstStep] = useState('')
  const [attempted, setAttempted] = useState(false)
  const parsed = stepsFromProcedure(procedure)
  const modes = [
    { id: 'paste', icon: ClipboardList, label: 'Paste a procedure' },
    { id: 'example', icon: BookOpen, label: 'Use an example' },
    { id: 'write', icon: PencilLine, label: 'Write the steps' },
  ] as const
  function begin() {
    setAttempted(true)
    if (mode === 'example') { create(exampleWorkflow()); return }
    if (mode === 'paste' && !parsed.length) return
    if (mode === 'write' && !firstStep.trim()) return
    const draft = newWorkflow()
    draft.procedure = mode === 'paste' ? procedure : ''
    draft.steps = mode === 'paste' ? parsed : [newStep(firstStep.trim())]
    create(draft)
  }
  return <section className="wb-start" aria-labelledby="starting-title">
    <Journey stage={1} />
    <div className="wb-start-intro"><h1 id="starting-title">New workflow</h1></div>
    <div className="wb-start-options" role="group" aria-label="Starting point">{modes.map(({ id, icon: Icon, label }) => <button type="button" key={id} aria-pressed={mode === id} className={mode === id ? 'is-active' : ''} onClick={() => { setMode(id); setAttempted(false) }}><span className="wb-start-option-top"><Icon size={20} />{mode === id && <Check size={16} />}</span><strong>{label}</strong></button>)}</div>
    <div className="wb-start-content" key={mode}>
      {mode === 'paste' ? <><Input id="procedure-input" label="Paste your procedure" multiline rows={6} value={procedure} onChange={setProcedure} placeholder={'1. Identify the component\n2. Inspect its condition\n3. Measure its diameter\n4. Record the result'} hint="One instruction per line." error={attempted && !parsed.length ? 'Paste at least one instruction to create your draft.' : undefined} validateOnBlur={false} /><div className="wb-start-bottom"><span className="wb-hint" aria-live="polite">{parsed.length ? `${parsed.length} ${parsed.length === 1 ? 'step' : 'steps'}` : ''}</span><Action primary onClick={begin}>Create steps<ArrowRight size={16} /></Action></div></> : mode === 'example' ? <><div className="wb-example-heading"><ListChecks size={19} /><div><h3>Incoming component inspection</h3></div></div><ol className="wb-example-steps">{['Identify the component', 'Inspect its condition', 'Measure its diameter', 'Record your observations'].map((title, index) => <li key={title}><span>0{index + 1}</span>{title}</li>)}</ol><div className="wb-start-bottom"><Action primary onClick={begin}>Use this example<ArrowRight size={16} /></Action></div></> : <><Input id="first-step-input" label="First step" value={firstStep} onChange={setFirstStep} placeholder="e.g. Identify the component" error={attempted && !firstStep.trim() ? 'Name your first step to get started.' : undefined} validateOnBlur={false} /><div className="wb-start-bottom"><Action primary onClick={begin}>Create step<ArrowRight size={16} /></Action></div></>}
    </div>
  </section>
}

export default function WorkflowBuilder() {
  const store = useWorkflows()
  const workflows = store.items
  const [actionError, setActionError] = useState('')
  const storageError = actionError || store.error
  function attempt(task: () => Promise<unknown>) { void task().then(() => setActionError('')).catch(e => setActionError(e.message)) }
  const path = useLocation().split('?')[0]
  const [selected, setSelected] = useState('')
  const [modal, setModal] = useState<'preview' | 'review' | null>(null)
  const [previewStep, setPreviewStep] = useState<string | undefined>()
  const [showErrors, setShowErrors] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [undoStep, setUndoStep] = useState<{ workflowId: string; step: WorkStep; index: number } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const currentId = path.split('/')[2]
  const workflow = workflows.find(item => item.id === currentId)
  const issues = workflow ? validate(workflow) : []
  const starting = !workflow && (currentId === 'new' || (!currentId && !workflows.length))

  function focusControl(id: string) { requestAnimationFrame(() => document.getElementById(id)?.focus()) }
  function navigate(to: string) {
    navigateTo(to)
    setSelected(''); setShowErrors(false); setSetupOpen(false); setUndoStep(null); setNotice('')
    window.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }))
  }
  useEffect(() => {
    const pop = () => { setSelected(''); setModal(null); setShowErrors(false); setSetupOpen(false); setUndoStep(null) }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  useEffect(() => { document.title = workflow ? `${workflow.title || 'New workflow'} — Lattice` : starting ? 'Create your workflow — Lattice' : 'Your workflows — Lattice' }, [workflow?.title, Boolean(workflow), starting])

  function commit(next: Workflow[]) { store.update(next) }
  function create(draft: Workflow) {
    attempt(async () => { const saved = await store.create(draft); navigate(`/workflows/${saved.id}`); setNotice('Draft created.') })
  }
  function update(patch: Partial<WorkflowContent>) {
    if (!workflow) return
    commit(workflows.map(item => item.id === workflow.id ? { ...item, ...patch, status: 'draft', updatedAt: new Date().toISOString() } : item))
  }
  function updateStep(id: string, patch: Partial<WorkStep>) { if (workflow) update({ steps: workflow.steps.map(step => step.id === id ? { ...step, ...patch } : step) }) }
  function addStep(index = workflow?.steps.length || 0) {
    if (!workflow) return
    const added = newStep(), steps = [...workflow.steps]
    steps.splice(index, 0, added); update({ steps }); setSelected(added.id); focusControl(`step-title-${added.id}`)
  }
  function moveStep(id: string, direction: number) {
    if (!workflow) return
    const steps = [...workflow.steps], index = steps.findIndex(step => step.id === id), next = index + direction
    if (next < 0 || next >= steps.length) return
    ;[steps[index], steps[next]] = [steps[next], steps[index]]
    update({ steps }); setNotice(`Step moved to position ${next + 1}.`)
  }
  function duplicateStep(step: WorkStep) {
    if (!workflow) return
    const copy = { ...structuredClone(step), id: uid(), title: `${step.title || 'Untitled step'} (copy)`, fields: step.fields.map(field => ({ ...field, id: uid() })) }
    const steps = [...workflow.steps]
    steps.splice(steps.indexOf(step) + 1, 0, copy); update({ steps }); setSelected(copy.id); focusControl(`step-title-${copy.id}`)
    setNotice('Step duplicated.')
  }
  function removeStep(step: WorkStep) {
    if (!workflow) return
    const index = workflow.steps.indexOf(step)
    setUndoStep({ workflowId: workflow.id, step, index }); update({ steps: workflow.steps.filter(item => item.id !== step.id) }); setSelected('')
    focusControl(workflow.steps[index + 1] ? `step-toggle-${workflow.steps[index + 1].id}` : 'add-step')
  }
  function restoreStep() {
    if (!workflow || !undoStep || undoStep.workflowId !== workflow.id) return
    const steps = [...workflow.steps]
    steps.splice(Math.min(undoStep.index, steps.length), 0, undoStep.step); update({ steps }); setSelected(undoStep.step.id); focusControl(`step-title-${undoStep.step.id}`); setUndoStep(null)
  }
  function tryWorkflow(stepId?: string) { setPreviewStep(stepId); setModal('preview') }
  function openIssue(issue: Issue) {
    setModal(null); setShowErrors(true)
    if (issue.target === 'setup') setSetupOpen(true)
    else if (issue.target !== 'overview') setSelected(issue.target)
    focusControl(issue.control)
  }
  function exportWorkflow() {
    if (workflow) attempt(async () => { await store.flush(); await download(`/workflows/${workflow.id}/export`, 'lattice-workflow.json') })
  }
  function finish() {
    if (!workflow) return
    if (issues.length) { setShowErrors(true); focusControl('review-issue-0'); return }
    attempt(async () => { const saved = await store.publish(workflow.id); setModal(null); setNotice(`Version ${saved.version} ready.`) })
  }
  if (store.loading) return <main className="wb-app wb-loading"><p role="status">Loading workflows...</p></main>

  return <div className="wb-app">
    <a className="skip-link" href="#workflow-main">Skip to workspace</a>
    <WorkspaceHeader active="workflows" crumb={workflow?.title || (currentId === 'new' ? 'New workflow' : undefined)} />
    {storageError && <div className="wb-storage-error" role="alert"><TriangleAlert size={17} /><span>{storageError}</span><Action onClick={() => attempt(store.flush)}>Retry save</Action><Action onClick={() => attempt(store.reload)}>Reload saved workflows</Action></div>}
    <main id="workflow-main" className={`wb-main ${starting ? 'wb-main-start' : ''}`} ref={mainRef} tabIndex={-1}>
      {starting ? <>{workflows.length > 0 && <button type="button" className="wb-back-link" onClick={() => navigate('/workflows')}><ArrowLeft size={14} />Your workflows</button>}<Action onClick={() => attempt(store.importSaved)}>Import browser workflows</Action><StartingPoint create={create} /></> : !workflow ? <div className="wb-library">
        <div className="wb-library-heading"><div><h1>Workflows</h1></div><Action onClick={() => attempt(store.importSaved)}>Import browser workflows</Action><Action primary onClick={() => navigate('/workflows/new')}><Plus size={16} />New workflow</Action></div>
        {currentId && <p className="wb-inline-warning"><TriangleAlert size={16} />Workflow not found in this workspace.</p>}
        <div className="wb-library-list">{workflows.map(item => <article key={item.id}><button type="button" className="wb-workflow-open" onClick={() => navigate(`/workflows/${item.id}`)}><span className="wb-workflow-symbol"><ListChecks size={22} /></span><span><strong>{item.title || 'Untitled workflow'}</strong><small>{item.steps.length} {item.steps.length === 1 ? 'step' : 'steps'}{item.reference ? ` · ${item.reference}` : ''}</small></span><span className={`wb-badge ${item.status === 'ready' ? 'wb-ready' : ''}`}>{item.status === 'ready' ? `Ready · v${item.version}` : 'Draft'}</span><ChevronRight size={17} /></button>{canStart(item) && <Action className="sr-library-start" aria-label={`Start session: ${item.published!.title}`} onClick={() => navigateTo(`/sessions/new?workflow=${encodeURIComponent(item.id)}`)}><Play size={14} />Start session</Action>}<button type="button" className="wb-icon-button" aria-label={`Delete ${item.title || 'untitled workflow'}`} onClick={() => setDeleteId(item.id)}><Trash2 size={16} /></button></article>)}</div>
        {!workflows.length && <div className="wb-empty"><h2>No workflows</h2><Action primary onClick={() => navigate('/workflows/new')}>Create workflow<ArrowRight size={16} /></Action></div>}
        <p className="wb-local-note"><ShieldCheck size={14} />Saved to your workspace.</p>
      </div> : <>
        <Journey stage={modal ? 3 : 2} />
        <div className="wb-workspace-heading"><div className="wb-workflow-name"><h1 className="wb-sr-only">Edit your workflow</h1><Input id="workflow-title" label="Workflow name" value={workflow.title} onChange={title => update({ title })} placeholder="Name your workflow" error={!workflow.title.trim() ? 'Give your workflow a name before marking it ready.' : undefined} validateOnBlur={!showErrors} /><div className="wb-save-state"><span className={`wb-badge ${workflow.status === 'ready' ? 'wb-ready' : ''}`}>{workflow.status === 'ready' ? `Ready · v${workflow.version}` : workflow.version ? `Draft · based on v${workflow.version}` : 'Draft'}</span><span>{storageError ? <TriangleAlert size={13} /> : <Check size={13} />}{storageError ? 'Not saved' : store.saving ? 'Saving...' : 'Saved to workspace'}</span></div></div><div className="wb-toolbar"><Action onClick={() => tryWorkflow()}><Play size={15} />Try workflow</Action><Action primary={!canStart(workflow)} onClick={() => { setShowErrors(true); setModal('review') }}>Review & finish<ArrowRight size={15} /></Action><Action primary={canStart(workflow)} disabled={!canStart(workflow)} aria-describedby={!canStart(workflow) ? "run-readiness" : undefined} onClick={() => attempt(async () => { await store.flush(); navigateTo(`/sessions/new?workflow=${encodeURIComponent(workflow.id)}`) })}><Play size={15} />Start session</Action><details className="wb-more"><summary aria-label="Workflow actions"><MoreHorizontal size={20} /></summary><button type="button" onClick={exportWorkflow}><Download size={15} />Export JSON</button></details></div></div>
        {!canStart(workflow) && <p id="run-readiness" className="sr-workflow-readiness">Mark ready to start a session.</p>}<details className="wb-details"><summary><FileText size={16} /><span>Workflow details<small>{workflow.reference || 'Purpose and procedure reference · optional'}</small></span><ChevronDown size={16} /></summary><div className="wb-details-body"><Input label="Description (optional)" multiline value={workflow.description} onChange={description => update({ description })} placeholder="Workflow description" /><Input label="Procedure reference (optional)" value={workflow.reference} onChange={reference => update({ reference })} placeholder="SOP name, instruction ID, or document link" /></div></details>
        <section className="wb-sequence" aria-labelledby="sequence-title"><div className="wb-sequence-heading"><div><h2 id="sequence-title">Steps</h2></div><span>{workflow.steps.length} {workflow.steps.length === 1 ? 'step' : 'steps'}</span></div>
          <details className="wb-setup" open={setupOpen} onToggle={event => setSetupOpen(event.currentTarget.open)}><summary><span className="wb-setup-symbol"><ClipboardList size={18} /></span><span><strong>Before starting</strong><small>{workflow.setup.length ? workflow.setup.map(field => field.name || 'Unnamed response').join(' · ') : 'Optional'}</small></span><ChevronDown size={17} /></summary><div className="wb-details-body"><div className="wb-suggestions" role="group" aria-label="Suggested starting information">{['Component ID', 'Batch number', 'Equipment ID'].map(name => <button type="button" key={name} disabled={workflow.setup.some(field => field.name.toLowerCase() === name.toLowerCase())} onClick={() => update({ setup: [...workflow.setup, newField('text', name)] })}><Plus size={13} />{name}</button>)}</div><FieldsEditor fields={workflow.setup} update={setup => update({ setup })} showErrors={showErrors} /></div></details>
          {undoStep && <div className="wb-undo" role="status"><span>“{undoStep.step.title || 'Untitled step'}” removed.</span><button type="button" onClick={restoreStep}>Undo</button></div>}
          <ol className="wb-step-list">{workflow.steps.map((step, index) => {
            const expanded = selected === step.id
            const stepIssues = issues.filter(issue => issue.target === step.id)
            return <li key={step.id}><article className={`wb-step ${expanded ? 'is-expanded' : ''}`}>
              <button type="button" id={`step-toggle-${step.id}`} className="wb-step-toggle" aria-expanded={expanded} aria-controls={`step-body-${step.id}`} onClick={() => setSelected(expanded ? '' : step.id)}><span className="wb-step-number">{String(index + 1).padStart(2, '0')}</span><span className="wb-step-summary"><strong>{step.title || 'Untitled step'}</strong>{step.fields.length ? step.fields.map(field => <small key={field.id}>{fieldSummary(field)}</small>) : <small>{step.instructions || 'Instruction only · no response required'}</small>}{showErrors && stepIssues.length > 0 && <span className="wb-step-issue"><TriangleAlert size={13} />{stepIssues.length} {stepIssues.length === 1 ? 'detail needs' : 'details need'} attention</span>}</span><ChevronDown size={18} /></button>
              {expanded && <div id={`step-body-${step.id}`}><div className="wb-step-tools"><span>STEP {String(index + 1).padStart(2, '0')}</span><button type="button" className="wb-icon-button" aria-label="Move step up" disabled={index === 0} onClick={() => moveStep(step.id, -1)}><ArrowUp size={15} /></button><button type="button" className="wb-icon-button" aria-label="Move step down" disabled={index === workflow.steps.length - 1} onClick={() => moveStep(step.id, 1)}><ArrowDown size={15} /></button><button type="button" className="wb-icon-button" aria-label="Duplicate step" onClick={() => duplicateStep(step)}><Copy size={15} /></button><button type="button" className="wb-icon-button" aria-label="Remove step" onClick={() => removeStep(step)}><Trash2 size={15} /></button></div><StepEditor step={step} update={patch => updateStep(step.id, patch)} showErrors={showErrors} tryStep={() => tryWorkflow(step.id)} done={() => { setSelected(''); focusControl(`step-toggle-${step.id}`) }} /></div>}
            </article>{index < workflow.steps.length - 1 && <div className="wb-insert"><button type="button" aria-label={`Insert step after step ${index + 1}`} onClick={() => addStep(index + 1)}><Plus size={13} /><span>Insert step</span></button></div>}</li>
          })}</ol>
          {!workflow.steps.length && <div className="wb-empty"><ListChecks size={28} /><h3>What happens first?</h3><p>Add an action, then build the process from there.</p></div>}
          <button type="button" id="add-step" className="wb-add-step" onClick={() => addStep()}><Plus size={17} />Add a step</button>
        </section>
      </>}
    </main>
    <div className="wb-status-announcement" role="status">{notice && <span>{notice}</span>}</div>
    {notice && <div className="wb-toast"><CheckCheck size={17} /><span>{notice}</span><button type="button" className="wb-icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {modal === 'preview' && workflow && <WorkflowPreview key={`${workflow.id}-${previewStep || 'full'}`} workflow={workflow} stepId={previewStep} close={() => setModal(null)} editStep={id => { setModal(null); if (id === 'setup') { setSetupOpen(true); focusControl(`${workflow.setup[0]?.id}-name`) } else { setSelected(id); focusControl(`step-title-${id}`) } }} tryFull={() => setPreviewStep(undefined)} review={() => { setShowErrors(true); setModal('review') }} />}
    {modal === 'review' && workflow && <Modal title="Review your workflow" close={() => setModal(null)} wide><div className="wb-review-content"><Journey stage={3} /><div className="wb-review-title"><span className="wb-completion-icon"><ListChecks size={23} /></span><div><h3>{workflow.title || 'Untitled workflow'}</h3><p>{workflow.description || `${workflow.steps.length} steps`}</p></div></div>{issues.length > 0 && <div className="wb-issues"><h4><TriangleAlert size={16} />Finish {issues.length} {issues.length === 1 ? 'detail' : 'details'}</h4>{issues.map((issue, index) => <button type="button" id={`review-issue-${index}`} key={`${issue.control}-${index}`} onClick={() => openIssue(issue)}>{issue.message}<ArrowRight size={14} /></button>)}</div>}{workflow.reference && <p className="wb-review-reference"><BookOpen size={15} />{workflow.reference}</p>}{workflow.setup.length > 0 && <div className="wb-review-step"><h4>Before starting</h4>{workflow.setup.map(field => <p key={field.id}>{fieldSummary(field)}</p>)}</div>}{workflow.steps.map((step, index) => <div className="wb-review-step" key={step.id}><h4><span>{String(index + 1).padStart(2, '0')}</span>{step.title || 'Untitled step'}<button type="button" className="wb-text-button" aria-label={`Edit ${step.title || `step ${index + 1}`}`} onClick={() => { setModal(null); setSelected(step.id); focusControl(`step-title-${step.id}`) }}>Edit</button></h4>{step.instructions && <p>{step.instructions}</p>}{step.fields.map(field => <p className="wb-review-field" key={field.id}><Check size={13} />{fieldSummary(field)}</p>)}</div>)}<div className="wb-modal-actions"><Action onClick={() => tryWorkflow()}><Play size={15} />Try full workflow</Action><Action primary onClick={finish}>{workflow.status === 'ready' ? 'Done' : 'Mark workflow ready'}<Check size={15} /></Action></div></div></Modal>}
    {deleteId && <Modal title="Delete workflow?" close={() => setDeleteId(null)}><div className="wb-review-content"><p>This archives the workflow. Existing inspection records remain available.</p><div className="wb-modal-actions"><Action onClick={() => setDeleteId(null)}>Keep workflow</Action><Action className="wb-danger" onClick={() => attempt(async () => { await store.archive(deleteId); setDeleteId(null) })}>Delete workflow</Action></div></div></Modal>}
  </div>
}
