/**
 * 똑딱서명: a signature picture made ready to stamp. A photo or scan of a signature on
 * paper loses its paper (transparent), keeps its pen colour, and is cropped to the ink.
 * Paper and ink are told apart by Otsu's threshold on brightness taken relative to the paper
 * around each pixel, so grey, yellowish or unevenly lit paper is found too. A picture that already has transparency keeps its own.
 */

export interface Rgba {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** pixels whose alpha is below this count as empty when cropping */
const EMPTY_ALPHA = 24
/** room kept around the ink, in pixels */
const MARGIN = 4

/** brightness 0–255, whole numbers: the histogram's bins and the threshold compare alike */
const lum = (r: number, g: number, b: number) => Math.round(0.299 * r + 0.587 * g + 0.114 * b)

/** Otsu's method: the brightness that best splits the histogram into two groups */
export function otsuThreshold(hist: readonly number[]): number {
  let total = 0
  let sum = 0
  for (let i = 0; i < 256; i++) {
    total += hist[i] ?? 0
    sum += i * (hist[i] ?? 0)
  }
  let below = 0
  let sumBelow = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    below += hist[t] ?? 0
    if (below === 0) continue
    const above = total - below
    if (above === 0) break
    sumBelow += t * (hist[t] ?? 0)
    const meanBelow = sumBelow / below
    const meanAbove = (sum - sumBelow) / above
    const between = below * above * (meanBelow - meanAbove) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

function hasTransparency(img: Rgba): boolean {
  const n = img.width * img.height
  let clear = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 250) clear++
  return clear > n * 0.01
}

/**
 * each pixel's paper: the brightest brightness within `r` pixels (a max filter, rows then
 * columns), never darker than `floor` so the inside of a wide stroke is not taken for paper
 */
function localPaper(l: Uint8Array, w: number, h: number, r: number, floor: number): Uint8Array {
  const rows = new Uint8Array(l.length)
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, x - r), b = Math.min(w - 1, x + r); k <= b; k++)
        if (l[o + k]! > m) m = l[o + k]!
      rows[o + x] = m
    }
  }
  const out = new Uint8Array(l.length)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0
      for (let k = Math.max(0, y - r), b = Math.min(h - 1, y + r); k <= b; k++)
        if (rows[k * w + x]! > m) m = rows[k * w + x]!
      out[y * w + x] = Math.max(m, floor)
    }
  }
  return out
}

/** the brightness below which `share` of the counted pixels lie */
function percentile(hist: readonly number[], share: number): number {
  let total = 0
  for (const n of hist) total += n
  let seen = 0
  for (let i = 0; i < 256; i++) {
    seen += hist[i] ?? 0
    if (seen >= total * share) return i
  }
  return 255
}

/**
 * paper turned transparent, the ink's own colour recovered from its blend with the paper.
 * Brightness is first taken relative to the paper around each pixel, so a photo lit
 * unevenly or on grainy paper reads as one even sheet; then Otsu's threshold splits ink
 * from paper, and everything on the paper side is fully transparent.
 */
function dropPaper(img: Rgba): Uint8ClampedArray {
  const { data, width: w, height: h } = img
  const n = w * h
  const l = new Uint8Array(n)
  const all = new Array<number>(256).fill(0)
  for (let p = 0; p < n; p++) {
    const v = lum(data[p * 4]!, data[p * 4 + 1]!, data[p * 4 + 2]!)
    l[p] = v
    all[v]!++
  }
  const paperAround = localPaper(
    l,
    w,
    h,
    Math.max(8, Math.round(Math.max(w, h) / 40)),
    Math.round(percentile(all, 0.9) * 0.75),
  )
  const rel = new Uint8Array(n)
  const hist = new Array<number>(256).fill(0)
  for (let p = 0; p < n; p++) {
    const v = Math.min(255, Math.round((l[p]! * 255) / Math.max(1, paperAround[p]!)))
    rel[p] = v
    hist[v]!++
  }
  const t = otsuThreshold(hist)
  let inkN = 0
  let inkSum = 0
  let paperN = 0
  const paperHist = new Array<number>(256).fill(0)
  const paper = [0, 0, 0]
  for (let p = 0; p < n; p++) {
    const v = rel[p]!
    if (v > t) {
      paperN++
      paperHist[v]!++
      paper[0]! += data[p * 4]!
      paper[1]! += data[p * 4 + 1]!
      paper[2]! += data[p * 4 + 2]!
    } else {
      inkN++
      inkSum += v
    }
  }
  const out = new Uint8ClampedArray(data.length)
  // no ink, or a picture of one colour: nothing to keep
  if (paperN === 0 || inkN === 0) return out
  const ink = inkSum / inkN
  // the darkest of the paper (its grain): from here down a pixel starts to be ink
  const paperFloor = percentile(paperHist, 0.01)
  const span = Math.max(1, paperFloor - ink)
  const bg = paper.map((c) => c / paperN)
  for (let p = 0; p < n; p++) {
    const a = Math.min(1, Math.max(0, (paperFloor - rel[p]!) / span))
    // a breath of darkness is grain, not ink
    if (a < 0.1) continue
    const i = p * 4
    for (let c = 0; c < 3; c++) out[i + c] = (data[i + c]! - (1 - a) * bg[c]!) / a
    out[i + 3] = Math.round(a * 255)
  }
  return out
}

/** the signature, cropped to its ink; null when the picture holds no ink */
export function cleanSignature(img: Rgba): Rgba | null {
  const data = hasTransparency(img) ? img.data : dropPaper(img)
  let x0 = img.width
  let y0 = img.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (data[(y * img.width + x) * 4 + 3]! < EMPTY_ALPHA) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  x0 = Math.max(0, x0 - MARGIN)
  y0 = Math.max(0, y0 - MARGIN)
  x1 = Math.min(img.width - 1, x1 + MARGIN)
  y1 = Math.min(img.height - 1, y1 + MARGIN)
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * img.width + x0) * 4
    out.set(data.subarray(from, from + width * 4), y * width * 4)
  }
  return { data: out, width, height }
}
