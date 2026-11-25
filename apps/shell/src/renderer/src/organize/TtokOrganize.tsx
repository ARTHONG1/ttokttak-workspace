import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import {
  rangeLabel,
  type OrganizeCard,
  type OrganizeOpenResult,
  type OrganizeRunRequest,
  type OrganizeRunResult,
  type OrganizeSplitMode,
  type OrganizeUnit,
  type OrganizeUnitsResult,
} from '../../../shared/organize-api'
import { isWebEdition } from '../edition'
import { Back, ToastView, useToast } from '../special-common'
import { useFileDrop } from '../use-file-drop'
import '../convert/ttok-convert.css'
import './ttok-organize.css'

/**
 * 똑딱업무 > 똑딱정리: documents in, then one screen with a tab for each tidy-up they can have
 * (only those). A single document opens on its pages: the picked ones go out, or only they go
 * into a new file. The result shows page by page before it is saved in the document's own
 * format, and the saved file opens in its editor tab. A tab whose result may differ from the
 * original says so with 주의. The main process holds the files and the last result and does the
 * work; this page shows the way and hands the bytes to the save.
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
type RunRequest = Omit<OrganizeRunRequest, 'token'>

type View =
  | { at: 'pick' }
  | { at: 'setup'; doc: Opened; card: OrganizeCard }
  | { at: 'running'; doc: Opened; card: OrganizeCard; label: string }
  | { at: 'done'; doc: Opened; card: OrganizeCard; made: Made; savedPath?: string }
  | { at: 'failed'; doc: Opened; card: OrganizeCard; error: string }

const stageOf = (view: View): number => (view.at === 'pick' ? 1 : view.at === 'done' ? 3 : 2)

function sizeText(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

/** '3쪽', '3장' (slides) or '3개 부분' (a Word file's parts) */
function countText(n: number, word: string): string {
  if (word === '슬라이드') return n + '장'
  if (word === '쪽') return n + '쪽'
  return n + '개 부분'
}

/** sorted 0-based picks for reading: '2, 4-6쪽', '슬라이드 2, 4-6', '2, 4-6번째 부분' */
function pickedText(picked: number[], word: string): string {
  const list = rangeLabel(picked).split(',').join(', ')
  if (word === '슬라이드') return '슬라이드 ' + list
  if (word === '쪽') return list + '쪽'
  return list + '번째 부분'
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

/**
 * a document's pages (slides, parts) as tiles, each drawn once it scrolls into view. With
 * onToggle they can be picked; without, they only show (the result's pages)
 */
function PageTiles({
  token,
  fileId,
  units,
  picked,
  onToggle,
}: {
  token: string
  fileId: string
  units: Units
  picked?: Set<number>
  onToggle?: (index: number, withRange: boolean) => void
}): ReactElement {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  useEffect(() => {
    if (units.preview !== 'pdf') return
    setPdf(null)
    let cancelled = false
    let task: ReturnType<typeof getDocument> | null = null
    void (async () => {
      try {
        const bytes = await window.aiOffice.organizePdfBytes(token, fileId)
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
  }, [token, fileId, units.preview])
  return (
    <ul className={'to-tiles to-tiles-' + units.preview} role="list">
      {units.units.map((u: OrganizeUnit) => {
        const on = picked?.has(u.index) ?? false
        const face = (
          <>
            <span className="to-tile-face">
              {units.preview === 'pdf' && pdf ? (
                <PdfThumb pdf={pdf} page={u.index} />
              ) : units.preview === 'svg' ? (
                <SvgThumb token={token} fileId={fileId} page={u.index} />
              ) : (
                <span className="to-tile-text">{u.text || '(글 없음)'}</span>
              )}
              {on && (
                <span className="to-tile-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </span>
            <span className="to-tile-label">
              {u.label}
              {onToggle && u.joinedToPrevious && (
                <em title="앞 쪽의 표나 문단이 이어진 쪽이에요. 앞 쪽과 함께 고르세요.">
                  앞 쪽과 이어짐
                </em>
              )}
            </span>
          </>
        )
        return (
          <li key={u.index}>
            {onToggle ? (
              <button
                type="button"
                className={'to-tile' + (on ? ' is-on' : '')}
                aria-pressed={on}
                data-testid={'to-unit-' + u.index}
                onClick={(e) => onToggle(u.index, e.shiftKey)}
              >
                {face}
              </button>
            ) : (
              <div className="to-tile is-static">{face}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** one document's pages to pick: a click picks or lets go of one, a Shift-click picks a run */
function UnitPicker({
  token,
  fileId,
  units,
  picked,
  onPick,
}: {
  token: string
  fileId: string
  units: Units
  picked: Set<number>
  onPick: (next: Set<number>) => void
}): ReactElement {
  const last = useRef<number | null>(null)
  const toggle = (index: number, withRange: boolean): void => {
    const next = new Set(picked)
    const from = last.current
    if (withRange && from !== null) {
      for (let i = Math.min(from, index); i <= Math.max(from, index); i++) next.add(i)
    } else if (next.has(index)) next.delete(index)
    else next.add(index)
    last.current = index
    onPick(next)
  }
  return (
    <div className="to-picker">
      <div className="to-picker-bar">
        <span>
          전체 <b>{countText(units.units.length, units.word)}</b> · Shift를 누른 채 누르면 그 사이를
          한 번에 골라요.
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
      <PageTiles token={token} fileId={fileId} units={units} picked={picked} onToggle={toggle} />
    </div>
  )
}

/** the result's pages, drawn from the copy the main process keeps until the next run */
function ResultPages({ token, previewId }: { token: string; previewId: string }): ReactElement {
  // undefined: still reading; null: it could not be read
  const [units, setUnits] = useState<Units | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setUnits(undefined)
    void window.aiOffice
      .organizeUnits(token, previewId)
      .then((r) => {
        if (!cancelled) setUnits(r.ok ? r : null)
      })
      .catch(() => {
        if (!cancelled) setUnits(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, previewId])
  if (units === undefined) {
    return (
      <p className="to-help">
        <span className="sf-spinner" aria-hidden="true" /> 결과를 그리는 중이에요.
      </p>
    )
  }
  if (units === null) {
    return <p className="to-note">결과를 그리지 못했어요. 저장한 뒤 열어서 확인해 주세요.</p>
  }
  return (
    <>
      <h3 className="to-result-title">
        결과 미리보기 · {countText(units.units.length, units.word)}
      </h3>
      <PageTiles token={token} fileId={previewId} units={units} />
    </>
  )
}

export function TtokOrganize({ onBack }: { onBack: () => void }): ReactElement {
  const web = isWebEdition()
  const saveLabel = web ? '내려받기' : '저장하기'
  const [view, setView] = useState<View>({ at: 'pick' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, say] = useToast()
  const token = view.at === 'pick' ? null : view.doc.token
  const busyRef = useRef(false)
  const savingRef = useRef(false)
  const requestRef = useRef(0)
  /** the set whose pages are being read; a late answer for another set is dropped */
  const unitsTokenRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    const requests = requestRef
    const unitsToken = unitsTokenRef
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requests.current++
      unitsToken.current = null
    }
  }, [])

  // what the tabs set up; kept while switching tabs
  const [order, setOrder] = useState<string[]>([])
  const [units, setUnits] = useState<Units | null>(null)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [splitMode, setSplitMode] = useState<Exclude<OrganizeSplitMode, 'pick'>>('each')
  const [every, setEvery] = useState(2)
  /** the merge row being dragged to a new place */
  const [dragging, setDragging] = useState<number | null>(null)

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

  /** a set of documents up: its first tab, and a single document's pages read for the tabs */
  const begin = (doc: Opened): void => {
    setOrder(doc.files.map((f) => f.id))
    setPicked(new Set())
    setSplitMode('each')
    setUnits(null)
    setUnitsError(null)
    setView({ at: 'setup', doc, card: doc.cards[0]! })
    const showsUnits = doc.cards.some((c) => c.action === 'remove' || c.action === 'split')
    unitsTokenRef.current = showsUnits ? doc.token : null
    if (!showsUnits) return
    void window.aiOffice
      .organizeUnits(doc.token, doc.files[0]!.id)
      .then((r) => {
        if (!mountedRef.current || unitsTokenRef.current !== doc.token) return
        if (r.ok) setUnits(r)
        else setUnitsError(r.error)
      })
      .catch((err) => {
        console.warn('[organize] units failed', err)
        if (mountedRef.current && unitsTokenRef.current === doc.token)
          setUnitsError('쪽을 읽지 못했어요. 문서를 다시 올려 주세요.')
      })
  }

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
      begin(result)
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

  // more documents of the same kind: the set becomes one to merge (its only tab)
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
      begin(result)
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
  // first step they are the documents to tidy; with documents up they join them for a merge;
  // after a result they start a new set
  const dropDocuments = (paths: string[]): void => {
    if (busy || view.at === 'running') return say('정리하는 중이에요. 끝난 뒤 올려 주세요.')
    if (paths.length === 0)
      return setError('놓은 파일을 읽지 못했어요. [문서 올리기]로 골라 주세요.')
    if (view.at === 'setup') {
      const doc = view.doc
      void addWith(() => window.aiOffice.addOrganizePaths(doc.token, paths))
    } else void openWith(() => window.aiOffice.openOrganizePaths(paths))
  }
  const { over: dropOver, handlers: dropHandlers } = useFileDrop(dropDocuments)

  /** another tab of the same set; what was set up stays */
  const showCard = (doc: Opened, card: OrganizeCard): void => {
    if (busyRef.current) return
    setError(null)
    setView({ at: 'setup', doc, card })
  }

  const run = async (doc: Opened, card: OrganizeCard, request: RunRequest): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    const runId = ++requestRef.current
    setError(null)
    setBusy(true)
    setView({ at: 'running', doc, card, label: '준비하는 중' })
    try {
      const result = await window.aiOffice.runOrganize({ token: doc.token, ...request })
      if (!mountedRef.current || runId !== requestRef.current) return
      setView(
        result.ok
          ? { at: 'done', doc, card, made: result }
          : { at: 'failed', doc, card, error: result.error },
      )
    } catch (err) {
      console.warn('[organize] run failed', err)
      if (mountedRef.current && runId === requestRef.current)
        setView({ at: 'failed', doc, card, error: '정리하지 못했어요. 다시 해 주세요.' })
    } finally {
      busyRef.current = false
      if (mountedRef.current && runId === requestRef.current) setBusy(false)
    }
  }

  /** the result saved where the user picks; its path, or null when nothing was saved */
  const save = async (doc: Opened, made: Made): Promise<string | null> => {
    if (savingRef.current) return null
    savingRef.current = true
    try {
      const path = await window.aiOffice.saveFeatureFile({
        name: made.fileName,
        filterName: made.extension === 'zip' ? 'ZIP 파일' : FAMILY_LABEL[doc.family] + ' 문서',
        extensions: [made.extension],
        bytes: made.bytes,
      })
      if (!path || !mountedRef.current) return null
      setView((v) => (v.at === 'done' && v.made === made ? { ...v, savedPath: path } : v))
      return path
    } catch (err) {
      console.warn('[organize] save failed', err)
      if (mountedRef.current) say('저장하지 못했어요. 다시 해 주세요.', true)
      return null
    } finally {
      savingRef.current = false
    }
  }

  /** the saved result in its editor tab (on the web edition, a tab of the web app) */
  const openSaved = async (path: string): Promise<void> => {
    try {
      const opened = await window.aiOffice.openPath(path)
      if (!opened) throw new Error('The saved result could not be opened.')
    } catch (err) {
      console.warn('[organize] open saved result failed', err)
      if (mountedRef.current) say('저장한 문서를 열지 못했어요. 파일을 직접 열어 주세요.', true)
    }
  }

  const saveAndOpen = async (doc: Opened, made: Made): Promise<void> => {
    const path = await save(doc, made)
    if (path) await openSaved(path)
  }

  const stage = stageOf(view)
  const stages = ['문서 올리기', '정리하기', saveLabel]
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

  const word = units?.word ?? '쪽'
  const total = units?.units.length ?? 0
  const pickedList = [...picked].sort((a, b) => a - b)
  const pieceCount = splitMode === 'each' ? total : Math.ceil(total / every)

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
          <p>합치기·나누기·쪽 빼기·용량 줄이기를 문서 원래 형식 그대로 해요.</p>
        </div>
      </header>

      <ol className="tc-stages" aria-label="진행 순서">
        {stages.map((label, i) => (
          <li key={label} className={stage === i + 1 ? 'is-now' : stage > i + 1 ? 'is-done' : ''}>
            <span className="tc-stage-no">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {view.at === 'pick' ? (
        <>
          <PrivacyNote />
          <section className={'tc-drop' + (dropOver ? ' is-over' : '')}>
            <span className="tc-drop-icon">
              <OrganizeIcon />
            </span>
            <h2>정리할 문서를 올려 주세요</h2>
            <p>한글(HWP·HWPX)·워드(DOCX)·PPT(PPTX)·PDF를 올릴 수 있어요.</p>
            <p className="to-drop-hint">
              여기에 끌어다 놓거나 [문서 올리기]로 고르세요. 같은 종류 문서를 여러 개 올리면
              합치기를 할 수 있어요.
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
        </>
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
                      {view.doc.files.length === 1 && units && ' · ' + countText(total, word)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            <div className="to-file-actions">
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

          {view.at === 'setup' && (
            <section className="sf-box to-setup" data-testid={'to-setup-' + view.card.action}>
              <div className="to-tabs" role="tablist" aria-label="정리 방법">
                {view.doc.cards.map((card) => (
                  <button
                    type="button"
                    role="tab"
                    key={card.action}
                    aria-selected={card.action === view.card.action}
                    className={'to-tab' + (card.action === view.card.action ? ' is-on' : '')}
                    data-testid={'to-card-' + card.action}
                    disabled={busy}
                    onClick={() => showCard(view.doc, card)}
                  >
                    <ActionIcon action={card.action} />
                    {card.title}
                  </button>
                ))}
              </div>
              <p className="to-help">{view.card.summary}</p>
              {view.card.caution && <Caution text={view.card.caution} />}

              {(view.card.action === 'remove' || view.card.action === 'split') &&
                !units &&
                (unitsError ? (
                  <em className="sf-error" role="alert">
                    {unitsError}
                  </em>
                ) : (
                  <p className="to-help">
                    <span className="sf-spinner" aria-hidden="true" /> 쪽을 읽는 중이에요.
                  </p>
                ))}

              {view.card.action === 'remove' && (
                <>
                  {units && (
                    <UnitPicker
                      token={view.doc.token}
                      fileId={view.doc.files[0]!.id}
                      units={units}
                      picked={picked}
                      onPick={setPicked}
                    />
                  )}
                  <div className="to-actionbar">
                    <p className="to-actionbar-text">
                      {picked.size === 0 ? (
                        '빼거나 따로 저장할 ' +
                        word +
                        (word === '슬라이드' ? '를' : '을') +
                        ' 눌러 고르세요.'
                      ) : (
                        <>
                          <b>{countText(picked.size, word)}</b> 골랐어요 ·{' '}
                          {pickedText(pickedList, word)}
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      className="sf-secondary"
                      data-testid="to-run-keep"
                      disabled={!units || picked.size === 0}
                      onClick={() =>
                        void run(view.doc, view.card, {
                          action: 'split',
                          split: { mode: 'pick', pick: pickedList },
                        })
                      }
                    >
                      {picked.size > 0
                        ? countText(picked.size, word) + '만 새 파일로'
                        : '고른 것만 새 파일로'}
                    </button>
                    <button
                      type="button"
                      className="sf-primary"
                      data-testid="to-run"
                      disabled={!units || picked.size === 0 || picked.size >= total}
                      onClick={() =>
                        void run(view.doc, view.card, { action: 'remove', remove: pickedList })
                      }
                    >
                      {picked.size === 0
                        ? '고른 것 빼기'
                        : picked.size >= total
                          ? '모두 뺄 수는 없어요'
                          : countText(picked.size, word) +
                            ' 빼고 ' +
                            countText(total - picked.size, word) +
                            '으로 만들기'}
                    </button>
                  </div>
                </>
              )}

              {view.card.action === 'split' && (
                <>
                  <div className="to-modes" role="radiogroup" aria-label="나누는 방법">
                    {(
                      [
                        ['each', word + '마다 따로'],
                        ['every', '몇 개씩 묶어서'],
                      ] as [Exclude<OrganizeSplitMode, 'pick'>, string][]
                    ).map(([mode, label]) => (
                      <label
                        key={mode}
                        className={'to-mode' + (splitMode === mode ? ' is-on' : '')}
                      >
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
                              max={total || 999}
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
                  <div className="to-actionbar">
                    <p className="to-actionbar-text">
                      {units && countText(total, word) + '을 ' + pieceCount + '개 파일로 나눠요.'}
                    </p>
                    <button
                      type="button"
                      className="sf-primary"
                      data-testid="to-run"
                      disabled={!units || pieceCount < 2}
                      onClick={() =>
                        void run(view.doc, view.card, {
                          action: 'split',
                          split: { mode: splitMode, ...(splitMode === 'every' ? { every } : {}) },
                        })
                      }
                    >
                      {pieceCount < 2 ? '묶음 크기를 줄여 주세요' : pieceCount + '개 파일로 나누기'}
                    </button>
                  </div>
                </>
              )}

              {view.card.action === 'shrink' && (
                <div className="to-actionbar">
                  <p className="to-actionbar-text">
                    사진은 화질을 조금 낮춰 다시 저장해요. 원본은 그대로예요.
                  </p>
                  <button
                    type="button"
                    className="sf-primary"
                    data-testid="to-run"
                    onClick={() => void run(view.doc, view.card, { action: 'shrink' })}
                  >
                    용량 줄이기
                  </button>
                </div>
              )}

              {view.card.action === 'merge' && (
                <>
                  <p className="to-note">
                    끌어 놓거나 [위로]·[아래로]로 순서를 바꿔요. 결과는 1번 문서의 이름과 형식을
                    따라요.
                  </p>
                  <ol className="to-order">
                    {order.map((id, i) => {
                      const f = filesById.get(id)
                      if (!f) return null
                      return (
                        <li
                          key={id}
                          draggable
                          className={dragging === i ? 'is-dragging' : undefined}
                          onDragStart={(e) => {
                            setDragging(i)
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', f.name)
                          }}
                          onDragOver={(e) => {
                            if (dragging === null) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={(e) => {
                            if (dragging === null) return
                            e.preventDefault()
                            e.stopPropagation()
                            move(dragging, i - dragging)
                            setDragging(null)
                          }}
                          onDragEnd={() => setDragging(null)}
                        >
                          <span className="to-order-grip" aria-hidden="true">
                            ⠿
                          </span>
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
                    data-testid="to-add-more"
                    disabled={busy}
                    onClick={() => void addDocuments(view.doc)}
                  >
                    {FAMILY_LABEL[view.doc.family]} 문서 더 올리기
                  </button>
                  <div className="to-actionbar">
                    <p className="to-actionbar-text">
                      {order.length < 2 &&
                        '합칠 ' +
                          FAMILY_LABEL[view.doc.family] +
                          ' 문서를 하나 이상 더 올려 주세요.'}
                    </p>
                    <button
                      type="button"
                      className="sf-primary"
                      data-testid="to-run"
                      disabled={order.length < 2}
                      onClick={() => void run(view.doc, view.card, { action: 'merge', order })}
                    >
                      {order.length < 2
                        ? '합칠 문서를 더 올려 주세요'
                        : order.length + '개 문서 합치기'}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {view.at === 'running' && (
            <section className="sf-box tc-work to-running" aria-live="polite">
              <h2>
                <span className="sf-spinner" aria-hidden="true" />
                정리하는 중
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
            <section className="to-done" data-testid="to-result">
              <div className="to-result-view">
                {view.made.previewId && (
                  <ResultPages token={view.doc.token} previewId={view.made.previewId} />
                )}
                {view.made.pieces && (
                  <>
                    <h3 className="to-result-title">ZIP에 든 파일 {view.made.pieces.length}개</h3>
                    <ul className="to-pieces">
                      {view.made.pieces.map((name) => (
                        <li key={name}>
                          <Badge extension={name.split('.').pop() ?? ''} />
                          <span>{name}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="sf-box to-result-side">
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
                {view.savedPath && (
                  <p className="to-saved" role="status" data-testid="to-saved">
                    저장했어요 · {view.savedPath.split(/[\\/]/).pop()}
                  </p>
                )}
                <div className="to-result-actions">
                  {!view.savedPath && (
                    <button
                      type="button"
                      className="sf-primary tc-download"
                      data-testid="to-download"
                      onClick={() => void save(view.doc, view.made)}
                    >
                      {saveLabel}
                    </button>
                  )}
                  {/* one document opens in its editor; a ZIP of several does not */}
                  {!view.savedPath && view.made.previewId && (
                    <button
                      type="button"
                      className="sf-secondary"
                      data-testid="to-save-open"
                      onClick={() => void saveAndOpen(view.doc, view.made)}
                    >
                      {web ? '내려받고 열기' : '저장하고 열기'}
                    </button>
                  )}
                  {view.savedPath && view.made.previewId && (
                    <button
                      type="button"
                      className="sf-primary"
                      data-testid="to-open-result"
                      onClick={() => void openSaved(view.savedPath!)}
                    >
                      열어 보기
                    </button>
                  )}
                  <button
                    type="button"
                    className="sf-secondary"
                    onClick={() => {
                      setPicked(new Set())
                      showCard(view.doc, view.card)
                    }}
                  >
                    다른 정리 하기
                  </button>
                </div>
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
                onClick={() => showCard(view.doc, view.card)}
              >
                돌아가서 다시 하기
              </button>
            </section>
          )}
        </>
      )}
      <ToastView toast={toast} />
    </div>
  )
}
