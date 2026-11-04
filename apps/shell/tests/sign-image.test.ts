import { describe, expect, it } from 'vitest'
import { cleanSignature, otsuThreshold, type Rgba } from '../src/renderer/src/sign/sign-image'

/** a w×h picture of `bg` with a filled rectangle of `ink` */
function picture(
  w: number,
  h: number,
  bg: [number, number, number, number],
  ink?: { x: number; y: number; w: number; h: number; c: [number, number, number, number] },
): Rgba {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = ink && x >= ink.x && x < ink.x + ink.w && y >= ink.y && y < ink.y + ink.h
      data.set(inside ? ink.c : bg, (y * w + x) * 4)
    }
  }
  return { data, width: w, height: h }
}

const px = (img: Rgba, x: number, y: number) =>
  Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4))

describe('otsuThreshold', () => {
  it('splits two groups of brightness between them', () => {
    const hist = new Array<number>(256).fill(0)
    hist[30] = 100
    hist[40] = 50
    hist[220] = 900
    hist[235] = 400
    const t = otsuThreshold(hist)
    expect(t).toBeGreaterThanOrEqual(40)
    expect(t).toBeLessThan(220)
  })
})

describe('cleanSignature', () => {
  it('drops a white background and crops to the ink with a small margin', () => {
    const img = picture(60, 30, [255, 255, 255, 255], {
      x: 20,
      y: 10,
      w: 10,
      h: 5,
      c: [0, 0, 0, 255],
    })
    const out = cleanSignature(img)!
    expect(out.width).toBe(10 + 8)
    expect(out.height).toBe(5 + 8)
    expect(px(out, 0, 0)[3]).toBe(0)
    expect(px(out, 6, 6)).toEqual([0, 0, 0, 255])
  })

  it('keeps the pen colour', () => {
    const img = picture(40, 20, [250, 250, 250, 255], {
      x: 10,
      y: 5,
      w: 12,
      h: 6,
      c: [20, 40, 200, 255],
    })
    const out = cleanSignature(img)!
    const [r, , b, a] = px(out, 8, 6)
    expect(a).toBe(255)
    expect(b!).toBeGreaterThan(180)
    expect(r!).toBeLessThan(60)
  })

  it('finds the paper in a photo whose paper is not white', () => {
    const img = picture(40, 20, [205, 198, 180, 255], {
      x: 10,
      y: 5,
      w: 12,
      h: 6,
      c: [45, 40, 38, 255],
    })
    const out = cleanSignature(img)!
    expect(px(out, 0, 0)[3]).toBe(0)
    expect(px(out, 8, 6)[3]).toBe(255)
  })

  it('leaves a picture that is already see-through as it is, only cropped', () => {
    const img = picture(40, 20, [255, 255, 255, 0], {
      x: 10,
      y: 5,
      w: 12,
      h: 6,
      c: [200, 200, 200, 255],
    })
    const out = cleanSignature(img)!
    // light grey ink would be taken for paper by the brightness rule; its own alpha wins
    expect(px(out, 8, 6)).toEqual([200, 200, 200, 255])
    expect(out.width).toBe(12 + 8)
  })

  it('finds nothing on a blank page', () => {
    expect(cleanSignature(picture(30, 30, [255, 255, 255, 255]))).toBeNull()
  })

  it('leaves no grey haze from speckled, unevenly lit paper', () => {
    // a phone photo: paper darker towards the right, with grain; a dark stroke in the middle
    const w = 120
    const h = 60
    const data = new Uint8ClampedArray(w * h * 4)
    let seed = 7
    const noise = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % 17) - 8
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ink = y >= 26 && y < 34 && x >= 20 && x < 100
        const paper = 232 - Math.round((24 * x) / w) + noise()
        data.set(ink ? [30, 45, 150, 255] : [paper, paper - 6, paper - 22, 255], (y * w + x) * 4)
      }
    }
    const out = cleanSignature({ data, width: w, height: h })!
    let haze = 0
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const inStroke = y >= 4 && y < 12 && x >= 4 && x < 84
        if (!inStroke && out.data[(y * out.width + x) * 4 + 3]! > 0) haze++
      }
    }
    expect(haze).toBe(0)
    expect(px(out, 40, 8)[3]).toBe(255)
  })
})
