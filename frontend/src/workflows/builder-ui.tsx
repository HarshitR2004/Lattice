import { useEffect, useId, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'

export function Action({ children, primary = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" className={`wb-action ${primary ? 'wb-primary' : ''} ${className}`} {...props}>{children}</button>
}

export function Input({ id: givenId, label, value, onChange, placeholder, multiline = false, type = 'text', error, hint, validateOnBlur = true, rows = 3 }: {
  id?: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; type?: string; error?: string; hint?: string; validateOnBlur?: boolean; rows?: number
}) {
  const generatedId = useId()
  const id = givenId || generatedId
  const [touched, setTouched] = useState(false)
  const visibleError = (touched || !validateOnBlur) && error
  const props = { id, value, placeholder, 'aria-invalid': Boolean(visibleError), 'aria-describedby': visibleError ? `${id}-error` : hint ? `${id}-hint` : undefined, onBlur: () => setTouched(true), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value) }
  return <div className="wb-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea {...props} rows={rows} /> : <input {...props} type={type} step={type === 'number' ? 'any' : undefined} />}{visibleError ? <p className="wb-field-error" id={`${id}-error`}>{error}</p> : hint && <p className="wb-hint" id={`${id}-hint`}>{hint}</p>}</div>
}

export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} className={`wb-dialog ${wide ? 'wb-dialog-wide' : ''}`} aria-labelledby={titleId} onCancel={close} onClick={event => {
    if (event.target !== ref.current) return
    const bounds = ref.current.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
  }}><header><h2 id={titleId}>{title}</h2><button type="button" className="wb-icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button></header>{children}</dialog>
}
