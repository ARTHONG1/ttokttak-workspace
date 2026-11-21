import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

/**
 * The few page parts 생기부 uses (this app's own copy): asking the built-in 똑딱AI, the
 * clipboard, a download, a toast and a dialog.
 */

/** one answer of the built-in 똑딱AI; id lets the page call it off, temperature is 0 unless given */
/** a request that failed for its own student (notes too long, an answer that ran on) */
export class StudentProblem extends Error {}

export async function askAi(
  system: string,
  text: string,
  options: { id?: string; temperature?: number } = {},
): Promise<string> {
  const out = await window.saenggibu.ask({
    requestId: options.id ?? crypto.randomUUID(),
    system,
    text,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  })
  if (!out.ok) throw out.student ? new StudentProblem(out.error) : new Error(out.error)
  return out.text
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/** hand bytes over as a download (the app asks where to save it) */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export interface Toast {
  text: string
  bad?: boolean
}

/**
 * a short message at the bottom of the page; say(text, true) shows it as a failure, and
 * longer (the end of a class run that left students unwritten must not be missed)
 */
export function useToast(): [Toast | null, (text: string, bad?: boolean) => void] {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const say = (text: string, bad = false) => {
    clearTimeout(timer.current)
    setToast({ text, bad })
    timer.current = setTimeout(() => setToast(null), bad ? 8000 : 2800)
  }
  return [toast, say]
}

export function ToastView({ toast }: { toast: Toast | null }): ReactElement | null {
  if (!toast) return null
  return (
    <div className={'sf-toast' + (toast.bad ? ' is-bad' : '')} role="status">
      {toast.text}
    </div>
  )
}

/** a dialog over the page; Escape and a click outside close it */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}): ReactElement {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="sf-modal-back" onClick={onClose}>
      <div
        className={'sf-modal' + (wide ? ' is-wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sf-modal-head">
          <h2>{title}</h2>
          <button type="button" className="sf-icon-btn" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
