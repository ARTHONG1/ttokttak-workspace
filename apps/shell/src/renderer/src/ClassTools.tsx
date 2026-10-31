import type { ReactElement } from 'react'
import { Back } from './special-common'
import './special-features.css'

/**
 * 똑딱수업: the class tools, still to come. The page is in place so the home's third tile
 * leads somewhere: what will live here, and the way back.
 */

const PLANNED = [
  { title: '수업 활동지', sub: '학습 목표에 맞춘 활동지와 정리 학습지' },
  { title: '모둠 활동', sub: '모둠 나누기, 역할 정하기, 발표 순서' },
  { title: '형성 평가', sub: '수업 끝에 바로 보는 짧은 확인 문제' },
]

export function ClassTools({
  variant,
  onExit,
  onWork,
}: {
  variant: 'desktop' | 'web'
  /** web only: back to the trial home */
  onExit?: () => void
  /** over to 똑딱업무, whose tools work today */
  onWork?: () => void
}): ReactElement {
  return (
    <div className={'sf sf-' + variant} data-testid="class-tools">
      {onExit && (
        <div className="sf-page-bar">
          <Back onClick={onExit} label="처음 화면" />
        </div>
      )}
      <div className="sf-list">
        <header className="sf-head">
          <span className="sf-eyebrow ct-eyebrow">똑딱수업</span>
          <h1>수업 시간에 바로 쓰는 도구</h1>
          <p>교실에서 쓸 도구를 준비하고 있어요. 하나씩 완성되는 대로 이곳에 들어옵니다.</p>
        </header>
        <div className="ct-empty">
          <span className="ct-mark" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path
                d="M2.8 9.2 12 4.6l9.2 4.6L12 13.8 2.8 9.2Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M6.4 11.1v4.4c0 1.4 2.5 3 5.6 3s5.6-1.6 5.6-3v-4.4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M21.2 9.2v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <h2>아직 준비 중이에요</h2>
          <p>먼저 쓰실 수 있는 업무 도구는 똑딱업무에 있어요.</p>
          {onWork && (
            <button type="button" className="ct-work" data-testid="class-to-work" onClick={onWork}>
              똑딱업무 둘러보기
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 8h9.5M8.5 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        <div className="sf-grid ct-grid">
          {PLANNED.map((p) => (
            <div
              key={p.title}
              className="sf-card sf-card-soon ct-card"
              aria-label={p.title + ' 준비 중'}
            >
              <span className="ct-soon">준비 중</span>
              <span className="sf-card-title">{p.title}</span>
              <span className="sf-card-sum">{p.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
