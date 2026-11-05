/**
 * 똑딱서명's signature pad: hand strokes as smooth ink. Points come from pointer events
 * with the pen's pressure (a mouse presses 0.5); a mouse's shake is taken out by
 * following the pointer only part of the way, each stroke is drawn as quadratic curves
 * through the midpoints of its points, and its width follows pressure and slows down
 * the faster it goes, as a pen's line does.
 */

export interface InkPoint {
  x: number
  y: number
  /** pressure 0–1 */
  p: number
  /** time, ms */
  t: number
}

export interface InkStroke {
  color: string
  /** base width at pressure 0.5, pad pixels */
  size: number
  points: InkPoint[]
}

export interface InkSegment {
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
  width: number
}

/** the drawing calls drawInk uses: a canvas 2D context has them all */
export interface InkCanvas {
  lineCap: string
  lineJoin: string
  lineWidth: number
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  beginPath(): void
  moveTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  fill(): void
  stroke(): void
}

/** a line's width: pressure widens it, speed (pad pixels per ms) thins it to no less than 45% */
export function inkWidth(size: number, pressure: number, speed: number): number {
  const press = 0.55 + Math.min(1, Math.max(0, pressure)) * 0.9
  const pace = Math.max(0.45, 1 - Math.min(speed, 4) * 0.14)
  return size * press * pace
}

/** where the ink goes when the pointer moves to `raw`: `lag` 0 follows exactly */
export function steady(prev: InkPoint, raw: InkPoint, lag: number): InkPoint {
  const k = 1 - Math.min(0.9, Math.max(0, lag))
  return {
    x: prev.x + (raw.x - prev.x) * k,
    y: prev.y + (raw.y - prev.y) * k,
    p: raw.p,
    t: raw.t,
  }
}

const mid = (a: InkPoint, b: InkPoint): [number, number] => [(a.x + b.x) / 2, (a.y + b.y) / 2]

export function inkSegments(stroke: InkStroke): InkSegment[] {
  const pts = stroke.points
  if (pts.length < 2) return []
  const out: InkSegment[] = []
  let width = inkWidth(stroke.size, pts[0]!.p, 0)
  let [x0, y0] = [pts[0]!.x, pts[0]!.y]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t)
    // the width eases towards its new value so a line does not jump in thickness
    width += (inkWidth(stroke.size, b.p, speed) - width) * 0.35
    const last = i === pts.length - 1
    // each curve bends at a point and ends halfway to the next; the last runs straight
    const [x1, y1] = last ? [b.x, b.y] : mid(b, pts[i + 1]!)
    const [cx, cy] = last ? [(x0 + x1) / 2, (y0 + y1) / 2] : [b.x, b.y]
    out.push({ x0, y0, cx, cy, x1, y1, width })
    x0 = x1
    y0 = y1
  }
  return out
}

export function inkBounds(
  strokes: readonly InkStroke[],
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of strokes) {
    const r = s.size
    for (const p of s.points) {
      x0 = Math.min(x0, p.x - r)
      y0 = Math.min(y0, p.y - r)
      x1 = Math.max(x1, p.x + r)
      y1 = Math.max(y1, p.y + r)
    }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 }
}

/** draw the strokes at `scale` (pad pixels → canvas pixels) */
export function drawInk(ctx: InkCanvas, strokes: readonly InkStroke[], scale: number): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    if (s.points.length === 1) {
      const p = s.points[0]!
      ctx.beginPath()
      ctx.arc(p.x * scale, p.y * scale, (inkWidth(s.size, p.p, 0) / 2) * scale, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    for (const g of inkSegments(s)) {
      ctx.beginPath()
      ctx.lineWidth = g.width * scale
      ctx.moveTo(g.x0 * scale, g.y0 * scale)
      ctx.quadraticCurveTo(g.cx * scale, g.cy * scale, g.x1 * scale, g.y1 * scale)
      ctx.stroke()
    }
  }
}
