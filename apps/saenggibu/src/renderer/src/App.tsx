import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AiState, ModelInfo } from '../../shared/api'
import { SchoolRecord } from './record/SchoolRecord'

const AI_LABEL: Record<AiState['state'], string> = {
  off: '똑딱AI 대기 중',
  verifying: '똑딱AI 확인 중…',
  downloading: '똑딱AI 받는 중',
  'download-failed': '똑딱AI 받기 멈춤',
  starting: '똑딱AI 준비 중…',
  ready: '똑딱AI 준비됨',
  missing: '똑딱AI 파일 없음',
  failed: '똑딱AI 오류',
}

const gb = (bytes: number) => (bytes / 1e9).toFixed(1) + 'GB'
const percent = (s: { received: number; total: number }) =>
  Math.floor((s.received / Math.max(1, s.total)) * 100)

/** "약 3분 남음" from the recent download rate; nothing until the rate is known */
export function remaining(received: number, total: number, rate: number): string {
  if (rate <= 0) return ''
  const seconds = (total - received) / rate
  if (seconds < 60) return '1분 안에 끝나요'
  return '약 ' + Math.ceil(seconds / 60) + '분 남음'
}

/** true once value has stayed true for ms (a quick check does not flash a banner) */
function useHeld(value: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!value) {
      setHeld(false)
      return
    }
    const timer = setTimeout(() => setHeld(true), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return held
}

/** the first-launch download of the model: progress, or what stopped it and what to do */
function ModelBanner({ ai }: { ai: AiState }): ReactElement | null {
  const [info, setInfo] = useState<ModelInfo | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.saenggibu.modelInfo().then(setInfo)
  }, [])
  const longCheck = useHeld(ai.state === 'verifying', 700)
  if (ai.state !== 'downloading' && ai.state !== 'download-failed' && !longCheck) return null
  const size = info ? gb(info.bytes) : ''
  const importFile = async () => {
    setBusy(true)
    setNote('')
    const result = await window.saenggibu.importModel()
    setBusy(false)
    if (result && !result.ok) setNote(result.error)
  }
  return (
    <section className={'sg-model is-' + ai.state} data-testid="sg-model" aria-live="polite">
      <div className="sg-model-text">
        <strong>
          {ai.state === 'downloading'
            ? '똑딱AI를 처음 한 번 받고 있어요'
            : ai.state === 'verifying'
              ? '받은 똑딱AI를 확인하고 있어요'
              : '똑딱AI를 다 받지 못했어요'}
        </strong>
        <span>
          {ai.state === 'download-failed'
            ? ai.message
            : '모델 ' +
              size +
              '를 받으면 그다음부터는 인터넷 없이 써요. 받는 동안에도 명렬표와 관찰 기록은 입력할 수 있어요.'}
        </span>
        {note && (
          <span className="sg-model-note" role="alert">
            {note}
          </span>
        )}
      </div>
      {ai.state === 'downloading' && (
        <div className="sg-model-progress">
          <div
            className="sg-model-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent(ai)}
            data-testid="sg-model-progress"
          >
            <span style={{ transform: 'scaleX(' + ai.received / Math.max(1, ai.total) + ')' }} />
          </div>
          <span className="sg-model-count">
            {percent(ai)}% · {gb(ai.received)} / {gb(ai.total)}
            {remaining(ai.received, ai.total, ai.rate) &&
              ' · ' + remaining(ai.received, ai.total, ai.rate)}
          </span>
        </div>
      )}
      {ai.state === 'download-failed' && (
        <div className="sg-model-actions">
          <button
            type="button"
            className="sf-primary sf-sm"
            data-testid="sg-model-retry"
            disabled={busy}
            onClick={() => void window.saenggibu.retryModel()}
          >
            다시 받기
          </button>
          <button
            type="button"
            className="sf-secondary sf-sm"
            data-testid="sg-model-import"
            disabled={busy}
            onClick={() => void importFile()}
          >
            파일로 넣기
          </button>
          <button
            type="button"
            className="sf-text-btn"
            onClick={() => void window.saenggibu.openModelPage()}
          >
            모델 파일 받는 곳
          </button>
        </div>
      )}
    </section>
  )
}

/** 똑딱생기부: one window, the 생기부 page, and the built-in 똑딱AI's state at the top */
export function App(): ReactElement {
  const [ai, setAi] = useState<AiState>({ state: 'off' })
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.saenggibu.aiState().then(setAi)
    void window.saenggibu.version().then(setVersion)
    return window.saenggibu.onAiState(setAi)
  }, [])
  return (
    <div className="sf sf-desktop sg-app">
      <header className="sg-bar">
        <span className="sg-name">똑딱생기부</span>
        {version && <span className="sg-version">{version}</span>}
        <span
          className={'sg-ai is-' + ai.state}
          data-testid="sg-ai-state"
          title={
            ai.state === 'failed' || ai.state === 'download-failed'
              ? ai.message
              : '이 컴퓨터 안에서만 도는 AI예요. 학생 글을 인터넷으로 보내지 않아요.'
          }
        >
          {AI_LABEL[ai.state]}
          {ai.state === 'downloading' && ' ' + percent(ai) + '%'}
        </span>
      </header>
      <ModelBanner ai={ai} />
      <main className="sg-main">
        <SchoolRecord />
      </main>
    </div>
  )
}
