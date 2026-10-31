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
import iconMindmap from './assets/file-mindmap.svg'
import iconEpub from './assets/file-epub.svg'
import { ClassTools } from './ClassTools'
import { HubTiles, type HubPage } from './HubTiles'
import { SpecialFeatures } from './SpecialFeatures'
import './trial-home.css'

/**
 * The web trial's home (program/web): one job, made obvious. Open a document
 * of yours or start a blank one, then tell the AI beside it what to
 * change. Everything the desktop home offers for managing files on a PC stays in
 * the desktop app.
 */

const ICONS: Record<string, string> = {
  hwp: iconHwp,
  hwpx: iconHwp,
  docx: iconDocx,
  doc: iconDocx,
  xlsx: iconXlsx,
  xls: iconXlsx,
  csv: iconXlsx,
  pptx: iconPptx,
  pdf: iconPdf,
  md: iconMd,
  html: iconHtml,
  htm: iconHtml,
  xmind: iconMindmap,
  epub: iconEpub,
}

interface NewItem {
  ext: string
  label: string
  hint: string
  make: () => Promise<void>
}

const NEW_ITEMS: NewItem[] = [
  {
    ext: 'hwp',
    label: '한글 문서',
    hint: '가정통신문 초안 써 줘',
    make: () => window.aiOffice.newHwp(),
  },
  {
    ext: 'docx',
    label: '워드 문서',
    hint: '회의록 양식 만들어 줘',
    make: () => window.aiOffice.newDoc(),
  },
  {
    ext: 'xlsx',
    label: '엑셀 표',
    hint: '월별 지출표 만들어 줘',
    make: () => window.aiOffice.newSheet(),
  },
  {
    ext: 'pptx',
    label: 'PPT 발표 자료',
    hint: '수업 소개 5장 만들어 줘',
    make: () => window.aiOffice.newSlide(),
  },
  {
    ext: 'pdf',
    label: 'PDF 문서',
    hint: '안내문 한 장 만들어 줘',
    make: () => window.aiOffice.newPdf(),
  },
  {
    ext: 'md',
    label: '마크다운',
    hint: '업무 메모를 정리해 줘',
    make: () => window.aiOffice.newMarkdown(),
  },
  {
    ext: 'html',
    label: 'HTML 페이지',
    hint: '행사 안내 페이지 만들어 줘',
    make: () => window.aiOffice.newHtml(),
  },
  {
    ext: 'xmind',
    label: '마인드맵',
    hint: '단원 개념 지도 그려 줘',
    make: () => window.aiOffice.newMindmap(),
  },
]

function Icon({ ext, size }: { ext: string; size: number }): ReactElement {
  const src = ICONS[ext] ?? iconDocx
  return <img src={src} width={size} height={size} alt="" aria-hidden="true" draggable={false} />
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
  const recents = useRecents()
  const [dragging, setDragging] = useState(false)
  const [page, setPage] = useState<HubPage | null>(null)

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

  if (page) {
    return (
      <div className="trial">
        {page === 'work' ? (
          <SpecialFeatures variant="web" onExit={() => setPage(null)} />
        ) : (
          <ClassTools variant="web" onExit={() => setPage(null)} onWork={() => setPage('work')} />
        )}
      </div>
    )
  }

  return (
    <div className={'trial' + (dragging ? ' is-dragging' : '')}>
      <div className="trial-glow" aria-hidden="true" />
      <main className="trial-main">
        <header className="trial-hero">
          <span className="trial-eyebrow">
            <i aria-hidden="true" />
            한글 · 워드 · 엑셀 · PPT · PDF 모두 AI로
          </span>
          <h1>
            말 한마디면
            <br />
            <em>문서가 고쳐져요</em>
          </h1>
          <p>
            문서를 열고 바꿀 내용을 말하세요. AI가 고친 곳을 보여 드리고, 마음에 들면 저장하면
            끝이에요.
          </p>
        </header>

        <HubTiles
          dragging={dragging}
          uploadTitle="문서 업로드"
          uploadSub="내 문서를 열고 AI에게 말하면 고쳐 줘요. 이 화면에 끌어다 놓아도 돼요."
          testIds={{ upload: 'trial-open', work: 'trial-features', class: 'trial-class' }}
          onUpload={() => void window.aiOffice.browse()}
          onOpen={setPage}
        />

        <section className="trial-section" aria-labelledby="trial-new">
          <div className="trial-section-head">
            <h2 id="trial-new">새 문서 만들기</h2>
            <p>빈 문서를 열고 AI에게 초안을 부탁해 보세요</p>
          </div>
          <div className="trial-tiles">
            {NEW_ITEMS.map((n) => (
              <button
                key={n.ext}
                type="button"
                className="trial-tile"
                data-ext={n.ext}
                onClick={() => void n.make()}
              >
                <Icon ext={n.ext} size={34} />
                <span className="trial-tile-text">
                  <span className="trial-tile-name">{n.label}</span>
                  <span className="trial-tile-hint">“{n.hint}”</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {recents.length > 0 && (
          <section className="trial-section" aria-labelledby="trial-recent">
            <div className="trial-section-head">
              <h2 id="trial-recent">방금 연 문서</h2>
            </div>
            <ul className="trial-recent">
              {recents.map((e) => (
                <li key={e.path}>
                  <button type="button" onClick={() => void window.aiOffice.openPath(e.path)}>
                    <Icon ext={e.ext} size={24} />
                    <span className="trial-recent-name">{e.name}</span>
                    <span className="trial-recent-time">{ago(e.mtimeMs)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="trial-foot">
          <p className="trial-note">체험판은 문서를 잠시만 보관해요. 저장한 뒤 내려받아 두세요.</p>
          <a
            className="trial-maker"
            href="https://classddok.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="trial-maker-mark" aria-hidden="true">
              똑
            </span>
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
