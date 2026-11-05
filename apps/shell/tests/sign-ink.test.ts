import { describe, expect, it } from 'vitest'
import {
  drawInk,
  inkBounds,
  inkSegments,
  inkWidth,
  steady,
  type InkPoint,
  type InkStroke,
} from '../src/renderer/src/sign/sign-ink'

const pt = (x: number, y: number, t = 0, p = 0.5): InkPoint => ({ x, y, t, p })

describe('inkWidth', () => {
  it('grows with pen pressure', () => {
    expect(inkWidth(4, 0.9, 0)).toBeGreaterThan(inkWidth(4, 0.2, 0))
  })

  it('thins a fast stroke, but never to a hairline', () => {
    expect(inkWidth(4, 0.5, 3)).toBeLessThan(inkWidth(4, 0.5, 0))
    expect(inkWidth(4, 0.5, 100)).toBeGreaterThanOrEqual(4 * 0.45)
  })
})

describe('steady', () => {
  it('follows the pointer part of the way, which takes the shake out of a mouse', () => {
    const next = steady(pt(0, 0), pt(10, 0), 0.4)
    expect(next.x).toBeCloseTo(6)
    expect(next.y).toBe(0)
  })

  it('follows a pen exactly', () => {
    expect(steady(pt(0, 0), pt(10, 4), 0).x).toBe(10)
  })
})

describe('inkSegments', () => {
  const stroke: InkStroke = {
    color: '#111',
    size: 4,
    points: [pt(0, 0, 0), pt(10, 0, 10), pt(20, 10, 20), pt(30, 10, 30)],
  }

  it('runs from the first point to the last through curves that meet end to end', () => {
    const segs = inkSegments(stroke)
    expect(segs[0]!.x0).toBe(0)
    expect(segs[0]!.y0).toBe(0)
    expect(segs.at(-1)!.x1).toBe(30)
    expect(segs.at(-1)!.y1).toBe(10)
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.x0).toBeCloseTo(segs[i - 1]!.x1)
      expect(segs[i]!.y0).toBeCloseTo(segs[i - 1]!.y1)
    }
  })

  it('bends towards the points between (they are the control points)', () => {
    const segs = inkSegments(stroke)
    expect(segs.some((s) => s.cx === 10 && s.cy === 0)).toBe(true)
  })
})

describe('inkBounds', () => {
  it('holds every stroke with half its width around it', () => {
    const b = inkBounds([
      { color: '#111', size: 4, points: [pt(10, 20), pt(50, 30)] },
      { color: '#111', size: 4, points: [pt(5, 40)] },
    ])!
    expect(b.x0).toBeLessThan(5)
    expect(b.y1).toBeGreaterThan(40)
    expect(b.x1).toBeGreaterThan(50)
  })

  it('is nothing for an empty pad', () => {
    expect(inkBounds([])).toBeNull()
  })
})

describe('drawInk', () => {
  it('draws a tap as a round dot and a stroke as curves', () => {
    const calls: string[] = []
    const ctx = {
      lineCap: '',
      lineJoin: '',
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
      beginPath: () => calls.push('begin'),
      moveTo: () => calls.push('move'),
      quadraticCurveTo: () => calls.push('curve'),
      arc: () => calls.push('arc'),
      fill: () => calls.push('fill'),
      stroke: () => calls.push('stroke'),
    }
    drawInk(ctx, [{ color: '#111', size: 4, points: [pt(5, 5)] }], 1)
    expect(calls).toContain('arc')
    calls.length = 0
    drawInk(
      ctx,
      [{ color: '#111', size: 4, points: [pt(0, 0, 0), pt(10, 0, 10), pt(20, 5, 20)] }],
      2,
    )
    expect(calls.filter((c) => c === 'curve').length).toBeGreaterThan(0)
    expect(ctx.lineCap).toBe('round')
  })
})
