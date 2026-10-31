import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, post } from '../api/client'
import type { Workflow } from './model'
import { loadWorkflows } from './model'

function useWorkflowState() {
  const [items, setItems] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const latest = useRef(items)
  const pending = useRef(new Map<string, Workflow>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const failed = useRef(false)
  const inFlight = useRef(false)
  const apply = useCallback((next: Workflow[]) => { latest.current = next; setItems(next) }, [])
  const refresh = useCallback(async () => {
    try { apply(await api<Workflow[]>('/workflows')); setError('') }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [apply])
  useEffect(() => { void refresh() }, [refresh])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const perform = async () => {
      if (!pending.current.size) {
        if (failed.current) throw new Error('Resolve the save error before continuing.')
        return
      }
      setSaving(true)
      inFlight.current = true
      try {
        while (pending.current.size) {
          const [id, draft] = pending.current.entries().next().value as [string, Workflow]
          pending.current.delete(id)
          try {
            const current = latest.current.find(item => item.id === id)!
            const saved = await api<Workflow>(`/workflows/${id}`, {
              method: 'PUT', body: JSON.stringify({ content: draft, revision: current.revision }),
            })
            const nextPending = pending.current.get(id)
            if (nextPending) pending.current.set(id, { ...nextPending, revision: saved.revision })
            apply(latest.current.map(item => item.id === id ?
              nextPending ? { ...item, revision: saved.revision } : saved : item))
          } catch (e) { if (!pending.current.has(id)) pending.current.set(id, draft); throw e }
        }
        failed.current = false; setError('')
      } catch (e) { failed.current = true; setError((e as Error).message); throw e }
      finally { inFlight.current = false; setSaving(false) }
    }
    const result = queue.current.catch(() => {}).then(perform)
    queue.current = result.catch(() => {})
    return result
  }, [apply])

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (pending.current.size || inFlight.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', protect)
    return () => { window.removeEventListener('beforeunload', protect) }
  }, [])

  const update = (next: Workflow[]) => {
    for (const item of next) {
      if (latest.current.find(old => old.id === item.id) !== item) pending.current.set(item.id, item)
    }
    apply(next); setSaving(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush().catch(() => {}) }, 500)
  }
  const create = async (draft: Workflow) => {
    const saved = await post<Workflow>('/workflows', draft)
    apply([...latest.current, saved]); return saved
  }
  const publish = async (id: string) => {
    await flush()
    const current = latest.current.find(item => item.id === id)!
    const saved = await post<Workflow>(`/workflows/${id}/publish`, { revision: current.revision })
    apply(latest.current.map(item => item.id === id ? saved : item)); return saved
  }
  const archive = async (id: string) => {
    await flush()
    const current = latest.current.find(item => item.id === id)!
    await api(`/workflows/${id}?revision=${current.revision}`, { method: 'DELETE' })
    apply(latest.current.filter(item => item.id !== id))
  }
  const importSaved = async () => {
    await flush()
    const loaded = loadWorkflows()
    if (loaded.error) throw new Error(loaded.error)
    await post('/workflows/import', { workflows: loaded.items })
    await refresh()
  }
  const reload = async () => {
    if (timer.current) clearTimeout(timer.current)
    await queue.current
    pending.current.clear(); failed.current = false; setSaving(false)
    await refresh()
  }
  return { items, loading, error, saving, update, create, publish, archive, flush, refresh, reload, importSaved }
}

const WorkflowContext = createContext<ReturnType<typeof useWorkflowState> | null>(null)
export function WorkflowsProvider({ children }: { children: ReactNode }) {
  const value = useWorkflowState()
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}
export function useWorkflows() {
  const value = useContext(WorkflowContext)
  if (!value) throw new Error('Workflow provider is missing.')
  return value
}
