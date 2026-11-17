import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import type { ImageRecoder } from '../../../../pdf/src/main/compress'
import { readImageInfo } from '../../../../pdf/src/main/images-to-pdf'

/**
 * 똑딱정리's "make smaller" for the pictures inside a document: a large picture is stored again
 * at a smaller size in its own format (a JPEG stays a JPEG, a PNG a PNG), so nothing that points
 * at it has to change and the document opens the same way. A picture that would not come out
 * clearly smaller is kept as it is, and so is a JPEG with an EXIF orientation (a decoder may
 * turn it; the document does not).
 *
 * The picture work itself is the caller's: on the desktop Chromium's image code (nativeImage,
 * fast), on the web edition the pure JavaScript coders here, which run anywhere.
 */

export type PictureKind = 'jpeg' | 'png'

export interface PictureTarget {
  /** longest side in pixels; never grown */
  longSide: number
  /** JPEG quality, 1-100 */
  quality: number
}

/** the bytes shrunk to fit the target and encoded again as the same kind; null when it cannot */
export type PictureRecoder = (
  bytes: Uint8Array,
  kind: PictureKind,
  target: PictureTarget,
) => Promise<Uint8Array | null>

/** what documents ask for: sharp on a screen and in print at A4 */
export const DOCUMENT_PICTURE_TARGET: PictureTarget = { longSide: 2000, quality: 80 }

/** pictures smaller than this are left as they are: little to win */
const MIN_PICTURE_BYTES = 48 * 1024

/** a new picture is kept only when it saves at least a tenth */
const KEEP_BELOW = 0.9

/** what a stored picture is, when 똑딱정리 may shrink it */
export function shrinkablePicture(
  bytes: Uint8Array,
  target: PictureTarget,
): { kind: PictureKind; width: number; height: number } | null {
  if (bytes.length < MIN_PICTURE_BYTES) return null
  const info = readImageInfo(bytes)
  if (!info || info.orientation !== 1) return null
  const kind: PictureKind = info.kind === 'png' ? 'png' : 'jpeg'
  // a PNG of the same size written again rarely comes out smaller
  if (kind === 'png' && Math.max(info.width, info.height) <= target.longSide) return null
  return { kind, width: info.width, height: info.height }
}

/** the smaller picture, of the same kind, or null to keep the original */
export async function shrinkPicture(
  bytes: Uint8Array,
  recode: PictureRecoder,
  target: PictureTarget = DOCUMENT_PICTURE_TARGET,
): Promise<Uint8Array | null> {
  const source = shrinkablePicture(bytes, target)
  if (!source) return null
  let made: Uint8Array | null
  try {
    made = await recode(bytes, source.kind, target)
  } catch {
    return null
  }
  if (!made || made.length >= bytes.length * KEEP_BELOW) return null
  const back = readImageInfo(made)
  if (!back || (back.kind === 'png') !== (source.kind === 'png')) return null
  // the picture must keep its shape: a document sizes it by its box, not its pixels
  const before = source.width / source.height
  const after = back.width / back.height
  if (Math.abs(before - after) > 0.02 * before) return null
  return made
}

const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** the size that fits longSide, never grown */
export function fittedSize(
  width: number,
  height: number,
  longSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** RGBA pixels made smaller by averaging the source pixels each new pixel covers */
export function shrinkRgba(
  data: Uint8Array,
  width: number,
  height: number,
  to: { width: number; height: number },
): Uint8Array {
  if (to.width === width && to.height === height) return data
  const out = new Uint8Array(to.width * to.height * 4)
  const xs = new Int32Array(to.width + 1)
  for (let x = 0; x <= to.width; x++) xs[x] = Math.min(width, Math.floor((x * width) / to.width))
  for (let y = 0; y < to.height; y++) {
    const y0 = Math.floor((y * height) / to.height)
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor(((y + 1) * height) / to.height)))
    for (let x = 0; x < to.width; x++) {
      const x0 = xs[x]!
      const x1 = Math.max(x0 + 1, xs[x + 1]!)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = y0; sy < y1; sy++) {
        let i = (sy * width + x0) * 4
        for (let sx = x0; sx < x1; sx++, i += 4) {
          r += data[i]!
          g += data[i + 1]!
          b += data[i + 2]!
          a += data[i + 3]!
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      const o = (y * to.width + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

/** the most a JPEG or PNG may unpack to in the pure coders (a guard against decompression bombs) */
const MAX_MEGAPIXELS = 120

function decodeJpeg(bytes: Uint8Array): { data: Uint8Array; width: number; height: number } {
  const image = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    maxResolutionInMP: MAX_MEGAPIXELS,
    maxMemoryUsageInMB: 1024,
  })
  return { data: image.data, width: image.width, height: image.height }
}

function encodeJpeg(data: Uint8Array, width: number, height: number, quality: number): Uint8Array {
  return new Uint8Array(jpeg.encode({ data, width, height }, quality).data)
}

/** the web edition's picture code: jpeg-js and pngjs, no native parts */
export const recodePictureInJs: PictureRecoder = async (bytes, kind, target) => {
  await turn()
  if (kind === 'jpeg') {
    const image = decodeJpeg(bytes)
    const size = fittedSize(image.width, image.height, target.longSide)
    const pixels = shrinkRgba(image.data, image.width, image.height, size)
    return encodeJpeg(pixels, size.width, size.height, target.quality)
  }
  const info = readImageInfo(bytes)
  if (!info || info.width * info.height > MAX_MEGAPIXELS * 1e6) return null
  const png = PNG.sync.read(Buffer.from(bytes))
  const size = fittedSize(png.width, png.height, target.longSide)
  const pixels = shrinkRgba(new Uint8Array(png.data), png.width, png.height, size)
  const out = new PNG({ width: size.width, height: size.height })
  out.data = Buffer.from(pixels)
  return new Uint8Array(PNG.sync.write(out, { deflateLevel: 9 }))
}

/** the same pure coders for the PDF editor's "make smaller" (a picture becomes an RGB JPEG) */
export const recodePdfImageInJs: ImageRecoder = async (image, target) => {
  await turn()
  let rgba: Uint8Array
  let width: number
  let height: number
  if (image.kind === 'jpeg') {
    const decoded = decodeJpeg(image.bytes)
    if (decoded.width !== image.width || decoded.height !== image.height) return null
    rgba = decoded.data
    width = decoded.width
    height = decoded.height
  } else {
    width = image.width
    height = image.height
    if (width * height > MAX_MEGAPIXELS * 1e6) return null
    rgba = new Uint8Array(width * height * 4)
    for (let p = 0, s = 0; p < width * height; p++) {
      const o = p * 4
      if (image.components === 1) {
        const v = image.samples[s++]!
        rgba[o] = v
        rgba[o + 1] = v
        rgba[o + 2] = v
      } else {
        rgba[o] = image.samples[s++]!
        rgba[o + 1] = image.samples[s++]!
        rgba[o + 2] = image.samples[s++]!
      }
      rgba[o + 3] = 255
    }
  }
  const size = fittedSize(width, height, target.longSide)
  const pixels = shrinkRgba(rgba, width, height, size)
  return {
    jpeg: encodeJpeg(pixels, size.width, size.height, target.quality),
    width: size.width,
    height: size.height,
  }
}
