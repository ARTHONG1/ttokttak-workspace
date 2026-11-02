import { useState } from 'react'
import type { ReactElement } from 'react'
import { Back, Modal } from './special-common'
import './special-features.css'

/**
 * 똑딱수업: classroom activity tools opened from the home screen (desktop and web).
 * ACE 명화 ("나도 미술가, AI와 함께하는 명화 따라잡기!") is the first live classroom tool.
 */

export const ACE_CANVAS_TITLE = 'ACE 명화'
export const ACE_CANVAS_SUBTITLE = '나도 미술가, AI와 함께하는 명화 따라잡기!'
export const ACE_CANVAS_SUMMARY =
  '그림을 관찰하고 생각을 글로 표현하며 AI와 함께 작품을 완성하는 참여형 미술 수업 앱이에요.'
export const ACE_CANVAS_DESCRIPTION =
  '「나도 미술가, AI와 함께하는 명화 따라잡기!」는 그림을 관찰하고 생각을 글로 표현하며 AI와 함께 작품을 완성하는 참여형 미술 수업 앱입니다. 선생님이 명화나 창작 주제를 정해 수업을 열면, 학생들은 QR 코드나 방 코드로 접속해 닉네임만으로 참여합니다. 명화 모드에서는 작품의 색과 구도, 분위기를 자세히 묘사하고, 주제 모드에서는 주어진 주제에 어울리는 장면을 상상해 글로 설명합니다. 이후 친구들의 설명을 읽고 투표하며, 주제 모드에서는 AI 심사 점수도 함께 반영해 순위를 정합니다. 선생님은 선정된 설명을 AI 그림으로 만들어 학생들과 함께 감상하고 비교할 수 있습니다. 관찰에서 글쓰기, 투표와 작품 감상으로 이어지는 활동을 통해 학생들은 자신의 생각을 구체적으로 표현하고 서로 다른 시선을 발견합니다.'
export const ACE_CANVAS_VIDEO_ID = '1wl_L17E8R4'
export const ACE_CANVAS_VIDEO_URL = 'https://youtu.be/1wl_L17E8R4'
export const ACE_CANVAS_EMBED_URL = 'https://www.youtube.com/embed/1wl_L17E8R4?rel=0'
export const ACE_CANVAS_APP_URL =
  'https://ace-canvas--project-0c1d3dab-8644-4690-9e4.asia-east1.hosted.app/'

const PLANNED = [
  { title: '수업 활동지', sub: '학습 목표에 맞춘 활동지와 정리 학습지' },
  { title: '모둠 활동', sub: '모둠 나누기, 역할 정하기, 발표 순서' },
  { title: '형성 평가', sub: '수업 끝에 바로 보는 짧은 확인 문제' },
]

function PaletteIcon(): ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5a8.5 8.5 0 0 0-8.5 8.5c0 4.7 3.8 8.5 8.5 8.5h1.4a2.4 2.4 0 0 0 2.4-2.4c0-.6-.2-1.2-.6-1.6-.4-.4-.6-.9-.6-1.5 0-1.3 1.1-2.4 2.4-2.4h1.1A2.4 2.4 0 0 0 20.5 10c0-3.6-3.8-6.5-8.5-6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="8.2" cy="9.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="7.8" r="1.2" fill="currentColor" />
      <circle cx="15.6" cy="9.6" r="1.2" fill="currentColor" />
      <circle cx="8.6" cy="13.6" r="1.2" fill="currentColor" />
    </svg>
  )
}

function ExternalArrow(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5 11 11 5M6 5h5v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function openClassLink(
  e: React.MouseEvent<HTMLAnchorElement>,
  site: 'aceCanvas' | 'aceCanvasVideo',
): void {
  if (document.documentElement.dataset.edition === 'web') return
  if (typeof window.aiOffice?.openFeatureLink === 'function') {
    e.preventDefault()
    void window.aiOffice.openFeatureLink(site)
  }
}

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
  const [showDesc, setShowDesc] = useState(false)

  return (
    <div className={'sf sf-' + variant} data-testid="class-tools">
      {onExit && (
        <div className="sf-page-bar">
          <Back onClick={onExit} label="처음 화면" />
        </div>
      )}
      <div className="sf-list">
        <header className="sf-head ct-head">
          <div>
            <span className="sf-eyebrow ct-eyebrow">똑딱수업</span>
            <h1>수업 시간에 바로 쓰는 도구</h1>
            <p>선생님이 열고 학생들이 QR·방 코드로 참여하는 수업 도구예요. 도구는 계속 늘어납니다.</p>
          </div>
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
        </header>

        <article
          className="sf-card ct-feature-card"
          data-testid="class-tool-ace-canvas"
          aria-label={ACE_CANVAS_TITLE}
        >
          <div className="ct-feature-body">
            <div className="ct-feature-top">
              <span className="sf-card-icon ct-feature-icon">
                <PaletteIcon />
              </span>
              <span className="ct-badge">참여형 미술 수업</span>
            </div>
            <h2 className="ct-feature-title">{ACE_CANVAS_TITLE}</h2>
            <p className="ct-feature-sub">{ACE_CANVAS_SUBTITLE}</p>
            <p className="ct-feature-sum">{ACE_CANVAS_SUMMARY}</p>
            <div className="sf-tags ct-feature-tags">
              <span className="sf-tag">명화 관찰·묘사</span>
              <span className="sf-tag">QR·방 코드 참여</span>
              <span className="sf-tag">투표·AI 심사</span>
              <span className="sf-tag">AI 그림 생성</span>
            </div>
            <div className="ct-feature-actions">
              <a
                href={ACE_CANVAS_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ct-btn-primary"
                data-testid="class-tool-ace-canvas-open"
                onClick={(e) => openClassLink(e, 'aceCanvas')}
              >
                바로가기
                <ExternalArrow />
              </a>
              <button
                type="button"
                className="ct-btn-secondary"
                data-testid="class-tool-ace-canvas-desc"
                onClick={() => setShowDesc(true)}
              >
                설명
              </button>
              <a
                href={ACE_CANVAS_VIDEO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ct-video-link"
                data-testid="class-tool-ace-canvas-video-link"
                onClick={(e) => openClassLink(e, 'aceCanvasVideo')}
              >
                유튜브에서 영상 보기 ↗
              </a>
            </div>
          </div>

          <div className="ct-video-wrap" data-testid="class-tool-ace-canvas-video">
            <iframe
              src={ACE_CANVAS_EMBED_URL}
              title="ACE 명화 — 나도 미술가, AI와 함께하는 명화 따라잡기 설명 영상"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </article>

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

      {showDesc && (
        <Modal title="ACE 명화 상세 소개" onClose={() => setShowDesc(false)} wide>
          <div className="ct-desc-modal" data-testid="class-tool-ace-canvas-modal">
            <h3 className="ct-desc-heading">{ACE_CANVAS_SUBTITLE}</h3>
            <p className="ct-desc-paragraph">{ACE_CANVAS_DESCRIPTION}</p>
            <div className="ct-desc-foot">
              <a
                href={ACE_CANVAS_VIDEO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ct-btn-secondary"
                onClick={(e) => openClassLink(e, 'aceCanvasVideo')}
              >
                설명 영상 보기 ↗
              </a>
              <a
                href={ACE_CANVAS_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ct-btn-primary"
                onClick={(e) => openClassLink(e, 'aceCanvas')}
              >
                ACE 명화 바로가기
                <ExternalArrow />
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
