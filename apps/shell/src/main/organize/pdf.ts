import { PDFDocument } from 'pdf-lib'
import { compressPdfBytes, type ImageRecoder } from '../../../../pdf/src/main/compress'
import { extractPagesBytes, mergePdfBytes } from '../../../../pdf/src/main/save-pdf'

/**
 * 똑딱정리 for PDFs: the PDF editor's own page functions, so a file made here matches the same
 * command in the editor. Text, pictures and drawings of the kept pages are copied as they are.
 */

export class PdfOrganizeError extends Error {
  constructor(readonly reason: 'password' | 'unreadable' | 'not-smaller') {
    super('pdf organize: ' + reason)
    this.name = 'PdfOrganizeError'
  }
}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (err) {
    throw new PdfOrganizeError(/encrypt/i.test(String(err)) ? 'password' : 'unreadable')
  }
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  return (await load(bytes)).getPageCount()
}

/** the PDF without the given pages (0-based); bookmarks and form fields stay as they were */
export async function removePdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const doc = await load(bytes)
  const gone = [...new Set(pages)]
    .filter((p) => p >= 0 && p < doc.getPageCount())
    .sort((a, b) => b - a)
  for (const p of gone) doc.removePage(p)
  return doc.save({ useObjectStreams: false })
}

/** a new PDF of the given pages (0-based), in their order */
export async function pickPdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  await load(bytes)
  return extractPagesBytes(bytes, pages)
}

export async function joinPdfs(
  inputs: Uint8Array[],
): Promise<{ bytes: Uint8Array; pages: number }> {
  for (const input of inputs) await load(input)
  const { merged } = await mergePdfBytes(inputs[0]!, inputs.slice(1))
  return { bytes: merged, pages: await pdfPageCount(merged) }
}

export async function shrinkPdf(
  bytes: Uint8Array,
  recode: ImageRecoder,
  onPicture: (done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; recoded: number }> {
  await load(bytes)
  const result = await compressPdfBytes(bytes, 'medium', recode, { onProgress: onPicture })
  if (result.bytes.length >= bytes.length) throw new PdfOrganizeError('not-smaller')
  return { bytes: result.bytes, recoded: result.recoded }
}
