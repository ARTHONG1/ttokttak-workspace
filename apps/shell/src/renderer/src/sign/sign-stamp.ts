import {
  EncryptedPDFError,
  PDFDocument,
  degrees,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib'
import type { PDFImage, PDFPage } from 'pdf-lib'
import { imageDrawFor, turnOf, type Placement } from './sign-geometry'

/**
 * 똑딱서명's save: the signatures drawn into the pages' own content, so every PDF viewer
 * shows them the same (no annotation a viewer may hide or a form flattening may drop).
 * Each page's original content is wrapped in q … Q first: a page that changes the
 * graphics state and never restores it cannot move or scale the signatures after it.
 */

export interface SignStamp {
  /** 0-based page */
  page: number
  /** index into the PNG list */
  image: number
  placement: Placement
}

export type SignPdfProblem = 'encrypted' | 'unreadable'

export class SignPdfError extends Error {
  constructor(readonly problem: SignPdfProblem) {
    super(problem === 'encrypted' ? 'the PDF is password protected' : 'the PDF cannot be read')
    this.name = 'SignPdfError'
  }
}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (err) {
    throw new SignPdfError(err instanceof EncryptedPDFError ? 'encrypted' : 'unreadable')
  }
}

/** a PDF the page can sign: how many pages it has (throws SignPdfError when it cannot) */
export async function readSignPdf(bytes: Uint8Array): Promise<{ pageCount: number }> {
  const doc = await load(bytes)
  let pageCount: number
  try {
    // a damaged file can load and still have no page tree to count
    pageCount = doc.getPageCount()
  } catch {
    throw new SignPdfError('unreadable')
  }
  if (pageCount === 0) throw new SignPdfError('unreadable')
  return { pageCount }
}

function wrapOriginalContent(doc: PDFDocument, page: PDFPage): void {
  const start = doc.context.register(doc.context.contentStream([pushGraphicsState()]))
  const end = doc.context.register(doc.context.contentStream([popGraphicsState()]))
  page.node.wrapContentStreams(start, end)
}

export async function stampSignatures(
  pdf: Uint8Array,
  images: readonly Uint8Array[],
  stamps: readonly SignStamp[],
): Promise<Uint8Array> {
  const doc = await load(pdf)
  const pages = doc.getPages()
  const embedded = new Map<number, PDFImage>()
  const wrapped = new Set<number>()
  for (const stamp of stamps) {
    const page = pages[stamp.page]
    const png = images[stamp.image]
    if (!page || !png) continue
    let image = embedded.get(stamp.image)
    if (!image) {
      image = await doc.embedPng(png)
      embedded.set(stamp.image, image)
    }
    if (!wrapped.has(stamp.page)) {
      wrapOriginalContent(doc, page)
      wrapped.add(stamp.page)
    }
    const box = page.getCropBox()
    const draw = imageDrawFor(stamp.placement, box, turnOf(page.getRotation().angle))
    page.drawImage(image, {
      x: draw.x,
      y: draw.y,
      width: draw.width,
      height: draw.height,
      rotate: degrees(draw.rotate),
    })
  }
  return doc.save()
}
