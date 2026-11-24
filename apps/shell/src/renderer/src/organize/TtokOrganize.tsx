import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type {
  OrganizeCard,
  OrganizeFile,
  OrganizeOpenResult,
  OrganizeRunResult,
  OrganizeSplitMode,
  OrganizeUnit,
  OrganizeUnitsResult,
} from '../../../shared/organize-api'
import { isWebEdition } from '../edition'
import { Back, ToastView, useToast } from '../special-common'
import { useFileDrop } from '../use-file-drop'
import '../convert/ttok-convert.css'
import './ttok-organize.css'

/**
 * 똑딱업무 > 똑딱정리: documents in, the tidy-ups they can have as cards (only those), the
 * picked one set up and done, and the result downloaded in the document's own format. A card
 * whose result may differ from the original says so with 주의. The main process holds the
 * files and does the work; this page shows the way and hands the bytes to the save.
 */

GlobalWorkerOptions.workerSrc = workerUrl
function docOptions() {
  const assets = new URL('pdfjs/', document.baseURI).href
  return {
    cMapUrl: assets + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: assets + 'standard_fonts/',
    wasmUrl: assets + 'wasm/',
    isEvalSupported: false,
  }
}

type Opened = Extract<OrganizeOpenResult, { ok: true }>
type Made = Extract<OrganizeRunResult, { ok: true }>
type Units = Extract<OrganizeUnitsResult, { ok: true }>

type View =
  | { at: 'pick' }
  | { at: 'choose'; doc: Opened }
  | { at: 'setup'; doc: Opened; card: OrganizeCard }
  | { at: 'running'; doc: Opened; card: OrganizeCard; label: string }
  | { at: 'done'; doc: Opened; card: OrganizeCard; made: Made }
  | { at: 'failed'; doc: Opened; card: OrganizeCard; error: string }

const STAGES = ['문서 올리기', '정리 고르기', '정리하기', '내려받기']

const stageOf = (view: View): number =>
  view.at === 'pick' ? 1 : view.at === 'choose' ? 2 : view.at === 'done' ? 4 : 3

function sizeText(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

const FAMILY_LABEL: Record<Opened['family'], string> = {
  pdf: 'PDF',
  hangul: '한글',
  docx: '워드',
  pptx: 'PPT',
}

export function OrganizeIcon(): ReactElement {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <rect
        x="13.5"
        y="3.5"
        width="7"
        height="5.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13.5"
        y="12"
        width="7"
        height="8.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="3.5"
        y="15.5"
        width="7"
        height="5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function ActionIcon({ action }: { action: OrganizeCard['action'] }): ReactElement {
  const common = {
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {action === 'merge' ? (
        <>
          <rect x="3" y="4" width="7" height="9" rx="1.5" {...common} />
          <rect x="14" y="4" width="7" height="9" rx="1.5" {...common} />
          <path d="M6.5 15.5v1.5a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3v-1.5M12 20v-3" {...common} />
        </>
      ) : action === 'split' ? (
        <>
          <rect x="7" y="3" width="10" height="12" rx="1.5" {...common} />
          <path d="M5 21l3-3M19 21l-3-3M12 15v6" {...common} />
        </>
      ) : action === 'remove' ? (
        <>
          <rect x="5" y="3" width="11" height="14" rx="1.5" {...common} />
          <path d="M15 15l5 5M20 15l-5 5" {...common} />
        </>
      ) : (
        <>
          <rect x="5" y="3" width="14" height="18" rx="2" {...common} />
          <path d="M12 7v6m0 0-2.5-2.5M12 13l2.5-2.5M9 17h6" {...common} />
        </>
      )}
    </svg>
  )
}

function LockIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** where the documents go: nowhere but this run */
function PrivacyNote(): ReactElement {
  return (
    <p className="to-privacy" data-testid="to-privacy">
      <LockIcon />
      <span>
        {isWebEdition()
          ? '올린 문서는 이 정리에만 쓰고 따로 보관하지 않아요. AI도 쓰지 않아요. 창을 닫으면 작업 공간과 함께 지워지고, 원본은 그대로예요.'
          : '문서는 이 컴퓨터 안에서만 정리해요. 인터넷으로 보내거나 어디에 따로 저장하지 않아요. AI도 쓰지 않아요. 원본은 그대로 두고, 결과는 내려받을 때 고른 곳에만 저장돼요.'}
      </span>
    </p>
  )
}

function Badge({ extension }: { extension: string }): ReactElement {
  return <span className={'tc-badge tc-badge-' + extension}>{extension.toUpperCase()}</span>
}

function Caution({ text }: { text: string }): ReactElement {
  return (
    <span className="to-caution">
      <span className="to-caution-tag">주의</span>
      {text}
    </span>
  )
}

/** a PDF page drawn small, once it scrolls into view */
function PdfThumb({ pdf, page }: { pdf: PDFDocumentProxy; page: number }): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true)
        watch.disconnect()
      }
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  useEffect(() => {
    if (!seen) return
    let cancelled = false
    void (async () => {
      try {
        const p = await pdf.getPage(page + 1)
        const base = p.getViewport({ scale: 1 })
        const viewport = p.getViewport({ scale: Math.min(1, 300 / base.width) })
        const el = canvas.current
        if (!el || cancelled) return
        el.width = Math.round(viewport.width)
        el.height = Math.round(viewport.height)
        await p.render({ canvas: el, viewport }).promise
      } catch {
        // a page that does not draw stays blank; its number still shows
      }
    })()
    return () => {
      cancelled = true
    }
  }, [seen, pdf, page])
  return <canvas ref={canvas} className="to-thumb-page" />
}

/** a Hangul page drawn by the engine, fetched once it scrolls into view */
function SvgThumb({
  token,
  fileId,
  page,
}: {
  token: string
  fileId: string
  page: number
}): ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let cancelled = false
    const watch = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      watch.disconnect()
      void window.aiOffice
        .organizePageSvg(token, fileId, page)
        .then((s) => {
          if (!cancelled) setSvg(s)
        })
        .catch(() => {
          if (!cancelled) setSvg(null)
        })
    })
    watch.observe(el)
    return () => {
      cancelled = true
      watch.disconnect()
    }
  }, [token, fileId, page])
  return (
    <div ref={box} className="to-thumb-svg">
      {svg ? (
        <img
          src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)}
          className="to-thumb-page"
          alt=""
          draggable={false}
        />
      ) : svg === undefined ? (
        <span className="sf-spinner" aria-hidden="true" />
      ) : null}
    </div>
  )
}

/** the pages (slides, parts) of a document as tiles to pick */
function UnitPicker({
  token,
  file,
  units,
  picked,
  onPick,
  tone,
}: {
  token: string
  file: OrganizeFile
  units: Units
  picked: Set<number>
  onPick: (next: Set<number>) => void
  /** 'remove': picked tiles are crossed out; 'keep': picked tiles are marked kept */
  tone: 'remove' | 'keep'
}): ReactElement {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  useEffect(() => {
    if (units.preview !== 'pdf') return
    setPdf(null)
    let cancelled = false
    let task: ReturnType<typeof getDocument> | null = null
    void (async () => {
      try {
        const bytes = await window.aiOffice.organizePdfBytes(token, file.id)
        if (!bytes || cancelled) return
        task = getDocument({ data: bytes, ...docOptions() })
        const doc = await task.promise
        if (!cancelled) setPdf(doc)
      } catch {
        // without pictures the tiles still show their page numbers
      }
    })()
    return () => {
      cancelled = true
      void task?.destroy().catch(() => {})
    }
  }, [token, file.id, units.preview])
  const toggle = (i: number): void => {
    const next = new Set(picked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onPick(next)
  }
  return (
    <div className="to-picker">
      <div className="to-picker-bar">
        <span>
          {units.units.length}
          {units.word === '슬라이드' ? '장' : units.word === '쪽' ? '쪽' : '개 부분'} 중{' '}
          <b>{picked.size}</b>개 고름
        </span>
        <button
          type="button"
          className="sf-secondary sf-sm"
          onClick={() => onPick(new Set(units.units.map((u) => u.index)))}
        >
          모두 고르기
        </button>
        <button type="button" className="sf-secondary sf-sm" onClick={() => onPick(new Set())}>
          모두 풀기
        </button>
      </div>
      {units.note && <p className="to-note">{units.note}</p>}
      <ul className={'to-tiles to-tiles-' + units.preview} role="list">
        {units.units.map((u: OrganizeUnit) => {
          const on = picked.has(u.index)
          return (
            <li key={u.index}>
              <button
                type="button"
                className={'to-tile' + (on ? ' is-on to-tile-' + tone : '')}
                aria-pressed={on}
                data-testid={'to-unit-' + u.index}
                onClick={() => toggle(u.index)}
              >
                <span className="to-tile-face">
                  {units.preview === 'pdf' && pdf ? (
                    <PdfThumb pdf={pdf} page={u.index} />
                  ) : units.preview === 'svg' ? (
                    <SvgThumb token={token} fileId={file.id} page={u.index} />
                  ) : (
                    <span className="to-tile-text">{u.text || '(글 없음)'}</span>
                  )}
                  <span className="to-tile-check" aria-hidden="true">
                    {on ? (tone === 'remove' ? '✕' : '✓') : ''}
                  </span>
                </span>
                <span className="to-tile-label">
                  {u.label}
                  {u.joinedToPrevious && (
                    <em title="앞 쪽의 표나 문단이 이어진 쪽이에요. 앞 쪽과 함께 고르세요.">
                      앞 쪽과 이어짐
                    </em>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function TtokOrganize({ onBack }: { onBack: () => void }): ReactElement {
  const [view, setView] = useState<View>({ at: 'pick' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, say] = useToast()
  const token = view.at === 'pick' ? null : view.doc.token
  const busyRef = useRef(false)
  const savingRef = useRef(false)
  const requestRef = useRef(0)
  const unitsRequestRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    const requests = requestRef
    const unitsRequests = unitsRequestRef
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requests.current++
      unitsRequests.current++
    }
  }, [])

  // setup state
  const [order, setOrder] = useState<string[]>([])
  const [units, setUnits] = useState<Units | null>(null)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [splitMode, setSplitMode] = useState<OrganizeSplitMode>('each')
  const [every, setEvery] = useState(2)

  useEffect(() => {
    return window.aiOffice.onOrganizeProgress((progress) => {
      setView((v) =>
        v.at === 'running' && v.doc.token === progress.token ? { ...v, label: progress.label } : v,
      )
    })
  }, [])

  // let the main process forget the files when this page goes or another set comes in
  useEffect(() => {
    if (!token) return
    return () => {
      void window.aiOffice.closeOrganize(token).catch((err) => {
        console.warn('[organize] close failed', err)
      })
    }
  }, [token])

  const openWith = async (get: () => Promise<OrganizeOpenResult | null>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    const request = ++requestRef.current
    setError(null)
    setBusy(true)
    try {
      const result = await get()
      if (!mountedRef.current || request !== requestRef.current) {
        if (result?.ok) void window.aiOffice.closeOrganize(result.token).catch(() => {})
        return
      }
      if (!result) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      unitsRequestRef.current++
      setView({ at: 'choose', doc: result })
    } catch (err) {
      console.warn('[organize] open failed', err)
      if (mountedRef.current && request === requestRef.current)
        setError('문서를 열지 못했어요. 다시 해 주세요.')
    } finally {
      busyRef.current = false
      if (mountedRef.current && request === requestRef.current) setBusy(false)
    }
  }
  const pickDocuments = (): Promise<void> => openWith(() => window.aiOffice.openOrganizeDocuments())

  const addWith = async (get: () => Promise<OrganizeOpenResult | null>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    const request = ++requestRef.current
    setError(null)
    setBusy(true)
    try {
      const result = await get()
      if (!mountedRef.current || request !== requestRef.current) return
      if (!result) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      const merge = result.cards.find((c) => c.action === 'merge')
      if (!merge) {
        setError('합칠 문서를 다시 골라 주세요.')
        return
      }
      unitsRequestRef.current++
      setOrder(result.files.map((f) => f.id))
      setView({ at: 'setup', doc: result, card: merge })
    } catch (err) {
      console.warn('[organize] add failed', err)
      if (mountedRef.current && request === requestRef.current)
        setError('문서를 더하지 못했어요. 다시 해 주세요.')
    } finally {
      busyRef.current = false
      if (mountedRef.current && request === requestRef.current) setBusy(false)
    }
  }
  const addDocuments = (doc: Opened): Promise<void> =>
    addWith(() => window.aiOffice.addOrganizeDocuments(doc.token))

  // documents dragged onto the page: taken here, so they do not open as editor tabs. On the
  // first step they are the documents to tidy; with documents up (cards or a setup) they join
  // them for a merge; after a result they start a new set
  const dropDocuments = (paths: string[]): void => {
    if (busy || view.at === 'running') return say('정리하는 중이에요. 끝난 뒤 올려 주세요.')
    if (paths.length === 0)
      return setError('놓은 파일을 읽지 못했어요. [문서 올리기]로 골라 주세요.')
    if (view.at === 'choose' || view.at === 'setup') {
      const doc = view.doc
      void addWith(() => window.aiOffice.addOrganizePaths(doc.token, paths))
    } else void openWith(() => window.aiOffice.openOrganizePaths(paths))
  }
  const { over: dropOver, handlers: dropHandlers } = useFileDrop(dropDocuments)

  const run = async (doc: Opened, card: OrganizeCard): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    const request = ++requestRef.current
    unitsRequestRef.current++
    setBusy(true)
    setView({ at: 'running', doc, card, label: '준비하는 중' })
    try {
      const result = await window.aiOffice.runOrganize({
        token: doc.token,
        action: card.action,
        ...(card.action === 'merge' ? { order } : {}),
        ...(card.action === 'remove' ? { remove: [...picked] } : {}),
        ...(card.action === 'split'
          ? {
              split: {
                mode: splitMode,
                ...(splitMode === 'every' ? { every } : {}),
                ...(splitMode === 'pick' ? { pick: [...picked] } : {}),
              },
            }
          : {}),
      })
      if (!mountedRef.current || request !== requestRef.current) return
      setView(
        result.ok
          ? { at: 'done', doc, card, made: result }
          : { at: 'failed', doc, card, error: result.error },
      )
    } catch (err) {
      console.warn('[organize] run failed', err)
      if (mountedRef.current && request === requestRef.current)
        setView({ at: 'failed', doc, card, error: '정리하지 못했어요. 다시 해 주세요.' })
    } finally {
      busyRef.current = false
      if (mountedRef.current && request === requestRef.current) setBusy(false)
    }
  }

  const openCard = (doc: Opened, card: OrganizeCard): void => {
    if (busyRef.current) return
    const unitsRequest = ++unitsRequestRef.current
    setError(null)
    if (card.action === 'shrink') {
      void run(doc, card)
      return
    }
    if (card.action === 'merge' && doc.files.length < 2) {
      void addDocuments(doc)
      return
    }
    setOrder(doc.files.map((f) => f.id))
    setPicked(new Set())
    setSplitMode('each')
    setUnits(null)
    setUnitsError(null)
    setView({ at: 'setup', doc, card })
    if (card.action === 'split' || card.action === 'remove') {
      void window.aiOffice
        .organizeUnits(doc.token, doc.files[0]!.id)
        .then((r) => {
          if (!mountedRef.current || unitsRequest !== unitsRequestRef.current) return
          if (r.ok) setUnits(r)
          else setUnitsError(r.error)
        })
        .catch((err) => {
          console.warn('[organize] units failed', err)
          if (mountedRef.current && unitsRequest === unitsRequestRef.current)
            setUnitsError('쪽을 읽지 못했어요. 다시 정리 방법을 골라 주세요.')
        })
    }
  }

  const download = async (doc: Opened, made: Made): Promise<void> => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      const path = await window.aiOffice.saveFeatureFile({
        name: made.fileName,
        filterName: made.extension === 'zip' ? 'ZIP 파일' : FAMILY_LABEL[doc.family] + ' 문서',
        extensions: [made.extension],
        bytes: made.bytes,
      })
      if (path && mountedRef.current) say('저장했어요.')
    } catch (err) {
      console.warn('[organize] save failed', err)
      if (mountedRef.current) say('저장하지 못했어요. 다시 해 주세요.', true)
    } finally {
      savingRef.current = false
    }
  }

  const stage = stageOf(view)
  const filesById = useMemo(
    () => new Map(view.at === 'pick' ? [] : view.doc.files.map((f) => [f.id, f])),
    [view],
  )

  const move = (i: number, by: number): void => {
    const next = [...order]
    const [item] = next.splice(i, 1)
    next.splice(i + by, 0, item!)
    setOrder(next)
  }

  const runLabel = (card: OrganizeCard): string => {
    if (card.action === 'merge') return order.length + '개 문서 합치기'
    if (card.action === 'remove')
      return picked.size > 0 ? picked.size + '개 빼고 만들기' : '뺄 것을 골라 주세요'
    if (splitMode === 'pick')
      return picked.size > 0
        ? '고른 ' + picked.size + '개로 새 파일 만들기'
        : '남길 것을 골라 주세요'
    return '나누기'
  }

  const canRun = (doc: Opened, card: OrganizeCard): boolean => {
    if (card.action === 'merge') return order.length >= 2
    if (!units) return false
    if (card.action === 'remove') return picked.size > 0 && picked.size < units.units.length
    if (splitMode === 'pick') return picked.size > 0
    return doc.files.length === 1
  }

  return (
    <div
      className={'sf-page tc-root to-root' + (dropOver ? ' is-drop-over' : '')}
      data-organize-token={token ?? undefined}
      data-testid="to-root"
      {...dropHandlers}
    >
      <div className="sf-page-bar">
        <Back onClick={onBack} label="똑딱업무" />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon tc-head-icon">
          <OrganizeIcon />
        </span>
        <div className="sf-page-title">
          <h1>똑딱정리</h1>
          <p>
            문서를 올리면 할 수 있는 정리만 카드로 보여 드려요. 합치기·나누기·쪽 지우기·용량
            줄이기를 원래 형식 그대로 해요.
          </p>
        </div>
      </header>

      <ol className="tc-stages" aria-label="진행 순서">
        {STAGES.map((label, i) => (
          <li key={label} className={stage === i + 1 ? 'is-now' : stage > i + 1 ? 'is-done' : ''}>
            <span className="tc-stage-no">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <PrivacyNote />

      {view.at === 'pick' ? (
        <section className={'tc-drop' + (dropOver ? ' is-over' : '')}>
          <span className="tc-drop-icon">
            <OrganizeIcon />
          </span>
          <h2>정리할 문서를 올려 주세요</h2>
          <p>한글(HWP·HWPX)·워드(DOCX)·PPT(PPTX)·PDF를 올릴 수 있어요.</p>
          <p className="to-drop-hint">
            여기에 끌어다 놓거나 [문서 올리기]로 고르세요. 같은 종류 문서를 여러 개 올리면 합치기를
            할 수 있어요.
          </p>
          <button
            type="button"
            className="sf-primary tc-drop-button"
            data-testid="to-open"
            disabled={busy}
            onClick={() => void pickDocuments()}
          >
            {busy && <span className="sf-spinner" aria-hidden="true" />}
            문서 올리기
          </button>
          {error && (
            <em className="sf-error" role="alert">
              {error}
            </em>
          )}
        </section>
      ) : (
        <>
          <div className="tc-file to-files">
            <ul className="to-file-list">
              {view.doc.files.map((f) => (
                <li key={f.id}>
                  <Badge extension={f.extension} />
                  <span className="tc-file-name" title={f.name + '.' + f.extension}>
                    {f.name}
                    <small>
                      .{f.extension} · {sizeText(f.size)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            <div className="to-file-actions">
              {view.at === 'choose' && (
                <button
                  type="button"
                  className="sf-secondary tc-file-change"
                  data-testid="to-add-more"
                  disabled={busy}
                  onClick={() => void addDocuments(view.doc)}
                >
                  {FAMILY_LABEL[view.doc.family]} 문서 더 올리기
                </button>
              )}
              <button
                type="button"
                className="sf-secondary tc-file-change"
                disabled={view.at === 'running' || busy}
                onClick={() => void pickDocuments()}
              >
                다른 문서로 바꾸기
              </button>
            </div>
          </div>
          {error && (
            <em className="sf-error" role="alert">
              {error}
            </em>
          )}

          {view.at === 'choose' && (
            <>
              <h2 className="tc-section-title">어떻게 정리할까요?</h2>
              <div className="tc-cards to-cards" role="list">
                {view.doc.cards.map((card) => (
                  <button
                    type="button"
                    role="listitem"
                    key={card.action}
                    className={'tc-card to-card' + (card.caution ? ' has-caution' : '')}
                    data-testid={'to-card-' + card.action}
                    disabled={busy}
                    onClick={() => openCard(view.doc, card)}
                  >
                    <span className="to-card-icon">
                      <ActionIcon action={card.action} />
                    </span>
                    <span className="tc-card-title">{card.title}</span>
                    <span className="tc-card-sum">{card.summary}</span>
                    {card.caution && <Caution text={card.caution} />}
                  </button>
                ))}
              </div>
            </>
          )}

          {view.at === 'setup' && (
            <section className="sf-box to-setup" data-testid={'to-setup-' + view.card.action}>
              <h2>
                <span className="to-card-icon">
                  <ActionIcon action={view.card.action} />
                </span>
                {view.card.title}
              </h2>
              {view.card.caution && <Caution text={view.card.caution} />}

              {view.card.action === 'merge' && (
                <>
                  <p className="to-help">
                    위에서부터 순서대로 이어 붙여요. 첫 문서의 이름과 형식으로 만들어져요.
                  </p>
                  <ol className="to-order">
                    {order.map((id, i) => {
                      const f = filesById.get(id)
                      if (!f) return null
                      return (
                        <li key={id}>
                          <span className="to-order-no">{i + 1}</span>
                          <Badge extension={f.extension} />
                          <span className="to-order-name">{f.name}</span>
                          <button
                            type="button"
                            className="sf-secondary sf-sm"
                            disabled={i === 0}
                            aria-label={f.name + ' 위로'}
                            onClick={() => move(i, -1)}
                          >
                            위로
                          </button>
                          <button
                            type="button"
                            className="sf-secondary sf-sm"
                            disabled={i === order.length - 1}
                            aria-label={f.name + ' 아래로'}
                            onClick={() => move(i, 1)}
                          >
                            아래로
                          </button>
                          <button
                            type="button"
                            className="sf-secondary sf-sm"
                            disabled={order.length <= 1}
                            aria-label={f.name + ' 빼기'}
                            onClick={() => setOrder(order.filter((x) => x !== id))}
                          >
                            빼기
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                  <button
                    type="button"
                    className="sf-secondary to-add"
                    disabled={busy}
                    onClick={() => void addDocuments(view.doc)}
                  >
                    {FAMILY_LABEL[view.doc.family]} 문서 더 올리기
                  </button>
                </>
              )}

              {view.card.action === 'split' && (
                <div className="to-modes" role="radiogroup" aria-label="나누는 방법">
                  {(
                    [
                      [
                        'each',
                        units?.word === '슬라이드'
                          ? '슬라이드마다 따로'
                          : units?.word === '부분'
                            ? '부분마다 따로'
                            : '쪽마다 따로',
                      ],
                      ['every', '몇 개씩 묶어서'],
                      ['pick', '고른 것만 새 파일로'],
                    ] as [OrganizeSplitMode, string][]
                  ).map(([mode, label]) => (
                    <label key={mode} className={'to-mode' + (splitMode === mode ? ' is-on' : '')}>
                      <input
                        type="radio"
                        name="to-split"
                        checked={splitMode === mode}
                        onChange={() => setSplitMode(mode)}
                      />
                      {label}
                      {mode === 'every' && splitMode === 'every' && (
                        <span className="to-every">
                          <input
                            type="number"
                            min={1}
                            max={units?.units.length ?? 999}
                            value={every}
                            aria-label="한 파일에 넣을 개수"
                            onChange={(e) =>
                              setEvery(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                            }
                          />
                          개씩
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}

              {(view.card.action === 'remove' ||
                (view.card.action === 'split' && splitMode === 'pick')) &&
                (units ? (
                  <UnitPicker
                    token={view.doc.token}
                    file={view.doc.files[0]!}
                    units={units}
                    picked={picked}
                    onPick={setPicked}
                    tone={view.card.action === 'remove' ? 'remove' : 'keep'}
                  />
                ) : unitsError ? (
                  <em className="sf-error" role="alert">
                    {unitsError}
                  </em>
                ) : (
                  <p className="to-help">
                    <span className="sf-spinner" aria-hidden="true" /> 쪽을 읽는 중이에요.
                  </p>
                ))}

              {view.card.action === 'split' && splitMode !== 'pick' && units && (
                <p className="to-help">
                  {units.units.length}
                  {units.word === '슬라이드' ? '장' : units.word === '쪽' ? '쪽' : '개 부분'}을{' '}
                  {splitMode === 'each'
                    ? units.units.length
                    : Math.ceil(units.units.length / every)}
                  개 파일로 나눠 ZIP 하나로 받아요.
                </p>
              )}

              <div className="sf-btn-row to-setup-actions">
                <button
                  type="button"
                  className="sf-secondary"
                  onClick={() => {
                    unitsRequestRef.current++
                    setView({ at: 'choose', doc: view.doc })
                  }}
                >
                  다른 정리 고르기
                </button>
                <button
                  type="button"
                  className="sf-primary"
                  data-testid="to-run"
                  disabled={!canRun(view.doc, view.card)}
                  onClick={() => void run(view.doc, view.card)}
                >
                  {runLabel(view.card)}
                </button>
              </div>
            </section>
          )}

          {view.at === 'running' && (
            <section className="sf-box tc-work to-running" aria-live="polite">
              <h2>
                <span className="sf-spinner" aria-hidden="true" />
                {view.card.title} 하는 중
              </h2>
              <p className="to-progress">{view.label}</p>
              <p className="tc-hint">
                {view.doc.family === 'hangul'
                  ? '한글 문서는 정리한 뒤 다시 열어 글이 그대로인지 확인해요. 몇 초에서 1분쯤 걸려요.'
                  : '쪽이 많거나 사진이 많은 문서는 조금 걸려요.'}
              </p>
            </section>
          )}

          {view.at === 'done' && (
            <section className="sf-box to-done" data-testid="to-result">
              <h2>다 됐어요</h2>
              <p className="tc-result-name" title={view.made.fileName}>
                {view.made.fileName}
                <span>
                  {[sizeText(view.made.bytes.byteLength), ...view.made.facts].join(' · ')}
                </span>
              </p>
              {view.made.before !== undefined && (
                <p className="to-size">
                  <span>{sizeText(view.made.before)}</span>
                  <span aria-hidden="true">→</span>
                  <b>{sizeText(view.made.bytes.byteLength)}</b>
                </p>
              )}
              {view.made.warnings.length > 0 && (
                <ul className="tc-warn" aria-label="확인할 점">
                  {view.made.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="sf-btn-row">
                <button
                  type="button"
                  className="sf-primary tc-download"
                  data-testid="to-download"
                  onClick={() => void download(view.doc, view.made)}
                >
                  내려받기
                </button>
                <button
                  type="button"
                  className="sf-secondary"
                  onClick={() => setView({ at: 'choose', doc: view.doc })}
                >
                  다른 정리 하기
                </button>
              </div>
            </section>
          )}

          {view.at === 'failed' && (
            <section className="sf-box tc-work" role="alert" data-testid="to-failed">
              <h2>정리하지 못했어요</h2>
              <p className="tc-failed">{view.error}</p>
              <button
                type="button"
                className="sf-secondary"
                onClick={() => setView({ at: 'choose', doc: view.doc })}
              >
                다른 정리 고르기
              </button>
            </section>
          )}
        </>
      )}
      <ToastView toast={toast} />
    </div>
  )
}
