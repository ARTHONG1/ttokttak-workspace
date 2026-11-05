import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { Back, ToastView, useToast } from '../special-common'
import { cleanSignature } from './sign-image'
import { SignPad, type PadPicture } from './SignPad'
import { SignVideoButton } from './sign-video'
import {
  angleFromPointer,
  clampToPage,
  newPlacement,
  onEveryPage,
  snapAngle,
  type PageSize,
  type PlacedSign,
} from './sign-place'
import { SignPdfError, readSignPdf, stampSignatures } from './sign-stamp'
import './ttok-sign.css'

/**
 * 똑딱업무 > 똑딱서명: a document in (any format the app can make a PDF of), a signature
 * picture in (its paper made transparent), the signature put on the pages — moved,
 * sized and turned freely — and a signed PDF out, the signatures drawn into the pages.
 * The pictures stay on this PC (localStorage) so the next document takes one click.
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

/** a signature picture: a PNG data URL and its pixel size */
interface SignPicture {
  id: string
  url: string
  width: number
  height: number
}

const STORE_KEY = 'ttokttak-sign:pictures'
const KEEP = 3
/** a picture larger than this (as a data URL) is used but not remembered */
const KEEP_MAX_CHARS = 1_500_000
/** the longest side a signature picture is worked on at */
const MAX_PICTURE_PX = 1200

function loadPictures(): SignPicture[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (p): p is SignPicture =>
          !!p &&
          typeof p.id === 'string' &&
          typeof p.url === 'string' &&
          p.url.startsWith('data:image/png;base64,') &&
          Number.isFinite(p.width) &&
          Number.isFinite(p.height),
      )
      .slice(0, KEEP)
  } catch {
    return []
  }
}

function keepPictures(list: SignPicture[]): void {
  try {
    const kept = list.filter((p) => p.url.length <= KEEP_MAX_CHARS).slice(0, KEEP)
    localStorage.setItem(STORE_KEY, JSON.stringify(kept))
  } catch {
    // storage full or blocked: the pictures still work for this visit
  }
}

function pngBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function pictureFromFile(file: File, dropPaper: boolean): Promise<SignPicture | null> {
  const bitmap = await createImageBitmap(file)
  const k = Math.min(1, MAX_PICTURE_PX / Math.max(bitmap.width, bitmap.height, 1))
  const w = Math.max(1, Math.round(bitmap.width * k))
  const h = Math.max(1, Math.round(bitmap.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const pixels = ctx.getImageData(0, 0, w, h)
  const source = { data: pixels.data, width: w, height: h }
  const cleaned = dropPaper ? cleanSignature(source) : source
  if (!cleaned) return null
  const out = document.createElement('canvas')
  out.width = cleaned.width
  out.height = cleaned.height
  out
    .getContext('2d')
    ?.putImageData(
      new ImageData(cleaned.data as Uint8ClampedArray<ArrayBuffer>, cleaned.width, cleaned.height),
      0,
      0,
    )
  return {
    id: crypto.randomUUID(),
    url: out.toDataURL('image/png'),
    width: cleaned.width,
    height: cleaned.height,
  }
}

interface OpenDocument {
  name: string
  bytes: Uint8Array
  converted: boolean
  pdf: PDFDocumentProxy
  sizes: PageSize[]
}

type Busy = 'doc' | 'picture' | 'save' | null

export function SignIcon(): ReactElement {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3.5H7.2A2.2 2.2 0 0 0 5 5.7v12.6a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2V8.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 16.2c1.1-1.9 2-2.9 2.6-2.9.9 0 .2 2.6 1.1 2.6.7 0 1.3-1.4 2-1.4.5 0 .7.9 1.6.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3.5v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

/** one page: drawn by pdf.js when it scrolls near, with its signatures on top */
function SignPage({
  pdf,
  index,
  size,
  scale,
  onVisibility,
  children,
  onBackground,
}: {
  pdf: PDFDocumentProxy
  index: number
  size: PageSize
  scale: number
  onVisibility: (index: number, ratio: number) => void
  children: React.ReactNode
  onBackground: () => void
}): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(index < 2)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setNear(true)
          onVisibility(index, e.intersectionRatio)
        }
      },
      { rootMargin: '600px 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [index, onVisibility])
  useEffect(() => {
    if (!near) return
    let cancelled = false
    let task: { cancel(): void; promise: Promise<unknown> } | null = null
    void (async () => {
      const page = await pdf.getPage(index + 1)
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: scale * dpr })
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      task = page.render({ canvas, viewport })
      await task.promise.catch(() => {})
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [near, pdf, index, scale])
  return (
    <div
      ref={wrapRef}
      className="ts-page"
      style={{ width: size.width * scale, height: size.height * scale }}
      data-page={index + 1}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || e.target === canvasRef.current) onBackground()
      }}
    >
      <canvas ref={canvasRef} className="ts-canvas" aria-hidden="true" />
      <span className="ts-page-no">{index + 1}쪽</span>
      {children}
    </div>
  )
}

type Gesture =
  | { kind: 'move'; startX: number; startY: number; cx: number; cy: number }
  | { kind: 'size'; dist: number; width: number; height: number }
  | { kind: 'turn' }

/** a signature on a page: drag to move, corners to size, the top knob to turn */
function PlacedView({
  item,
  picture,
  scale,
  page,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  item: PlacedSign
  picture: SignPicture | undefined
  scale: number
  page: PageSize
  selected: boolean
  onSelect: () => void
  onChange: (next: PlacedSign) => void
  onRemove: () => void
}): ReactElement | null {
  const gesture = useRef<Gesture | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  if (!picture) return null

  /** the pointer in page points (the page itself is never turned on screen) */
  const pointOf = (e: ReactPointerEvent): [number, number] => {
    const pageEl = boxRef.current?.parentElement
    const rect = pageEl?.getBoundingClientRect()
    if (!rect) return [0, 0]
    return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale]
  }

  const begin = (e: ReactPointerEvent, g: Gesture) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    gesture.current = g
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    boxRef.current?.focus({ preventScroll: true })
  }

  const move = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g) return
    const [x, y] = pointOf(e)
    if (g.kind === 'move') {
      onChange({
        ...item,
        ...clampToPage({ ...item, cx: g.cx + x - g.startX, cy: g.cy + y - g.startY }, page),
      })
    } else if (g.kind === 'size') {
      const factor = Math.hypot(x - item.cx, y - item.cy) / Math.max(1, g.dist)
      const width = Math.min(Math.max(g.width * factor, 12), page.width * 1.5)
      onChange({ ...item, width, height: (width * g.height) / g.width })
    } else {
      onChange({ ...item, angle: snapAngle(angleFromPointer(item.cx, item.cy, x, y), e.shiftKey) })
    }
  }

  const end = (e: ReactPointerEvent) => {
    gesture.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  const onKey = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const d = moves[e.key]
    if (d) {
      e.preventDefault()
      onChange({
        ...item,
        ...clampToPage({ ...item, cx: item.cx + d[0], cy: item.cy + d[1] }, page),
      })
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onRemove()
    }
  }

  const corner = (pos: 'nw' | 'ne' | 'se' | 'sw') => (
    <span
      className={'ts-knob ts-knob-' + pos}
      onPointerDown={(e) => {
        const [x, y] = pointOf(e)
        begin(e, {
          kind: 'size',
          dist: Math.hypot(x - item.cx, y - item.cy),
          width: item.width,
          height: item.height,
        })
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    />
  )

  return (
    <div
      ref={boxRef}
      className={'ts-sign' + (selected ? ' is-selected' : '')}
      role="button"
      tabIndex={0}
      aria-label={'서명, ' + (item.page + 1) + '쪽. 화살표로 옮기고 Delete로 지워요.'}
      data-testid="ts-sign"
      style={{
        left: (item.cx - item.width / 2) * scale,
        top: (item.cy - item.height / 2) * scale,
        width: item.width * scale,
        height: item.height * scale,
        transform: 'rotate(' + item.angle + 'deg)',
      }}
      onPointerDown={(e) => {
        const [x, y] = pointOf(e)
        begin(e, { kind: 'move', startX: x, startY: y, cx: item.cx, cy: item.cy })
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKey}
    >
      <img src={picture.url} alt="" draggable={false} />
      {selected && (
        <>
          {corner('nw')}
          {corner('ne')}
          {corner('se')}
          {corner('sw')}
          <span className="ts-turn-stem" aria-hidden="true" />
          <span
            className="ts-knob ts-knob-turn"
            title="돌리기 (Shift: 15°씩)"
            data-testid="ts-turn"
            onPointerDown={(e) => begin(e, { kind: 'turn' })}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          <button
            type="button"
            className="ts-remove"
            aria-label="이 서명 지우기"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            ×
          </button>
        </>
      )}
    </div>
  )
}

export function TtokSign({ onBack }: { onBack: () => void }): ReactElement {
  const [doc, setDoc] = useState<OpenDocument | null>(null)
  const [pictures, setPictures] = useState<SignPicture[]>(loadPictures)
  const [items, setItems] = useState<PlacedSign[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [dropPaper, setDropPaper] = useState(true)
  const [padOpen, setPadOpen] = useState(false)
  const [width, setWidth] = useState(720)
  const [toast, say] = useToast()
  const pagesRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const visibility = useRef(new Map<number, number>())

  // the pages fit the column they are shown in
  useEffect(() => {
    const el = pagesRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  useEffect(() => () => void doc?.pdf.loadingTask.destroy(), [doc])

  const scale = useMemo(() => {
    const widest = Math.max(...(doc?.sizes.map((s) => s.width) ?? [595]))
    return Math.min(1.6, Math.max(0.35, (width - 8) / widest))
  }, [doc, width])

  const onVisibility = useCallback((index: number, ratio: number) => {
    visibility.current.set(index, ratio)
  }, [])

  /** the page most in view: where a new signature goes */
  const pageInView = (): number => {
    let best = 0
    let bestRatio = -1
    for (const [index, ratio] of visibility.current) {
      if (ratio > bestRatio) {
        best = index
        bestRatio = ratio
      }
    }
    return best
  }

  const openDocument = async () => {
    setError(null)
    setBusy('doc')
    try {
      const result = await window.aiOffice.openSignDocument()
      if (!result) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      try {
        await readSignPdf(result.bytes)
      } catch (err) {
        setError(
          err instanceof SignPdfError && err.problem === 'encrypted'
            ? '암호가 걸린 PDF라 서명할 수 없어요. 암호를 푼 PDF를 올려 주세요.'
            : 'PDF를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.',
        )
        return
      }
      const pdf = await getDocument({ data: result.bytes.slice(), ...docOptions() }).promise
      const sizes: PageSize[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const vp = (await pdf.getPage(i)).getViewport({ scale: 1 })
        sizes.push({ width: vp.width, height: vp.height })
      }
      visibility.current = new Map()
      setItems([])
      setSelectedId(null)
      setSavedPath(null)
      setDoc({ name: result.name, bytes: result.bytes, converted: result.converted, pdf, sizes })
      if (result.converted) say('PDF로 바꿨어요. 이제 서명을 넣어 주세요.')
    } catch (err) {
      console.warn('[sign] open failed', err)
      setError('문서를 열지 못했어요. 다시 해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  const place = (picture: SignPicture) => {
    if (!doc) {
      say('먼저 서명할 문서를 올려 주세요.', true)
      return
    }
    const page = Math.min(pageInView(), doc.sizes.length - 1)
    const item: PlacedSign = {
      id: crypto.randomUUID(),
      page,
      sig: picture.id,
      ...newPlacement(picture, doc.sizes[page]!),
    }
    setItems((list) => [...list, item])
    setSelectedId(item.id)
    setSavedPath(null)
  }

  const addPicture = async (file: File) => {
    setBusy('picture')
    try {
      const picture = await pictureFromFile(file, dropPaper)
      if (!picture) {
        say('사진에서 서명을 찾지 못했어요. 흰 종이에 쓴 서명을 밝게 찍어 주세요.', true)
        return
      }
      const next = [picture, ...pictures.filter((p) => p.id !== picture.id)]
      setPictures(next)
      keepPictures(next)
      if (doc) place(picture)
    } catch (err) {
      console.warn('[sign] picture failed', err)
      say('그림을 읽지 못했어요. PNG나 JPG 파일을 골라 주세요.', true)
    } finally {
      setBusy(null)
    }
  }

  const forgetPicture = (id: string) => {
    const next = pictures.filter((p) => p.id !== id)
    setPictures(next)
    keepPictures(next)
    setItems((list) => list.filter((i) => i.sig !== id))
  }

  /** a signature drawn on the pad joins the pictures like an upload */
  const addDrawn = (drawn: PadPicture) => {
    setPadOpen(false)
    const picture: SignPicture = { id: crypto.randomUUID(), ...drawn }
    const next = [picture, ...pictures]
    setPictures(next)
    keepPictures(next)
    if (doc) place(picture)
    else say('서명을 만들었어요. 문서를 올리면 바로 넣을 수 있어요.')
  }

  /** a signature picture as a PNG file of its own (transparent, cropped to the ink) */
  const downloadPicture = async (picture: SignPicture) => {
    const path = await window.aiOffice.saveFeatureFile({
      name: '서명.png',
      filterName: 'PNG 그림',
      extensions: ['png'],
      bytes: pngBytes(picture.url),
    })
    if (path) say((path.split(/[\\/]/).pop() ?? '서명.png') + '을(를) 저장했어요.')
  }

  const change = (next: PlacedSign) => {
    setItems((list) => list.map((i) => (i.id === next.id ? next : i)))
    setSavedPath(null)
  }
  const remove = (id: string) => {
    setItems((list) => list.filter((i) => i.id !== id))
    setSelectedId((s) => (s === id ? null : s))
    setSavedPath(null)
  }

  const selected = items.find((i) => i.id === selectedId) ?? null
  const pictureOf = (id: string) => pictures.find((p) => p.id === id)

  const copyToEveryPage = () => {
    if (!doc || !selected) return
    const copies = onEveryPage(selected, doc.sizes, () => crypto.randomUUID())
    setItems((list) => [...list, ...copies])
    say(copies.length + '쪽에 같은 자리로 넣었어요.')
  }

  const save = async () => {
    if (!doc || items.length === 0) return
    setBusy('save')
    try {
      const used = [...new Set(items.map((i) => i.sig))].filter((id) => pictureOf(id))
      const pngs = used.map((id) => pngBytes(pictureOf(id)!.url))
      const stamps = items
        .filter((i) => used.includes(i.sig))
        .map((i) => ({
          page: i.page,
          image: used.indexOf(i.sig),
          placement: { cx: i.cx, cy: i.cy, width: i.width, height: i.height, angle: i.angle },
        }))
      const bytes = await stampSignatures(doc.bytes, pngs, stamps)
      const path = await window.aiOffice.saveFeatureFile({
        name: doc.name + '_서명.pdf',
        filterName: 'PDF',
        extensions: ['pdf'],
        bytes,
      })
      if (path) {
        setSavedPath(path)
        say('서명한 PDF를 저장했어요.')
      }
    } catch (err) {
      console.warn('[sign] save failed', err)
      say('저장하지 못했어요. 다시 해 주세요.', true)
    } finally {
      setBusy(null)
    }
  }

  const step = !doc ? 1 : pictures.length === 0 ? 2 : items.length === 0 ? 3 : 4

  return (
    <div className="sf-page ts-root">
      <div className="sf-page-bar">
        <Back onClick={onBack} label="똑딱업무" />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon">
          <SignIcon />
        </span>
        <div className="sf-page-title">
          <h1>똑딱서명</h1>
          <p>문서를 올리고 서명 그림을 놓으면, 서명이 들어간 PDF로 저장해요.</p>
        </div>
        <SignVideoButton variant="page" />
      </header>

      <ol className="ts-steps" aria-label="진행 순서">
        {['문서 올리기', '서명 만들기', '놓고 맞추기', '저장하기'].map((label, i) => (
          <li key={label} className={step === i + 1 ? 'is-now' : step > i + 1 ? 'is-done' : ''}>
            <span className="ts-step-no">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="ts-layout">
        <div className="ts-pages" ref={pagesRef}>
          {!doc ? (
            <div className="ts-empty">
              <SignIcon />
              <h2>서명할 문서를 올려 주세요</h2>
              <p>PDF·한글·워드·엑셀·PPT·사진을 올리면 PDF로 바꿔서 보여 드려요.</p>
              <button
                type="button"
                className="sf-primary"
                data-testid="ts-open"
                disabled={busy !== null}
                onClick={() => void openDocument()}
              >
                {busy === 'doc' && <span className="sf-spinner" aria-hidden="true" />}
                {busy === 'doc' ? 'PDF로 바꾸는 중…' : '문서 올리기'}
              </button>
              {busy === 'doc' && <p className="ts-hint">한글·오피스 문서는 몇 초 걸려요.</p>}
              {error && (
                <em className="sf-error" role="alert">
                  {error}
                </em>
              )}
            </div>
          ) : (
            doc.sizes.map((size, index) => (
              <SignPage
                key={doc.name + index + doc.sizes.length}
                pdf={doc.pdf}
                index={index}
                size={size}
                scale={scale}
                onVisibility={onVisibility}
                onBackground={() => setSelectedId(null)}
              >
                {items
                  .filter((i) => i.page === index)
                  .map((item) => (
                    <PlacedView
                      key={item.id}
                      item={item}
                      picture={pictureOf(item.sig)}
                      scale={scale}
                      page={size}
                      selected={item.id === selectedId}
                      onSelect={() => setSelectedId(item.id)}
                      onChange={change}
                      onRemove={() => remove(item.id)}
                    />
                  ))}
              </SignPage>
            ))
          )}
        </div>

        <aside className="ts-side" aria-label="서명 도구">
          <section className="sf-box ts-box">
            <h2>문서</h2>
            {doc ? (
              <p className="ts-doc-name" title={doc.name}>
                {doc.name}
                <span>
                  {doc.sizes.length}쪽{doc.converted ? ' · PDF로 바꿈' : ''}
                </span>
              </p>
            ) : (
              <p className="sf-box-sub">아직 올린 문서가 없어요.</p>
            )}
            {doc && (
              <button
                type="button"
                className="sf-secondary sf-sm"
                disabled={busy !== null}
                onClick={() => void openDocument()}
              >
                {busy === 'doc' ? 'PDF로 바꾸는 중…' : '다른 문서 올리기'}
              </button>
            )}
            {doc && error && <em className="sf-error">{error}</em>}
          </section>

          <section className="sf-box ts-box">
            <h2>서명 그림</h2>
            <p className="sf-box-sub">
              직접 그리거나 사진을 올려요. 만든 서명을 누르면 보고 있는 쪽 가운데에 놓여요.
            </p>
            {pictures.length > 0 && (
              <div className="ts-pictures">
                {pictures.map((p) => (
                  <div key={p.id} className="ts-picture">
                    <button
                      type="button"
                      className="ts-picture-use"
                      data-testid="ts-picture"
                      onClick={() => place(p)}
                      aria-label="이 서명 넣기"
                    >
                      <img src={p.url} alt="" />
                    </button>
                    <button
                      type="button"
                      className="ts-picture-forget"
                      aria-label="이 서명 그림 지우기"
                      onClick={() => forgetPicture(p.id)}
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className="ts-picture-download"
                      aria-label="이 서명 그림 내려받기 (PNG)"
                      title="PNG로 내려받기"
                      data-testid="ts-picture-download"
                      onClick={() => void downloadPicture(p)}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              hidden
              data-testid="ts-picture-file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void addPicture(file)
              }}
            />
            <div className="ts-two">
              <button
                type="button"
                className={(pictures.length ? 'sf-secondary' : 'sf-primary') + ' sf-sm'}
                data-testid="ts-draw"
                disabled={busy !== null}
                onClick={() => setPadOpen(true)}
              >
                서명 그리기
              </button>
              <button
                type="button"
                className="sf-secondary sf-sm"
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
              >
                {busy === 'picture' ? '배경 지우는 중…' : '그림 올리기'}
              </button>
            </div>
            <label className="ts-check">
              <input
                type="checkbox"
                checked={dropPaper}
                onChange={(e) => setDropPaper(e.target.checked)}
              />
              종이 배경 지우기 (사진·스캔)
            </label>
          </section>

          {selected && doc && (
            <section className="sf-box ts-box" aria-label="고른 서명">
              <h2>고른 서명</h2>
              <label className="ts-angle">
                각도
                <input
                  type="number"
                  step={1}
                  value={Math.round(selected.angle * 10) / 10}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) change({ ...selected, angle: snapAngle(v, false) })
                  }}
                />
                °
                <button
                  type="button"
                  className="sf-text-btn"
                  onClick={() => change({ ...selected, angle: 0 })}
                >
                  바로 세우기
                </button>
              </label>
              <label className="ts-angle">
                크기
                <input
                  type="range"
                  className="ts-size"
                  data-testid="ts-size"
                  min={20}
                  max={Math.round(Math.max(doc.sizes[selected.page]?.width ?? 595, 60))}
                  step={1}
                  value={Math.round(selected.width)}
                  onChange={(e) => {
                    const width = Number(e.target.value)
                    if (Number.isFinite(width) && width > 0)
                      change({
                        ...selected,
                        width,
                        height: (selected.height * width) / selected.width,
                      })
                  }}
                />
              </label>
              <p className="ts-hint">
                끌어서 옮기고, 모서리로 크기를, 위의 동그라미로 방향을 바꿔요. 화살표 키로 조금씩
                옮길 수 있어요.
              </p>
              <div className="ts-row">
                {doc.sizes.length > 1 && (
                  <button type="button" className="sf-secondary sf-sm" onClick={copyToEveryPage}>
                    모든 쪽 같은 자리에
                  </button>
                )}
                <button
                  type="button"
                  className="sf-secondary sf-sm"
                  onClick={() => remove(selected.id)}
                >
                  지우기
                </button>
                {pictureOf(selected.sig) && (
                  <button
                    type="button"
                    className="sf-secondary sf-sm"
                    onClick={() => void downloadPicture(pictureOf(selected.sig)!)}
                  >
                    서명 그림 내려받기
                  </button>
                )}
              </div>
            </section>
          )}

          <section className="sf-box ts-box">
            <button
              type="button"
              className="sf-primary ts-full"
              data-testid="ts-save"
              disabled={!doc || items.length === 0 || busy !== null}
              onClick={() => void save()}
            >
              {busy === 'save' && <span className="sf-spinner" aria-hidden="true" />}
              서명한 PDF 저장
            </button>
            {savedPath && (
              <div className="ts-saved" role="status">
                <span title={savedPath}>{savedPath.split(/[\\/]/).pop()}</span>
                <button
                  type="button"
                  className="sf-text-btn"
                  onClick={() => void window.aiOffice.openPath(savedPath)}
                >
                  열어 보기
                </button>
              </div>
            )}
            <p className="ts-note">
              서명 그림을 문서에 그려 넣어요. 인증서로 하는 전자서명과는 달라요. 서명 그림은 이
              PC에만 3개까지 기억해요.
            </p>
          </section>
        </aside>
      </div>
      <ToastView toast={toast} />
      {padOpen && <SignPad onDone={addDrawn} onClose={() => setPadOpen(false)} />}
    </div>
  )
}
