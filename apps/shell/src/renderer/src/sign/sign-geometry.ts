/**
 * 똑딱서명's geometry: where a signature placed on the page view goes in the PDF.
 *
 * View space is the page as pdf.js shows it at scale 1: points, y down, the page's /Rotate
 * applied, its crop box filling the view. A placement is a signature's centre, size and
 * clockwise angle there. PDF space is the page's own: y up, unrotated.
 */

/** the page's crop box in PDF space */
export interface PdfBox {
  x: number
  y: number
  width: number
  height: number
}

export type Turn = 0 | 90 | 180 | 270

/** a signature on the view: centre, size (points) and clockwise angle (degrees) */
export interface Placement {
  cx: number
  cy: number
  width: number
  height: number
  angle: number
}

/** pdf-lib's drawImage arguments: bottom-left corner, size, counter-clockwise turn */
export interface ImageDraw {
  x: number
  y: number
  width: number
  height: number
  rotate: number
}

export function turnOf(degrees: number): Turn {
  const t = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360
  return t as Turn
}

export function viewSize(box: PdfBox, turn: Turn): { width: number; height: number } {
  return turn === 90 || turn === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height }
}

export function viewToPdf(vx: number, vy: number, box: PdfBox, turn: Turn): [number, number] {
  const W = box.width
  const H = box.height
  let u: number
  let v: number
  if (turn === 0) [u, v] = [vx, H - vy]
  else if (turn === 90) [u, v] = [vy, vx]
  else if (turn === 180) [u, v] = [W - vx, vy]
  else [u, v] = [W - vy, H - vx]
  return [box.x + u, box.y + v]
}

export function pdfToView(px: number, py: number, box: PdfBox, turn: Turn): [number, number] {
  const u = px - box.x
  const v = py - box.y
  const W = box.width
  const H = box.height
  if (turn === 0) return [u, H - v]
  if (turn === 90) return [v, u]
  if (turn === 180) return [W - u, v]
  return [H - v, W - u]
}

/** the signature's corners on the view: top-left, top-right, bottom-right, bottom-left */
export function viewCorners(p: Placement): [number, number][] {
  const a = (p.angle * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const w = p.width / 2
  const h = p.height / 2
  // clockwise on a y-down screen
  const at = (x: number, y: number): [number, number] => [
    p.cx + x * cos - y * sin,
    p.cy + x * sin + y * cos,
  ]
  return [at(-w, -h), at(w, -h), at(w, h), at(-w, h)]
}

export function imageDrawFor(p: Placement, box: PdfBox, turn: Turn): ImageDraw {
  const [cx, cy] = viewToPdf(p.cx, p.cy, box, turn)
  // the page shows PDF space turned clockwise by `turn`; the signature must look turned
  // clockwise by its angle, so in PDF space it turns counter-clockwise by turn − angle
  const rotate = turn - p.angle
  const a = (rotate * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const w = p.width / 2
  const h = p.height / 2
  // pdf-lib turns the image about its bottom-left corner: find that corner from the centre
  const x = cx - (w * cos - h * sin)
  const y = cy - (w * sin + h * cos)
  const tidy = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n)
  return {
    x: tidy(x),
    y: tidy(y),
    width: p.width,
    height: p.height,
    rotate: tidy(((rotate % 360) + 360) % 360),
  }
}
