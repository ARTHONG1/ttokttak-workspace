import type { ReactElement, ReactNode } from 'react'
import './hub-tiles.css'

/**
 * The three ways into the app, side by side on both homes: 문서 업로드 (open a document and
 * edit it with the AI), 똑딱업무 (the 특화 기능 work tools) and 똑딱수업 (class tools, coming).
 */

export type HubPage = 'work' | 'class'

function Arrow(): ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8h9.5M8.5 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const UploadIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 15V4.5M7.5 9l4.5-4.5L16.5 9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.5 14.5v3A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2v-3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

const WorkIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3.5" y="7" width="17" height="12.5" rx="2.6" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7"
      stroke="currentColor"
      strokeWidth="1.9"
    />
    <path d="M3.5 12.2h17" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M10.5 12.2v1.6h3v-1.6"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
  </svg>
)

const ClassIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M2.8 9.2 12 4.6l9.2 4.6L12 13.8 2.8 9.2Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
    <path
      d="M6.4 11.1v4.4c0 1.4 2.5 3 5.6 3s5.6-1.6 5.6-3v-4.4"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
    <path d="M21.2 9.2v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
)

function Tile({
  hub,
  icon,
  title,
  badge,
  sub,
  chips,
  go,
  onClick,
  dragging,
  testId,
}: {
  hub: 'upload' | HubPage
  icon: ReactNode
  title: string
  badge?: string
  sub: string
  chips: string[]
  go: string
  onClick: () => void
  dragging?: boolean
  testId: string
}): ReactElement {
  return (
    <button
      type="button"
      className={'hub-tile' + (dragging ? ' is-dragging' : '')}
      data-hub={hub}
      data-testid={testId}
      onClick={onClick}
    >
      <span className="hub-mark" aria-hidden="true">
        {icon}
      </span>
      <span className="hub-top">
        <span className="hub-icon">{icon}</span>
        {badge && <span className="hub-badge">{badge}</span>}
      </span>
      <span className="hub-title">{title}</span>
      <span className="hub-sub">{sub}</span>
      <span className="hub-chips" aria-hidden="true">
        {chips.map((c) => (
          <span key={c} className="hub-chip">
            {c}
          </span>
        ))}
      </span>
      <span className="hub-go" aria-hidden="true">
        {go}
        <Arrow />
      </span>
    </button>
  )
}

export function HubTiles({
  onUpload,
  onOpen,
  dragging = false,
  uploadTitle = '문서 업로드',
  uploadSub = '한글·워드·엑셀·PPT·PDF를 열고, AI에게 말해서 고쳐요.',
  uploadGo = '파일 고르기',
  testIds = { upload: 'hub-upload', work: 'hub-work', class: 'hub-class' },
}: {
  onUpload: () => void
  onOpen: (page: HubPage) => void
  dragging?: boolean
  uploadTitle?: string
  uploadSub?: string
  uploadGo?: string
  testIds?: { upload: string; work: string; class: string }
}): ReactElement {
  return (
    <div className="hub-wrap">
      <nav className="hub" aria-label="시작하기">
        <Tile
          hub="upload"
          icon={<UploadIcon />}
          title={dragging ? '여기에 놓으세요' : uploadTitle}
          sub={dragging ? '놓으면 바로 열려요.' : uploadSub}
          chips={['HWP', 'DOCX', 'XLSX', 'PDF', '+7']}
          go={uploadGo}
          onClick={onUpload}
          dragging={dragging}
          testId={testIds.upload}
        />
        <Tile
          hub="work"
          icon={<WorkIcon />}
          title="똑딱업무"
          badge="NEW"
          sub="품의서, 퀴즈처럼 학교 업무 문서를 양식에 맞춰 만들어요."
          chips={['품의서 생성', '똑딱퀴즈']}
          go="업무 도구 열기"
          onClick={() => onOpen('work')}
          testId={testIds.work}
        />
        <Tile
          hub="class"
          icon={<ClassIcon />}
          title="똑딱수업"
          badge="준비 중"
          sub="수업 시간에 바로 쓰는 도구가 이곳에 차례로 들어와요."
          chips={['곧 공개']}
          go="미리 보기"
          onClick={() => onOpen('class')}
          testId={testIds.class}
        />
      </nav>
    </div>
  )
}
