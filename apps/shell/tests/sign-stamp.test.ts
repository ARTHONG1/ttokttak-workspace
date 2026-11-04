import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { PDFDocument, PDFName, PDFRawStream, concatTransformationMatrix, degrees } from 'pdf-lib'
import { SignPdfError, readSignPdf, stampSignatures } from '../src/renderer/src/sign/sign-stamp'
import { viewCorners, type Placement } from '../src/renderer/src/sign/sign-geometry'

/** a real PNG, w×h, half transparent (so it carries a soft mask like a cleaned signature) */
function makePng(w: number, h: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, body.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(body, 8)
    view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)))
    return out
  }
  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, w)
  hv.setUint32(4, h)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const raw = new Uint8Array(h * (1 + w * 4))
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) raw.set([200, 20, 20, x % 2 ? 255 : 0], y * (1 + w * 4) + 1 + x * 4)
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array()),
  ]
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    png.set(p, at)
    at += p.length
  }
  return png
}
const PNG = makePng(4, 2)

async function fixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const turn of [0, 90, 180, 270]) {
    const page = doc.addPage([700, 900])
    page.setCropBox(10, 20, 600, 800)
    page.setRotation(degrees(turn))
    page.drawText('page ' + turn, { x: 50, y: 700, size: 20 })
  }
  // the first page's own content scales everything after it and never restores
  doc.getPage(0).pushOperators(concatTransformationMatrix(2, 0, 0, 2, 0, 0))
  return doc.save()
}

type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5],
]
const apply = (m: M, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
]

/** every image a page paints, as the matrix it is painted with */
async function imagesOn(bytes: Uint8Array) {
  const { OPS, getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ data: bytes.slice() }).promise
  const pages = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const ops = await page.getOperatorList()
      let ctm: M = [1, 0, 0, 1, 0, 0]
      const stack: M[] = []
      const found: M[] = []
      ops.fnArray.forEach((fn, k) => {
        const args = ops.argsArray[k] as unknown[]
        if (fn === OPS.save) stack.push(ctm)
        else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
        else if (fn === OPS.transform) ctm = mul(ctm, args as unknown as M)
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) found.push(ctm)
      })
      pages.push({ viewport: page.getViewport({ scale: 1 }), found })
    }
  } finally {
    await doc.loadingTask.destroy()
  }
  return pages
}

describe('stampSignatures', () => {
  it('paints each signature where and how the view shows it, on every page turn', async () => {
    const pdf = await fixture()
    const placements: Placement[] = [
      { cx: 150, cy: 200, width: 120, height: 60, angle: 0 },
      { cx: 400, cy: 120, width: 90, height: 45, angle: 30 },
      { cx: 300, cy: 600, width: 100, height: 50, angle: 137 },
      { cx: 520, cy: 300, width: 80, height: 40, angle: -15 },
    ]
    const out = await stampSignatures(
      pdf,
      [PNG],
      placements.map((placement, page) => ({ page, image: 0, placement })),
    )
    const pages = await imagesOn(out)
    expect(pages).toHaveLength(4)
    pages.forEach(({ viewport, found }, i) => {
      expect(found).toHaveLength(1)
      const m = found[0]!
      const p = placements[i]!
      const [cx, cy] = viewport.convertToViewportPoint(...apply(m, 0.5, 0.5))
      expect(cx).toBeCloseTo(p.cx, 3)
      expect(cy).toBeCloseTo(p.cy, 3)
      // the image's top-left corner (its unit square's (0,1)) is the view's top-left corner
      const [tx, ty] = viewport.convertToViewportPoint(...apply(m, 0, 1))
      const [wx, wy] = viewCorners(p)[0]!
      expect(tx).toBeCloseTo(wx, 3)
      expect(ty).toBeCloseTo(wy, 3)
    })
  })

  it('leaves pages without a signature without one, and keeps the page count', async () => {
    const out = await stampSignatures(
      await fixture(),
      [PNG],
      [{ page: 2, image: 0, placement: { cx: 100, cy: 100, width: 50, height: 25, angle: 0 } }],
    )
    const pages = await imagesOn(out)
    expect(pages.map((p) => p.found.length)).toEqual([0, 0, 1, 0])
  })

  it('puts one signature on several pages from one copy of the picture', async () => {
    const placement = { cx: 100, cy: 100, width: 50, height: 25, angle: 0 }
    const imageCount = async (pages: number[]) => {
      const out = await stampSignatures(
        await fixture(),
        [PNG],
        pages.map((page) => ({ page, image: 0, placement })),
      )
      const doc = await PDFDocument.load(out)
      return doc.context
        .enumerateIndirectObjects()
        .filter(
          ([, o]) =>
            o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
        ).length
    }
    expect(await imageCount([0, 1, 2, 3])).toBe(await imageCount([0]))
  })
})

describe('readSignPdf', () => {
  it('counts the pages of a PDF it can sign', async () => {
    expect(await readSignPdf(await fixture())).toEqual({ pageCount: 4 })
  })

  it('names an unreadable file', async () => {
    await expect(readSignPdf(new TextEncoder().encode('%PDF-1.7 nonsense'))).rejects.toBeInstanceOf(
      SignPdfError,
    )
  })
})
