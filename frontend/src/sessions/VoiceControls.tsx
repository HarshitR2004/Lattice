import { useEffect, useRef, useState } from 'react'
import { BolnaWebCall } from '@bolna/web-call'
import { Mic, MicOff, Square, AudioLines } from 'lucide-react'
import { api, post } from '../api/client'
import { useSessions } from './store'
import type { WorkSession } from './model'

export default function VoiceControls({ session }: { session: WorkSession }) {
  const [state, setState] = useState('idle')
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const callRef = useRef<BolnaWebCall | null>(null)
  const store = useSessions()
  const refresh = useRef(store.refresh)
  refresh.current = store.refresh
  const live = ['connecting', 'ringing', 'active'].includes(state)
  useEffect(() => {
    let alive = true
    void api<{ configured: boolean }>('/voice/status').then(result => { if (alive) setConfigured(result.configured) })
      .catch(() => { if (alive) setConfigured(false) })
    return () => {
      alive = false
      void callRef.current?.stop()
      if (callRef.current) void post(`/sessions/${session.id}/voice/end`).catch(() => {})
    }
  }, [session.id])
  useEffect(() => {
    if (!live) return
    const interval = setInterval(() => { void refresh.current() }, 1000)
    return () => clearInterval(interval)
  }, [live])
  const stop = async () => {
    try { await callRef.current?.stop(); await post(`/sessions/${session.id}/voice/end`) }
    catch { setError('Unable to close the voice connection. Try stopping again.') }
    setState('ended'); setMuted(false)
  }
  const start = () => {
    setError(''); setMuted(false)
    const call = new BolnaWebCall({ getSession: () => post(`/sessions/${session.id}/voice/session`) })
    callRef.current = call
    call.on('state-change', setState)
    call.on('error', e => setError(e.code === 'microphone_denied' ?
      'Allow microphone access in your browser to use voice.' : 'Voice could not connect. Try again or enter your responses below.'))
    call.on('call-end', () => {
      void post(`/sessions/${session.id}/voice/end`).catch(() => {})
      void refresh.current()
    })
    void call.start().catch(() => {
      setState('ended')
      void post(`/sessions/${session.id}/voice/end`).catch(() => {})
    })
  }
  return <div className="sr-voice" aria-label="Voice assistance">
    <div className="sr-voice-trigger"><span className="sr-mic-icon"><Mic size={19} /></span>
      <span><strong>Voice assistance</strong><small style={{ display: 'block', marginTop: 5 }}>{live ? state === 'active' ? 'Listening · confirm answers aloud to save' : 'Connecting…' : configured === false ? 'Voice setup required' : 'Speak your responses and stay in flow'}</small></span><AudioLines size={20} /></div>
    <div style={{ display: 'flex', gap: 10, padding: '12px 0' }}>
      {!live ? <button className="wb-action" disabled={!configured} onClick={start}><Mic size={15} />Start voice</button> : <>
        <button className="wb-action" onClick={() => { callRef.current?.setMuted(!muted); setMuted(!muted) }}>{muted ? <MicOff size={15} /> : <Mic size={15} />}{muted ? 'Unmute' : 'Mute'}</button>
        <button className="wb-action" onClick={() => { void stop() }}><Square size={15} />Stop voice</button></>}
    </div>{error && <p role="alert" className="wb-field-error">{error}</p>}
  </div>
}
