import JSZip from 'jszip'
import type { PdfiumModule } from '../../../../../packages/pdf2docx/src'
import { renderPageByIndexPng } from '../../../../../packages/pdf2docx/src/extract'
import { withPdfDocument } from '../../../../../packages/pdf2docx/src/extract/pdfium'

/**
 * 문서 변환 > 이미지(PNG): every page of a PDF drawn as a picture, all in one ZIP. A very
 * long document stops at PNG_PAGE_LIMIT pages; the caller says so.
 */

export const PNG_PAGE_LIMIT = 200
/** twice the PDF's size in points: about 144 dpi, sharp on screen and small to download */
const SCALE = 2

const pageName = (base: string, index: number): string =>
  base + '-p' + String(index + 1).padStart(3, '0') + '.png'

export async function pdfToPngZip(
  pdf: Uint8Array,
  baseName: string,
  pdfium: PdfiumModule,
): Promise<{ zip: Uint8Array; pages: number; total: number }> {
  const zip = new JSZip()
  const { pages, total } = withPdfDocument(pdfium, pdf, (doc) => {
    const count = pdfium._FPDF_GetPageCount(doc)
    const drawn = Math.min(count, PNG_PAGE_LIMIT)
    for (let i = 0; i < drawn; i++) {
      const page = renderPageByIndexPng(pdfium, doc, i, SCALE)
      if (!page) throw new Error('page ' + (i + 1) + ' could not be drawn')
      zip.file(pageName(baseName, i), page.data)
    }
    return { pages: drawn, total: count }
  })
  if (pages === 0) throw new Error('the PDF has no pages')
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
  return { zip: bytes, pages, total }
}
