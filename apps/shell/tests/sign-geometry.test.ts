import { describe, expect, it } from 'vitest'
import {
  imageDrawFor,
  pdfToView,
  turnOf,
  viewCorners,
  viewSize,
  viewToPdf,
  type PdfBox,
  type Placement,
} from '../src/renderer/src/sign/sign-geometry'

const box: PdfBox = { x: 10, y: 20, width: 600, height: 800 }
const TURNS = [0, 90, 180, 270] as const

describe('turnOf', () => {
  it('folds any multiple of 90 into one quarter turn', () => {
    expect(turnOf(0)).toBe(0)
    expect(turnOf(450)).toBe(90)
    expect(turnOf(-90)).toBe(270)
    expect(turnOf(180)).toBe(180)
  })
})

describe('view ↔ PDF', () => {
  it('swaps the sides of a page turned a quarter', () => {
    expect(viewSize(box, 0)).toEqual({ width: 600, height: 800 })
    expect(viewSize(box, 90)).toEqual({ width: 800, height: 600 })
    expect(viewSize(box, 270)).toEqual({ width: 800, height: 600 })
  })

  it('puts the top-left of the view where the page shows it', () => {
    // upright: the top-left of the page box
    expect(viewToPdf(0, 0, box, 0)).toEqual([10, 820])
    // turned clockwise a quarter: what shows top-left is the box's bottom-left
    expect(viewToPdf(0, 0, box, 90)).toEqual([10, 20])
    expect(viewToPdf(0, 0, box, 180)).toEqual([610, 20])
    expect(viewToPdf(0, 0, box, 270)).toEqual([610, 820])
  })

  it.each(TURNS)('goes there and back at %s°', (turn) => {
    for (const [vx, vy] of [
      [0, 0],
      [123, 45],
      [300, 500],
    ] as const) {
      const [px, py] = viewToPdf(vx, vy, box, turn)
      const [bx, by] = pdfToView(px, py, box, turn)
      expect(bx).toBeCloseTo(vx, 9)
      expect(by).toBeCloseTo(vy, 9)
    }
  })
})

/** where the image's own corners (top-left, top-right, bottom-right, bottom-left) land in view */
function drawnCorners(p: Placement, turn: (typeof TURNS)[number]): [number, number][] {
  const d = imageDrawFor(p, box, turn)
  const a = (d.rotate * Math.PI) / 180
  const u = [Math.cos(a), Math.sin(a)] // the image's width direction in PDF space
  const v = [-Math.sin(a), Math.cos(a)] // its height direction (PDF y up)
  const at = (s: number, t: number): [number, number] =>
    pdfToView(
      d.x + u[0]! * s * d.width + v[0]! * t * d.height,
      d.y + u[1]! * s * d.width + v[1]! * t * d.height,
      box,
      turn,
    )
  // an image's unit square has its top row at t = 1
  return [at(0, 1), at(1, 1), at(1, 0), at(0, 0)]
}

describe('imageDrawFor', () => {
  it('draws an upright signature as a plain rectangle', () => {
    const d = imageDrawFor({ cx: 100, cy: 100, width: 80, height: 40, angle: 0 }, box, 0)
    expect(d).toEqual({ x: 70, y: 700, width: 80, height: 40, rotate: 0 })
  })

  it.each(TURNS.flatMap((turn) => [0, 30, 90, 137, 270].map((angle) => [turn, angle] as const)))(
    'lands every corner where the view shows it (page %s°, signature %s°)',
    (turn, angle) => {
      const p: Placement = { cx: 250, cy: 310, width: 120, height: 50, angle }
      const want = viewCorners(p)
      const got = drawnCorners(p, turn)
      for (let i = 0; i < 4; i++) {
        expect(got[i]![0]).toBeCloseTo(want[i]![0], 6)
        expect(got[i]![1]).toBeCloseTo(want[i]![1], 6)
      }
    },
  )

  it('turns the view corners clockwise with the angle', () => {
    const [tl] = viewCorners({ cx: 0, cy: 0, width: 2, height: 2, angle: 90 })
    // the top-left corner (-1,-1) turned a quarter clockwise on a y-down screen: (1,-1)
    expect(tl![0]).toBeCloseTo(1, 9)
    expect(tl![1]).toBeCloseTo(-1, 9)
  })
})
