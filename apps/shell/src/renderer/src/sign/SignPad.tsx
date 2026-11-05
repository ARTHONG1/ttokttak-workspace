import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { cleanSignature } from './sign-image'
import { drawInk, steady, type InkPoint, type InkStroke } from './sign-ink'

/**
 * 똑딱서명's pad: sign with a mouse, a trackpad, a pen or a finger. The strokes become a
 * transparent PNG cropped to the ink, which joins the signature pictures like an upload.
 */

const COLORS = [
  { id: 'black', label: '검정', value: '#16181d' },
  { id: 'blue', label: '파랑', value: '#1f3fae' },
] as const
const SIZES = [
  { id: 'thin', label: '가늘게', value: 2.4 },
  { id: 'mid', label: '보통', value: 3.6 },
  { id: 'bold', label: '굵게', value: 5.4 },
] as const
/** how far behind a mouse the ink follows (a pen or a finger is followed exactly) */
const MOUSE_LAG = 0.45
/** the PNG is drawn at this many times the pad's size */
const EXPORT_SCALE = 2

export interface PadPicture {
  url: string
  width: number
  height: number
}

export function SignPad({
  onDone,
  onClose,
}: {
  onDone: (picture: PadPicture) => void
  onClose: () => void
}): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 720, height: 240 })
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  const [color, setColor] = useState<string>(COLORS[0].value)
  const [pen, setPen] = useState<number>(SIZES[1].value)
  const live = useRef<InkStroke | null>(null)
  const lag = useRef(0)

  // the pad takes the dialog's width, a third of it high
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      setSize({ width, height: Math.round(Math.max(180, Math.min(320, width / 3))) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const redraw = useCallback(
    (list: InkStroke[]) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(size.width * dpr)) {
        canvas.width = Math.round(size.width * dpr)
        canvas.height = Math.round(size.height * dpr)
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawInk(ctx, live.current ? [...list, live.current] : list, dpr)
    },
    [size],
  )
  useEffect(() => redraw(strokes), [redraw, strokes])

  // Ctrl/⌘+Z takes the last stroke back, Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        setStrokes((list) => list.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pointOf = (e: PointerEvent | ReactPointerEvent): InkPoint => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const p = e.pointerType === 'mouse' || !(e.pressure > 0) ? 0.5 : e.pressure
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, p, t: e.timeStamp }
  }

  /** one redraw per frame while a stroke is drawn (a signature is a few strokes: cheap) */
  const frame = useRef(0)
  const scheduleRedraw = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      redraw(strokes)
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    lag.current = e.pointerType === 'mouse' ? MOUSE_LAG : 0
    live.current = { color, size: pen, points: [pointOf(e)] }
    redraw(strokes)
  }

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = live.current
    if (!stroke) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const raw = pointOf(ev)
      const prev = stroke.points[stroke.points.length - 1]!
      if (Math.hypot(raw.x - prev.x, raw.y - prev.y) < 0.8) continue
      stroke.points.push(steady(prev, raw, lag.current))
    }
    scheduleRedraw()
  }

  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = live.current
    if (!stroke) return
    live.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // the ink catches up with where the pointer let go
    const last = pointOf(e)
    const prev = stroke.points[stroke.points.length - 1]!
    if (stroke.points.length > 1 && Math.hypot(last.x - prev.x, last.y - prev.y) > 0.8)
      stroke.points.push(last)
    setStrokes((list) => [...list, stroke])
  }

  const finish = () => {
    if (strokes.length === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(size.width * EXPORT_SCALE)
    canvas.height = Math.round(size.height * EXPORT_SCALE)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    drawInk(ctx, strokes, EXPORT_SCALE)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    // the ink alone: the pad is transparent, so this only crops
    const cropped = cleanSignature({
      data: pixels.data,
      width: canvas.width,
      height: canvas.height,
    })
    if (!cropped) return
    const out = document.createElement('canvas')
    out.width = cropped.width
    out.height = cropped.height
    out
      .getContext('2d')
      ?.putImageData(
        new ImageData(
          cropped.data as Uint8ClampedArray<ArrayBuffer>,
          cropped.width,
          cropped.height,
        ),
        0,
        0,
      )
    onDone({ url: out.toDataURL('image/png'), width: cropped.width, height: cropped.height })
  }

  return (
    <div
      className="ts-pad-overlay"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="ts-pad" role="dialog" aria-modal="true" aria-label="서명 그리기">
        <div className="ts-pad-head">
          <h2>서명 그리기</h2>
          <p>마우스나 트랙패드, 펜, 손가락으로 서명하세요. 다 쓰면 [완료]를 눌러요.</p>
        </div>
        <div className="ts-pad-tools">
          <div className="ts-seg" role="group" aria-label="펜 색">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={color === c.value ? 'is-on' : ''}
                aria-pressed={color === c.value}
                onClick={() => setColor(c.value)}
              >
                <span className="ts-swatch" style={{ background: c.value }} />
                {c.label}
              </button>
            ))}
          </div>
          <div className="ts-seg" role="group" aria-label="펜 굵기">
            {SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={pen === s.value ? 'is-on' : ''}
                aria-pressed={pen === s.value}
                onClick={() => setPen(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="ts-pad-gap" />
          <button
            type="button"
            className="sf-text-btn"
            disabled={strokes.length === 0}
            onClick={() => setStrokes((list) => list.slice(0, -1))}
            title="한 획 되돌리기 (Ctrl+Z)"
          >
            되돌리기
          </button>
          <button
            type="button"
            className="sf-text-btn"
            disabled={strokes.length === 0}
            onClick={() => setStrokes([])}
          >
            다시 쓰기
          </button>
        </div>
        <div ref={wrapRef} className="ts-pad-area" style={{ height: size.height }}>
          <span className="ts-pad-line" aria-hidden="true">
            <span>×</span>
          </span>
          <canvas
            ref={canvasRef}
            className="ts-pad-canvas"
            data-testid="ts-pad-canvas"
            style={{ width: size.width, height: size.height }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          {strokes.length === 0 && <span className="ts-pad-hint">여기에 서명하세요</span>}
        </div>
        <div className="ts-pad-foot">
          <button type="button" className="sf-secondary sf-sm" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="sf-primary sf-sm"
            data-testid="ts-pad-done"
            disabled={strokes.length === 0}
            onClick={finish}
          >
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
