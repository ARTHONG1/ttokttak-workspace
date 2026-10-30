import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { RecentEntry } from '../../shared/home-api'
import iconHwp from './assets/file-hwp.svg'
import iconDocx from './assets/file-docx.svg'
import iconXlsx from './assets/file-xlsx.svg'
import iconPptx from './assets/file-pptx.svg'
import iconPdf from './assets/file-pdf.svg'
import iconMd from './assets/file-md.svg'
import iconHtml from './assets/file-html.svg'
import './trial-home.css'

/**
 * The web trial's home (program/web): one job, made obvious. Open a document
 * (yours, or a sample), then tell the AI beside it what to change. Everything
 * the desktop home offers for managing files on a PC stays in the desktop app.
 */

const ICONS: Record<string, string> = {
  hwp: iconHwp,
  hwpx: iconHwp,
  docx: iconDocx,
  xlsx: iconXlsx,
  xls: iconXlsx,
  csv: iconXlsx,
  pptx: iconPptx,
  pdf: iconPdf,
  md: iconMd,
  html: iconHtml,
}

interface Sample {
  file: string
  title: string
  ext: string
  ask: string
}

const SAMPLES: Sample[] = [
  { file: '사업 추진계획(안).hwpx', title: '사업 추진계획', ext: 'hwpx', ask: '제목을 최종안으로 바꾸고, 3단계 예산을 1,800만 원으로 고쳐 줘' },
  { file: '독서 행사 안내문.docx', title: '독서 행사 안내문', ext: 'docx', ask: '공문서 말투로 다듬고 일시·장소를 목록으로 정리해 줘' },
  { file: '2027 예산표.xlsx', title: '2027 예산표', ext: 'xlsx', ask: '합계 행과 합계 열을 넣고 숫자에 쉼표를 붙여 줘' },
]

const NEW_ITEMS: { ext: string; label: string; make: () => Promise<void> }[] = [
  { ext: 'hwp', label: '한글', make: () => window.aiOffice.newHwp() },
  { ext: 'docx', label: '워드', make: () => window.aiOffice.newDoc() },
  { ext: 'xlsx', label: '엑셀', make: () => window.aiOffice.newSheet() },
  { ext: 'pptx', label: 'PPT', make: () => window.aiOffice.newSlide() },
]

function Icon({ ext, size }: { ext: string; size: number }): ReactElement {
  const src = ICONS[ext] ?? iconDocx
  return <img src={src} width={size} height={size} alt="" aria-hidden="true" />
}

/** where the gateway copied this session's samples (web edition only) */
function useSampleDir(): string | null {
  const [dir, setDir] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/__upload-root', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((info: { samples?: string; sep?: string }) => {
        if (alive && info.samples) setDir(info.samples + (info.sep ?? '/'))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return dir
}

function useRecents(): RecentEntry[] {
  const [entries, setEntries] = useState<RecentEntry[]>([])
  const load = useCallback(() => {
    void window.aiOffice
      .recents({ offset: 0, limit: 6 })
      .then((page) => setEntries(page.entries.filter((e) => !e.missing)))
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    const unsubscribe = window.aiOfficeTabs.onChanged(load)
    return () => {
      window.removeEventListener('focus', load)
      unsubscribe()
    }
  }, [load])
  return entries
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return '방금'
  if (s < 3600) return Math.floor(s / 60) + '분 전'
  return Math.floor(s / 3600) + '시간 전'
}

export function TrialHome(): ReactElement {
  const sampleDir = useSampleDir()
  const recents = useRecents()
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0
    const has = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const enter = (e: DragEvent) => {
      if (!has(e)) return
      depth += 1
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!has(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const reset = () => {
      depth = 0
      setDragging(false)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', reset)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', reset)
      window.removeEventListener('blur', reset)
    }
  }, [])

  const openSample = (s: Sample) => {
    if (sampleDir) void window.aiOffice.openPath(sampleDir + s.file)
  }

  return (
    <div className={'trial' + (dragging ? ' is-dragging' : '')}>
      <main className="trial-main">
        <header className="trial-head">
          <h1>어떤 문서를 고칠까요?</h1>
          <p>문서를 열고 고칠 내용을 말하면, AI가 바로 고쳐 드려요.</p>
        </header>

        <button type="button" className="trial-drop" data-testid="trial-open" onClick={() => void window.aiOffice.browse()}>
          <span className="trial-drop-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 15V4.5M7.5 9l4.5-4.5L16.5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 14.5v3A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="trial-drop-title">{dragging ? '여기에 놓으면 열려요' : '내 문서 열기'}</span>
          <span className="trial-drop-sub">파일을 끌어다 놓거나 눌러서 고르세요 · HWP, HWPX, DOCX, XLSX, PPTX, PDF</span>
        </button>

        <section className="trial-section" aria-labelledby="trial-samples">
          <h2 id="trial-samples">예시 문서로 해 보기</h2>
          <div className="trial-samples">
            {SAMPLES.map((s) => (
              <button key={s.file} type="button" className="trial-sample" disabled={!sampleDir} onClick={() => openSample(s)}>
                <Icon ext={s.ext} size={36} />
                <span className="trial-sample-title">{s.title}</span>
                <span className="trial-sample-ask">“{s.ask}”</span>
                <span className="trial-sample-go">열어 보기</span>
              </button>
            ))}
          </div>
        </section>

        {recents.length > 0 && (
          <section className="trial-section" aria-labelledby="trial-recent">
            <h2 id="trial-recent">방금 연 문서</h2>
            <ul className="trial-recent">
              {recents.map((e) => (
                <li key={e.path}>
                  <button type="button" onClick={() => void window.aiOffice.openPath(e.path)}>
                    <Icon ext={e.ext} size={22} />
                    <span className="trial-recent-name">{e.name}</span>
                    <span className="trial-recent-time">{ago(e.mtimeMs)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="trial-foot">
          <div className="trial-new" aria-label="빈 문서 만들기">
            <span>빈 문서로 시작</span>
            {NEW_ITEMS.map((n) => (
              <button key={n.ext} type="button" onClick={() => void n.make()}>
                <Icon ext={n.ext} size={16} />
                {n.label}
              </button>
            ))}
          </div>
          <p className="trial-note">체험판은 문서를 잠시만 보관해요. 저장한 뒤 내려받아 두세요.</p>
          <a className="trial-maker" href="https://classddok.com" target="_blank" rel="noopener noreferrer">
            <span className="trial-maker-mark" aria-hidden="true">똑</span>
            <span className="trial-maker-text">
              <b>인천봉수초 홍찬우가 만들었어요</b>
              <span>수업과 업무를 덜어 주는 다른 도구는 클래스똑딱에서 만나 보세요</span>
            </span>
            <span className="trial-maker-go">classddok.com ↗</span>
          </a>
        </footer>
      </main>
    </div>
  )
}
