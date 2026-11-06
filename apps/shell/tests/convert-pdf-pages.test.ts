import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { loadPdfium } from '../../../packages/pdf-structure/tests/helpers/fixtures'
import { PNG_PAGE_LIMIT, pdfToPngZip } from '../src/main/document-convert/pdf-pages'

async function pdfOf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 280])
  return doc.save()
}

describe('pdfToPngZip', () => {
  it('draws every page as a PNG, named after the document in page order', async () => {
    const { zip, pages, total } = await pdfToPngZip(await pdfOf(3), '보고서', await loadPdfium())
    expect([pages, total]).toEqual([3, 3])
    const opened = await JSZip.loadAsync(zip)
    const names = Object.keys(opened.files).sort()
    expect(names).toEqual(['보고서-p001.png', '보고서-p002.png', '보고서-p003.png'])
    for (const name of names) {
      const png = await opened.file(name)!.async('uint8array')
      expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    }
  })

  it('stops at the page limit and says how many pages there were', async () => {
    const result = await pdfToPngZip(await pdfOf(PNG_PAGE_LIMIT + 5), 'big', await loadPdfium())
    expect(result.pages).toBe(PNG_PAGE_LIMIT)
    expect(result.total).toBe(PNG_PAGE_LIMIT + 5)
  }, 60_000)

  it('throws on bytes that are not a PDF', async () => {
    await expect(
      pdfToPngZip(new TextEncoder().encode('nope'), 'x', await loadPdfium()),
    ).rejects.toThrow()
  })
})
