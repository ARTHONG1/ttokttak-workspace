import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { AiModelPicker, type AiModelPickerBridge } from '@genoffice/ui'
import '@genoffice/ui/ai-model-picker.css'
import { useI18n } from './locale'
import { useSubscriptionConnection } from './subscription-client'

/** What the 특화 기능 pages share: one AI turn, the clipboard, the back button and a toast. */

/** asks the home screen to open Settings › AI 모델 (WorkspaceHome listens) */
export const OPEN_AI_SETTINGS_EVENT = 'ttokttak:open-ai-settings'

const PICKER_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.aiOffice.getAiSettings(),
  setSettings: (settings) => window.aiOffice.setAiSettings(settings),
  onSettingsChanged: (handler) => window.aiOffice.onAiSettingsChanged(handler),
  openModelSettings: () => {
    window.dispatchEvent(new CustomEvent(OPEN_AI_SETTINGS_EVENT))
  },
}

/**
 * The AI a 똑딱업무 tool writes with, picked with the same chip as the editors' AI panels:
 * the built-in AI, a connected subscription agent (Codex, Claude) or a key provider. The
 * choice is the one app-wide setting, so changing it here changes it for the editors too.
 */
export function SpecialAiPicker(): ReactElement {
  const { lang } = useI18n()
  const subscription = useSubscriptionConnection()
  return (
    <div className="sf-ai-picker" data-testid="special-ai-picker">
      <span className="sf-ai-picker-label">사용할 AI</span>
      <AiModelPicker
        bridge={PICKER_BRIDGE}
        lang={lang}
        subscriptionStatuses={subscription.statuses}
        onRefreshSubscriptions={subscription.refresh}
      />
    </div>
  )
}

export function aiErrorText(chunk: AiStreamChunk): string {
  switch (chunk.errorCode) {
    case 'not-connected':
      return 'AI가 연결되어 있지 않아요. 설정에서 AI를 먼저 연결해 주세요.'
    case 'metered-not-accepted':
      return '고른 AI는 쓴 만큼 요금이 나가요. 설정에서 사용을 허락한 뒤 다시 해 주세요.'
    case 'not-installed':
    case 'signed-out':
    case 'needs-update':
      return 'AI 구독 프로그램 연결을 확인해 주세요.'
    case 'rate-limit':
    case 'free-limit':
    case 'overloaded':
    case 'headless-limit':
      return 'AI 사용량이 많아요. 잠시 뒤 다시 해 주세요.'
    case 'timeout':
      return 'AI 답이 늦어요. 다시 해 주세요.'
    case 'network':
      return '인터넷 연결을 확인해 주세요.'
    default:
      return chunk.error || 'AI 답을 받지 못했어요. 다시 해 주세요.'
  }
}

/** one model turn over the shell's shared ai:stream handler, as the AI 질문 panel uses it */
export async function askAi(
  system: string,
  text: string,
  images: { base64: string; mime: string }[] = [],
  maxTokens = 4000,
): Promise<string> {
  const api = window.aiOffice
  if (typeof api?.aiStream !== 'function') throw new Error('이 화면에서는 AI를 쓸 수 없어요.')
  const settings = await api.aiGetSettings()
  const requestId = crypto.randomUUID()
  return new Promise<string>((resolve, reject) => {
    let out = ''
    const off = api.onAiStream((chunk) => {
      if (chunk.requestId !== requestId) return
      if (chunk.type === 'delta' && chunk.text) out += chunk.text
      else if (chunk.type === 'done') {
        off()
        resolve(out)
      } else if (chunk.type === 'error') {
        off()
        reject(new Error(aiErrorText(chunk)))
      }
    })
    api
      .aiStream({
        requestId,
        settings,
        system,
        messages: [{ role: 'user', text, ...(images.length ? { images } : {}) }],
        tools: [],
        maxTokens,
      })
      .catch((error: unknown) => {
        off()
        reject(error instanceof Error ? error : new Error(String(error)))
      })
  })
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // a frame without clipboard permission (the web edition): the old way still works
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

/** hand bytes to the browser as a download (the desktop app asks where to save it) */
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

export function Back({ onClick, label }: { onClick: () => void; label: string }): ReactElement {
  return (
    <button type="button" className="sf-back" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M10 3.5L5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  )
}

/**
 * 임시 저장 · 불러오기 · 삭제하기, one quiet group at the right of every tool's page head.
 * The work stays in this browser's Local Storage; nothing is sent anywhere.
 */
export function SaveTools({
  onSave,
  onLoad,
  onDelete,
}: {
  onSave: () => void
  onLoad: () => void
  onDelete: () => void
}): ReactElement {
  return (
    <div
      className="sf-save"
      role="group"
      aria-label="임시 저장"
      title="작업 내용은 이 브라우저에만 저장해요. 외부 서버로 보내지 않아요."
    >
      <button type="button" onClick={onSave}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 2.5h8l2.5 2.5v8.5H3z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M5.5 2.5v3h4.5v-3M5.5 13.5V10h5v3.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        임시 저장
      </button>
      <button type="button" onClick={onLoad}>
        불러오기
      </button>
      <button type="button" className="is-danger" onClick={onDelete}>
        삭제하기
      </button>
    </div>
  )
}

export interface Toast {
  text: string
  bad?: boolean
}

/** a short message at the bottom of the page; say(text, true) shows it as a failure */
export function useToast(): [Toast | null, (text: string, bad?: boolean) => void] {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const say = (text: string, bad = false) => {
    clearTimeout(timer.current)
    setToast({ text, bad })
    timer.current = setTimeout(() => setToast(null), 2800)
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
  children: React.ReactNode
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
