import { describe, expect, it } from 'vitest'
import {
  angleFromPointer,
  clampToPage,
  newPlacement,
  onEveryPage,
  snapAngle,
} from '../src/renderer/src/sign/sign-place'

const A4 = { width: 595, height: 842 }

describe('newPlacement', () => {
  it('starts a signature signature-sized in the middle of the page, its shape kept', () => {
    const p = newPlacement({ width: 800, height: 300 }, A4)
    expect(p.cx).toBeCloseTo(A4.width / 2)
    expect(p.cy).toBeCloseTo(A4.height / 2)
    expect(p.width).toBeLessThanOrEqual(160)
    expect(p.height / p.width).toBeCloseTo(300 / 800)
    expect(p.angle).toBe(0)
  })

  it('keeps a tall stamp from covering the page', () => {
    const p = newPlacement({ width: 100, height: 400 }, A4)
    expect(p.height).toBeLessThanOrEqual(A4.height * 0.2 + 1e-9)
  })
})

describe('angles', () => {
  it('reads the handle straight above the centre as upright', () => {
    expect(angleFromPointer(100, 100, 100, 40)).toBeCloseTo(0)
    expect(angleFromPointer(100, 100, 160, 100)).toBeCloseTo(90)
    expect(angleFromPointer(100, 100, 40, 100)).toBeCloseTo(-90)
  })

  it('settles near a right angle onto it, and leaves other angles free', () => {
    expect(snapAngle(2.5, false)).toBe(0)
    expect(snapAngle(-88, false)).toBe(-90)
    expect(snapAngle(17, false)).toBe(17)
  })

  it('steps by 15 degrees with Shift', () => {
    expect(snapAngle(22, true)).toBe(15)
    expect(snapAngle(23, true)).toBe(30)
  })

  it('keeps angles between -180 and 180', () => {
    expect(snapAngle(190, false)).toBe(-170)
    expect(snapAngle(-200, false)).toBe(160)
  })
})

describe('clampToPage', () => {
  it('keeps the centre on the page', () => {
    const p = clampToPage({ cx: -20, cy: 900, width: 50, height: 20, angle: 0 }, A4)
    expect(p.cx).toBe(0)
    expect(p.cy).toBe(A4.height)
  })
})

describe('onEveryPage', () => {
  it('puts the same signature at the same spot of every other page', () => {
    const sizes = [A4, A4, { width: 842, height: 595 }]
    const item = { id: 'a', page: 0, sig: 's', cx: 500, cy: 780, width: 80, height: 30, angle: 10 }
    let n = 0
    const copies = onEveryPage(item, sizes, () => 'c' + n++)
    expect(copies.map((c) => c.page)).toEqual([1, 2])
    expect(copies[0]).toMatchObject({ cx: 500, cy: 780, width: 80, angle: 10, sig: 's' })
    // a landscape page: the same place relative to its corner
    expect(copies[1]!.cx).toBeCloseTo((500 / 595) * 842)
    expect(copies[1]!.cy).toBeCloseTo((780 / 842) * 595)
  })
})
