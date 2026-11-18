import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AiState } from '../../shared/api'
import { SchoolRecord } from './record/SchoolRecord'

const AI_LABEL: Record<AiState['state'], string> = {
  off: '똑딱AI 대기 중',
  starting: '똑딱AI 준비 중…',
  ready: '똑딱AI 준비됨',
  missing: '똑딱AI 파일 없음',
  failed: '똑딱AI 오류',
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
            ai.state === 'failed'
              ? ai.message
              : '이 컴퓨터 안에서만 도는 AI예요. 학생 글을 인터넷으로 보내지 않아요.'
          }
        >
          {AI_LABEL[ai.state]}
        </span>
      </header>
      <main className="sg-main">
        <SchoolRecord />
      </main>
    </div>
  )
}
