import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type {
  ConvertFormat,
  ConvertOpenResult,
  ConvertRunResult,
  ConvertTarget,
} from '../../../shared/convert-api'
import { Back, ToastView, useToast } from '../special-common'
import './ttok-convert.css'

/**
 * 똑딱업무 > 문서 변환: a document in, the formats it can be made into as cards, the picked
 * one made while its steps are shown, and the result downloaded. The main process holds
 * the file and runs the engines; this page shows the way and hands the bytes to the save.
 */

GlobalWorkerOptions.workerSrc = workerUrl
/** the CJK CMaps, standard fonts and wasm decoders the build copies next to the page */
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

type Picked = Extract<ConvertOpenResult, { ok: true }>
type Made = Extract<ConvertRunResult, { ok: true }>

type View =
  | { at: 'pick' }
  | { at: 'choose'; doc: Picked }
  | { at: 'running'; doc: Picked; target: ConvertTarget; step: number }
  | { at: 'done'; doc: Picked; target: ConvertTarget; made: Made }
  | { at: 'failed'; doc: Picked; target: ConvertTarget; error: string }

const STAGES = ['문서 올리기', '형식 고르기', '변환하기', '내려받기']

const stageOf = (view: View): number =>
  view.at === 'pick' ? 1 : view.at === 'choose' ? 2 : view.at === 'done' ? 4 : 3

function sizeText(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

/** the label on a format's badge */
const BADGE: Record<ConvertFormat, string> = {
  pdf: 'PDF',
  hwp: 'HWP',
  hwpx: 'HWPX',
  docx: 'DOCX',
  odt: 'ODT',
  html: 'HTML',
  md: 'MD',
  pptx: 'PPTX',
  xlsx: 'XLSX',
  png: 'PNG',
}

function Badge({ label, kind }: { label: string; kind: string }): ReactElement {
  return <span className={'tc-badge tc-badge-' + kind}>{label}</span>
}

export function ConvertIcon(): ReactElement {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 3.5h7l3.5 3.5v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 3.5V7h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M5 3.5v15h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M14 15.5h6.5m0 0-2.4-2.4m2.4 2.4-2.4 2.4M20.5 20H14m0 0 2.4-2.4M14 20l2.4 2.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StepMark({ state }: { state: 'done' | 'now' | 'wait' }): ReactElement {
  if (state === 'now') return <span className="sf-spinner tc-step-spin" aria-hidden="true" />
  return (
    <span className={'tc-step-mark is-' + state} aria-hidden="true">
      {state === 'done' && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}

/** the stages of one conversion: the original, then each engine, then the result */
function Steps({
  doc,
  target,
  step,
}: {
  doc: Picked
  target: ConvertTarget
  /** the running stage (1-based); past the last means all done */
  step: number
}): ReactElement {
  return (
    <ol className="tc-steps" aria-label="변환 과정">
      <li className="tc-step is-done">
        <StepMark state="done" />
        <span>
          원본 <b>{doc.extension.toUpperCase()}</b> 읽기
        </span>
      </li>
      {target.steps.map((label, i) => {
        const state = i + 1 < step ? 'done' : i + 1 === step ? 'now' : 'wait'
        return (
          <li key={label + i} className={'tc-step is-' + state}>
            <StepMark state={state} />
            <span>{label}</span>
          </li>
        )
      })}
      <li className={'tc-step is-' + (step > target.steps.length ? 'done' : 'wait')}>
        <StepMark state={step > target.steps.length ? 'done' : 'wait'} />
        <span>
          <b>{target.title}</b> 파일 완성
        </span>
      </li>
    </ol>
  )
}

/** the first page of a PDF made on the way, drawn small */
function FirstPage({ pdf }: { pdf: Uint8Array }): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    const task = getDocument({ data: pdf.slice(), ...docOptions() })
    void (async () => {
      try {
        const doc = await task.promise
        const page = await doc.getPage(1)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(2, 520 / base.width)
        const viewport = page.getViewport({ scale })
        const el = canvas.current
        if (!el || cancelled) return
        el.width = Math.round(viewport.width)
        el.height = Math.round(viewport.height)
        await page.render({ canvas: el, viewport }).promise
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [pdf])
  if (failed) return <p className="tc-preview-none">미리보기를 그리지 못했어요.</p>
  return <canvas ref={canvas} className="tc-preview-page" aria-label="첫 쪽 미리보기" />
}

export function TtokConvert({ onBack }: { onBack: () => void }): ReactElement {
  const [view, setView] = useState<View>({ at: 'pick' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, say] = useToast()
  const token = view.at === 'pick' ? null : view.doc.token

  useEffect(() => {
    return window.aiOffice.onConvertProgress((progress) => {
      setView((v) =>
        v.at === 'running' && v.doc.token === progress.token ? { ...v, step: progress.step } : v,
      )
    })
  }, [])

  const pickDocument = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const result = await window.aiOffice.openConvertDocument()
      if (!result) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setView({ at: 'choose', doc: result })
    } catch (err) {
      console.warn('[convert] open failed', err)
      setError('문서를 열지 못했어요. 다시 해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const convert = async (doc: Picked, target: ConvertTarget): Promise<void> => {
    setView({ at: 'running', doc, target, step: 1 })
    try {
      const result = await window.aiOffice.runConvert(doc.token, target.format)
      setView(
        result.ok
          ? { at: 'done', doc, target, made: result }
          : { at: 'failed', doc, target, error: result.error },
      )
    } catch (err) {
      console.warn('[convert] run failed', err)
      setView({ at: 'failed', doc, target, error: '변환하지 못했어요. 다시 해 주세요.' })
    }
  }

  const download = async (made: Made, target: ConvertTarget): Promise<void> => {
    try {
      const path = await window.aiOffice.saveFeatureFile({
        name: made.fileName,
        filterName: target.title,
        extensions: [made.extension],
        bytes: made.bytes,
      })
      if (path) say('저장했어요.')
    } catch (err) {
      console.warn('[convert] save failed', err)
      say('저장하지 못했어요. 다시 해 주세요.', true)
    }
  }

  const stage = stageOf(view)

  return (
    <div className="sf-page tc-root" data-convert-token={token ?? undefined}>
      <div className="sf-page-bar">
        <Back onClick={onBack} label="똑딱업무" />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon tc-head-icon">
          <ConvertIcon />
        </span>
        <div className="sf-page-title">
          <h1>문서 변환</h1>
          <p>어떤 문서든 올리면, 바꿀 수 있는 형식을 골라 바로 내려받아요.</p>
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

      {view.at === 'pick' ? (
        <section className="tc-drop">
          <span className="tc-drop-icon">
            <ConvertIcon />
          </span>
          <h2>변환할 문서를 올려 주세요</h2>
          <p>한글·워드·ODT·엑셀·PPT·PDF·HTML·Markdown·사진을 올릴 수 있어요.</p>
          <button
            type="button"
            className="sf-primary tc-drop-button"
            data-testid="tc-open"
            disabled={busy}
            onClick={() => void pickDocument()}
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
          <div className="tc-file">
            <Badge label={view.doc.extension.toUpperCase()} kind="source" />
            <span className="tc-file-name" title={view.doc.name + '.' + view.doc.extension}>
              {view.doc.name}
              <small>
                .{view.doc.extension} · {sizeText(view.doc.size)}
              </small>
            </span>
            <button
              type="button"
              className="sf-secondary tc-file-change"
              disabled={view.at === 'running' || busy}
              onClick={() => void pickDocument()}
            >
              다른 문서 올리기
            </button>
          </div>
          {error && (
            <em className="sf-error" role="alert">
              {error}
            </em>
          )}

          {view.at === 'choose' &&
            (view.doc.targets.length === 0 ? (
              <p className="tc-empty">이 문서는 아직 바꿀 수 있는 형식이 없어요.</p>
            ) : (
              <>
                <h2 className="tc-section-title">어떤 형식으로 바꿀까요?</h2>
                <div className="tc-cards" role="list">
                  {view.doc.targets.map((target) => (
                    <button
                      type="button"
                      role="listitem"
                      key={target.format}
                      className="tc-card"
                      data-testid={'tc-target-' + target.format}
                      onClick={() => void convert(view.doc, target)}
                    >
                      <Badge label={BADGE[target.format]} kind={target.format} />
                      <span className="tc-card-title">{target.title}</span>
                      <span className="tc-card-sum">{target.summary}</span>
                      <span className="tc-card-flow" aria-label="변환 과정">
                        {[view.doc.extension.toUpperCase(), ...target.steps].join(' → ')}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ))}

          {view.at === 'running' && (
            <section className="sf-box tc-work" aria-live="polite">
              <h2>
                <Badge label={BADGE[view.target.format]} kind={view.target.format} />
                {view.target.title}(으)로 바꾸는 중
              </h2>
              <Steps doc={view.doc} target={view.target} step={view.step} />
              <p className="tc-hint">한글·오피스 문서와 쪽이 많은 PDF는 몇 초에서 1분쯤 걸려요.</p>
            </section>
          )}

          {view.at === 'done' && (
            <section className="tc-result" data-testid="tc-result">
              <div className="tc-preview">
                {view.made.previewPdf ? (
                  <FirstPage pdf={view.made.previewPdf} />
                ) : view.made.previewSvg ? (
                  <img
                    src={
                      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(view.made.previewSvg)
                    }
                    width={520}
                    className="tc-preview-page"
                    alt="첫 쪽 미리보기"
                    draggable={false}
                  />
                ) : (
                  <div className="tc-preview-badge">
                    <Badge label={BADGE[view.target.format]} kind={view.target.format} />
                    <span>{view.target.summary}</span>
                  </div>
                )}
              </div>
              <div className="sf-box tc-result-side">
                <h2>다 바꿨어요</h2>
                <p className="tc-result-name" title={view.made.fileName}>
                  {view.made.fileName}
                  <span>
                    {[sizeText(view.made.bytes.byteLength), ...view.made.facts].join(' · ')}
                  </span>
                </p>
                {view.made.warnings.length > 0 && (
                  <ul className="tc-warn" aria-label="확인할 점">
                    {view.made.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <h3>이렇게 바꿨어요</h3>
                <Steps doc={view.doc} target={view.target} step={view.target.steps.length + 1} />
                <button
                  type="button"
                  className="sf-primary tc-download"
                  data-testid="tc-download"
                  onClick={() => void download(view.made, view.target)}
                >
                  내려받기
                </button>
                <button
                  type="button"
                  className="sf-secondary"
                  onClick={() => setView({ at: 'choose', doc: view.doc })}
                >
                  다른 형식으로 바꾸기
                </button>
              </div>
            </section>
          )}

          {view.at === 'failed' && (
            <section className="sf-box tc-work" role="alert">
              <h2>바꾸지 못했어요</h2>
              <p className="tc-failed">{view.error}</p>
              <button
                type="button"
                className="sf-secondary"
                onClick={() => setView({ at: 'choose', doc: view.doc })}
              >
                다른 형식 고르기
              </button>
            </section>
          )}
        </>
      )}
      <ToastView toast={toast} />
    </div>
  )
}
