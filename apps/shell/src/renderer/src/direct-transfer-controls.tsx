import { useEffect, useRef, useState } from 'react'
import type {
  DirectFeature,
  DirectTransferProgress,
  DirectTransferStage,
} from '../../shared/direct-transfer-api'

const STAGE_TEXT: Record<DirectTransferStage, string> = {
  'browser-opening': '전용 브라우저 열기',
  'waiting-login': '로그인과 업무 화면 열기를 기다리고 있어요',
  'finding-screen': '입력 화면을 찾고 있어요',
  'waiting-selection': '학생 또는 예산 줄 선택을 기다리고 있어요',
  writing: '입력 중이에요',
  verifying: '입력값을 확인하고 있어요',
  done: '입력 확인 완료',
  failed: '입력을 마치지 못했어요',
  cancelled: '전송 취소',
}

/** One request owns its progress stream and is aborted when the form goes away. */
export function useDirectTransferProgress(feature: DirectFeature) {
  const active = useRef<string | null>(null)
  const cancelledRequests = useRef(new Set<string>())
  const [progress, setProgress] = useState<DirectTransferProgress | null>(null)

  useEffect(() => {
    const api = window.aiOffice
    const unsubscribe = api?.onDirectTransferProgress?.((event) => {
      if (
        event.requestId === active.current &&
        event.feature === feature &&
        (!cancelledRequests.current.has(event.requestId) || event.stage === 'done')
      )
        setProgress(event)
    })
    return () => {
      unsubscribe?.()
      if (active.current) void api?.cancelDirectTransfer?.(active.current)
      active.current = null
    }
  }, [feature])

  const start = () => {
    if (active.current) return active.current
    const requestId = crypto.randomUUID()
    active.current = requestId
    setProgress({ requestId, feature, stage: 'browser-opening', elapsedMs: 0 })
    return requestId
  }
  const finish = (requestId: string, ok: boolean) => {
    const wasCancelled = cancelledRequests.current.delete(requestId)
    if (active.current === requestId) {
      active.current = null
      setProgress((previous) =>
        previous?.requestId === requestId
          ? {
              ...previous,
              stage: ok
                ? 'done'
                : wasCancelled || previous.stage === 'cancelled'
                  ? 'cancelled'
                  : 'failed',
            }
          : previous,
      )
    }
  }
  const cancel = () => {
    const requestId = active.current
    if (requestId) {
      cancelledRequests.current.add(requestId)
      setProgress((previous) =>
        previous?.requestId === requestId ? { ...previous, stage: 'cancelled' } : previous,
      )
      void window.aiOffice?.cancelDirectTransfer?.(requestId)
    }
  }

  return { progress, start, finish, cancel }
}

export function DirectTransferControls({
  feature,
  sending,
  progress,
  onCancel,
}: {
  feature: DirectFeature
  sending: boolean
  progress: DirectTransferProgress | null
  onCancel(): void
}) {
  const [origin, setOrigin] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const view = useRef<symbol | null>(null)
  const addressChange = useRef(0)

  useEffect(() => {
    const current = Symbol()
    view.current = current
    const change = ++addressChange.current
    setOrigin('')
    setEditing(false)
    setStatus('')
    void window.aiOffice
      ?.getDirectTransferOrigin?.(feature)
      .then((saved) => {
        if (view.current === current && addressChange.current === change) setOrigin(saved ?? '')
      })
      .catch(() => undefined)
    return () => {
      view.current = null
    }
  }, [feature])
  useEffect(() => {
    if (!sending || !progress) return
    const began = Date.now() - progress.elapsedMs
    setElapsed(progress.elapsedMs)
    const timer = setInterval(() => setElapsed(Date.now() - began), 1000)
    return () => clearInterval(timer)
  }, [sending, progress])

  const saveOrigin = async (next: string | null) => {
    const current = view.current
    const change = ++addressChange.current
    const isCurrent = () => view.current === current && addressChange.current === change
    try {
      const ok = await window.aiOffice?.setDirectTransferOrigin?.(feature, next)
      if (!isCurrent()) return
      setStatus(
        ok
          ? next === null
            ? '시작 주소를 삭제했어요.'
            : '시작 주소를 저장했어요.'
          : 'HTTPS로 시작하는 교육청 업무포털 주소(*.go.kr)를 확인해 주세요.',
      )
      if (ok) {
        setEditing(false)
        setOrigin(next ? new URL(next).origin : '')
      }
    } catch {
      if (isCurrent()) setStatus('주소 설정에 실패했어요. 다시 시도해 주세요.')
    }
  }
  const copyDiagnostic = async () => {
    const current = view.current
    const diagnostic = {
      feature,
      stage: progress?.stage ?? 'failed',
      elapsedMs: elapsed,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2))
      if (view.current === current) setStatus('개인정보가 없는 전송 진단 정보를 복사했어요.')
    } catch {
      if (view.current === current) setStatus('진단 복사에 실패했어요.')
    }
  }

  return (
    <div className="sf-send-note" role="group" aria-label="직접 전송 설정과 진행 상황">
      {feature === 'edufine-pumui' && !origin && !editing && (
        <p>첫 전송 전에 사용 중인 교육청 K-에듀파인 업무포털 시작 주소를 등록해 주세요.</p>
      )}
      {editing ? (
        <div className="sf-btn-row">
          <input
            aria-label="업무포털 시작 주소"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="https://업무포털주소.go.kr"
            disabled={sending}
            style={{ flex: '1 1 250px', minWidth: 0 }}
          />
          <button
            type="button"
            className="sf-secondary sf-sm"
            disabled={sending}
            onClick={() => void saveOrigin(origin.trim())}
          >
            주소 저장
          </button>
          <button
            type="button"
            className="sf-secondary sf-sm"
            disabled={sending}
            onClick={() => void saveOrigin(null)}
          >
            주소 삭제
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sf-secondary sf-sm"
          disabled={sending}
          onClick={() => setEditing(true)}
        >
          {origin ? '업무포털 시작 주소 변경' : '업무포털 시작 주소 등록'}
        </button>
      )}
      {sending && progress && (
        <p role="status">
          {STAGE_TEXT[progress.stage]} · {Math.floor(elapsed / 1000)}초
          <button
            type="button"
            className="sf-secondary sf-sm"
            onClick={onCancel}
            style={{ marginLeft: 10 }}
          >
            전송 취소
          </button>
        </p>
      )}
      {progress && !sending && <p>{STAGE_TEXT[progress.stage]}</p>}
      {progress && (
        <button type="button" className="sf-secondary sf-sm" onClick={() => void copyDiagnostic()}>
          진단 복사
        </button>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  )
}
