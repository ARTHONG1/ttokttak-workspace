import { useEffect, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { LocalAiModelsInfo } from '../../shared/home-api'

/**
 * 똑딱AI's model files in the AI settings: they are not in the installer but downloaded once
 * (about 4 GB) on the built-in AI's first use. Shows how far that is, and offers [다시 받기],
 * [파일로 넣기] (files carried in from elsewhere, for a closed network) and the release page.
 */
const gb = (n: number) => (n / 1e9).toFixed(1) + 'GB'

function remaining(info: LocalAiModelsInfo, ko: boolean): string {
  const left = (info.total ?? 0) - (info.received ?? 0)
  if (!info.rate || info.rate < 1 || left <= 0) return ''
  const minutes = Math.ceil(left / info.rate / 60)
  return ko ? ' · 약 ' + minutes + '분 남음' : ' · about ' + minutes + ' min left'
}

export function LocalAiModelPanel({ lang }: { lang: Lang }) {
  const ko = lang === 'ko'
  const [info, setInfo] = useState<LocalAiModelsInfo | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void window.aiOffice.getLocalAiModels?.().then((next) => {
      if (alive) setInfo(next)
    })
    const off = window.aiOffice.onLocalAiModelsChanged?.((next) => setInfo(next))
    return () => {
      alive = false
      off?.()
    }
  }, [])
  if (!info) return null

  const pick = async () => {
    setError('')
    const result = await window.aiOffice.importLocalAiModels?.()
    if (result && !result.ok && !result.canceled) setError(result.error ?? '')
  }
  const download = () => void window.aiOffice.downloadLocalAiModels?.()
  const page = () => void window.aiOffice.openLocalAiModelPage?.()
  const docsReady = info.ready.includes('main')
  const percent =
    info.state === 'downloading' && info.total
      ? Math.floor(((info.received ?? 0) / info.total) * 100)
      : 0

  let text: string
  switch (info.state) {
    case 'ready':
      text = ko
        ? '똑딱AI 모델: 이 컴퓨터에 있어요 (' + gb(info.totalBytes) + ').'
        : 'TtokTtak AI model: on this computer (' + gb(info.totalBytes) + ').'
      break
    case 'idle':
      text = ko
        ? '똑딱AI 모델을 처음 한 번 받아야 해요 (' +
          gb(info.totalBytes) +
          '). 받은 뒤에는 인터넷 없이 씁니다.'
        : 'The TtokTtak AI model is downloaded once (' +
          gb(info.totalBytes) +
          '). After that it works offline.'
      break
    case 'downloading':
      text =
        (ko ? '똑딱AI 모델 받는 중 ' : 'Downloading the TtokTtak AI model ') +
        percent +
        '% · ' +
        gb(info.received ?? 0) +
        ' / ' +
        gb(info.total ?? 0) +
        remaining(info, ko) +
        (docsReady
          ? ko
            ? '. 문서 작업과 품의서 생성은 지금 쓸 수 있고, 생기부는 다 받은 뒤 쓸 수 있어요.'
            : '. Documents and 품의 work now; 생기부 once it is done.'
          : '.')
      break
    case 'failed':
      text =
        (ko ? '똑딱AI 모델을 다 받지 못했어요. ' : 'The model download stopped. ') +
        (info.message ?? '')
      break
    default:
      text = ko ? '똑딱AI 모델을 확인하는 중이에요…' : 'Checking the TtokTtak AI model…'
  }

  return (
    <div
      className="set-local-model"
      data-testid="local-ai-model"
      data-state={info.state}
      role="status"
    >
      <div className="set-field-desc">{text}</div>
      {info.state === 'downloading' && (
        <div className="set-local-model-bar" aria-hidden="true">
          <div style={{ transform: 'scaleX(' + percent / 100 + ')' }} />
        </div>
      )}
      {(info.state === 'idle' || info.state === 'failed') && (
        <div className="set-btn-row">
          <button
            className="set-btn primary"
            data-testid="local-ai-model-download"
            onClick={download}
          >
            {info.state === 'idle' ? (ko ? '받기' : 'Download') : ko ? '다시 받기' : 'Try again'}
          </button>
          <button
            className="set-btn"
            data-testid="local-ai-model-import"
            onClick={() => void pick()}
          >
            {ko ? '파일로 넣기' : 'Add from files'}
          </button>
          <button className="set-btn" onClick={page}>
            {ko ? '모델 파일 받는 곳' : 'Model files page'}
          </button>
        </div>
      )}
      {error && <div className="set-field-desc set-local-model-error">{error}</div>}
    </div>
  )
}
