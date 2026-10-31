import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Workflow } from '../workflows/model'
import type { SessionAction, WorkSession } from './model'
import { api, post } from '../api/client'

function useSessionState() {
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const current = useRef(sessions)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const failed = useRef(false)
  const pendingCount = useRef(0)
  const update = useCallback((items: WorkSession[]) => { current.current = items; setSessions(items) }, [])
  const refresh = useCallback(async () => {
    if (pendingCount.current) return
    try { update(await api<WorkSession[]>('/sessions')); setError(''); failed.current = false }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [update])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (pendingCount.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [])
  const start = async (workflow: Workflow, label: string) => {
    const saved = await post<WorkSession>('/sessions', { workflowId: workflow.id, label, requestId: crypto.randomUUID() })
    update([saved, ...current.current]); return saved.id
  }
  const dispatch = (id: string, action: SessionAction): Promise<boolean> => {
    const requestId = crypto.randomUUID()
    pendingCount.current += 1; setBusy(true)
    const run = async () => {
      try {
        const before = current.current.find(item => item.id === id)
        if (!before) return false
        if (failed.current) { setError('Reload the saved session before making more changes.'); return false }
        const saved = await post<WorkSession>(`/sessions/${id}/actions`, {
          ...action, source: undefined, revision: before.revision, requestId,
        })
        update(current.current.map(item => item.id === id ? saved : item)); setError(''); return true
      } catch (e) { failed.current = true; setError((e as Error).message); return false }
      finally { pendingCount.current -= 1; setBusy(pendingCount.current > 0) }
    }
    const result = queue.current.catch(() => {}).then(run)
    queue.current = result
    return result
  }
  return { sessions, start, dispatch, loading, error, busy, refresh }
}
const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null)
export function useSessions() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('Sessions require the workspace provider.')
  return value
}
export function SessionsProvider({ children }: { children: ReactNode }) {
  const value = useSessionState()
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
