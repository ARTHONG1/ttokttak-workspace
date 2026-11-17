import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { test, expect, type ElectronApplication } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * 똑딱정리 end to end on the desktop app: documents in through the open dialog, the cards a
 * kind can have (with 주의 where the result may differ), pages picked and taken out of a
 * Hangul document, two PDFs joined in a new order, a Word file's photos made smaller and a
 * deck split; each result saved through the save dialog and read back.
 */

const ROOT = join(__dirname, '..')
const HWP = join(ROOT, 'apps', 'hwp', 'tests', 'fixtures', 'memo-source.hwp')
const PPTX = join(ROOT, 'packages', 'pptx-engine', 'tests', 'fixtures', '01_standard_business.pptx')

function photo(w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4)
  let seed = 11
  for (let i = 0; i < w * h; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    data[i * 4] = ((i % w) * 255) / w + (seed % 40)
    data[i * 4 + 1] = (Math.floor(i / w) * 255) / h + ((seed >> 8) % 40)
    data[i * 4 + 2] = 120 + ((seed >> 16) % 60)
    data[i * 4 + 3] = 255
  }
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, 92).data)
}

async function pdf(path: string, label: string, pages: number): Promise<void> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < pages; p++) {
    doc.addPage([595, 842]).drawText(label + ' ' + (p + 1), { x: 60, y: 760, size: 24, font })
  }
  await writeFile(path, await doc.save())
}

async function docxWithPhotos(path: string): Promise<void> {
  const W =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
  const pic =
    '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5000000" cy="3333000"/><wp:docPr id="1" name="Picture 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId3"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/></Relationships>',
  )
  zip.file('word/media/image1.jpeg', photo(3200, 2133))
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document ' +
      W +
      '><w:body><w:p><w:r><w:t>체험학습 사진</w:t></w:r></w:p>' +
      pic +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>',
  )
  await writeFile(path, await zip.generateAsync({ type: 'uint8array' }))
}

async function answerDialogs(
  app: ElectronApplication,
  open: string[],
  save: string,
): Promise<void> {
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files.open })) as never
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: files.save })) as never
    },
    { open, save },
  )
}

async function hangulPages(bytes: Uint8Array): Promise<number> {
  const { createRequire } = await import('node:module')
  const rhwp = await import('@rhwp/core')
  const wasm = createRequire(__filename).resolve('@rhwp/core/rhwp_bg.wasm')
  await rhwp.default({ module_or_path: await readFile(wasm) })
  const doc = new rhwp.HwpDocument(bytes)
  try {
    return doc.pageCount()
  } finally {
    doc.free()
  }
}

test('똑딱정리 shows the cards a document can have and hands each result out', async () => {
  test.setTimeout(5 * 60_000)
  const dir = await mkdtemp(join(tmpdir(), 'ttok-organize-e2e-'))
  const at = (name: string) => join(dir, name)
  await pdf(at('보고서.pdf'), 'report', 3)
  await pdf(at('결과.pdf'), 'result', 2)
  await docxWithPhotos(at('사진 기록.docx'))

  const launched = await launchShell({
    videoDir: 'ttok-organize',
    onboardingSeen: true,
    lang: 'ko',
  })
  const { app, page } = launched
  try {
    await page.setViewportSize({ width: 1400, height: 1000 })
    const start = page
      .frameLocator('iframe[title="똑딱작업실 소개"]')
      .locator('.cta [data-action="start"]')
    if (
      await start.waitFor({ state: 'visible', timeout: 10_000 }).then(
        () => true,
        () => false,
      )
    ) {
      await start.click()
    }
    await page
      .getByRole('button', { name: /똑딱업무/ })
      .first()
      .click()
    await page.getByTestId('special-feature-organize').click()
    await expect(page.getByRole('heading', { name: '똑딱정리' })).toBeVisible()
    await expect(page.getByTestId('to-privacy')).toContainText('이 컴퓨터 안에서만')
    await page.screenshot({ path: screenshotPath('ttok-organize-pick') })

    const upload = async (files: string[], save: string): Promise<void> => {
      await answerDialogs(app, files, save)
      const first = page.getByTestId('to-open')
      if (await first.isVisible()) await first.click()
      else await page.getByRole('button', { name: '다른 문서 올리기' }).click()
    }
    /** save through the stubbed dialog and wait for the file */
    const download = async (path: string): Promise<void> => {
      await page.getByTestId('to-download').click()
      await expect.poll(() => existsSync(path), { timeout: 30_000 }).toBe(true)
    }

    // a Hangul document: four cards, three of them with 주의; pages 2 and 4 taken out
    await upload([HWP], at('정리.hwp'))
    await expect(page.locator('[data-testid^="to-card-"]')).toHaveCount(4)
    await expect(page.locator('.to-card.has-caution')).toHaveCount(3)
    await page.screenshot({ path: screenshotPath('ttok-organize-hwp-cards') })
    await page.getByTestId('to-card-remove').click()
    await page.getByTestId('to-unit-1').click()
    await page.getByTestId('to-unit-3').click()
    await expect(page.getByTestId('to-run')).toHaveText('2개 빼고 만들기')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: screenshotPath('ttok-organize-hwp-picker') })
    await page.getByTestId('to-run').click()
    await expect(page.getByTestId('to-result')).toContainText('38쪽', { timeout: 60_000 })
    await expect(page.getByTestId('to-result')).toContainText('원본과 글 대조함')
    await page.screenshot({ path: screenshotPath('ttok-organize-hwp-done') })
    await download(at('정리.hwp'))
    const hwp = new Uint8Array(await readFile(at('정리.hwp')))
    expect([...hwp.subarray(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0])
    expect(await hangulPages(hwp)).toBe(38)

    // two PDFs, joined with the second one first
    await upload([at('보고서.pdf'), at('결과.pdf')], at('합본.pdf'))
    await expect(page.locator('[data-testid^="to-card-"]')).toHaveCount(1)
    await page.getByTestId('to-card-merge').click()
    await page.getByRole('button', { name: '결과 위로' }).click()
    await page.getByTestId('to-run').click()
    await expect(page.getByTestId('to-result')).toContainText('5쪽', { timeout: 60_000 })
    await download(at('합본.pdf'))
    const merged = await PDFDocument.load(await readFile(at('합본.pdf')))
    expect(merged.getPageCount()).toBe(5)

    // a Word file's photos made smaller, its text kept
    await upload([at('사진 기록.docx')], at('작게.docx'))
    await page.getByTestId('to-card-shrink').click()
    await expect(page.getByTestId('to-result')).toContainText('사진 1장 줄임', { timeout: 60_000 })
    await page.screenshot({ path: screenshotPath('ttok-organize-docx-shrunk') })
    await download(at('작게.docx'))
    const small = await readFile(at('작게.docx'))
    expect(small.byteLength).toBeLessThan((await readFile(at('사진 기록.docx'))).byteLength / 2)
    const word = await JSZip.loadAsync(small)
    expect(await word.file('word/document.xml')!.async('string')).toContain('체험학습 사진')

    // a deck split into one file per slide, in one ZIP
    await upload([PPTX], at('나눔.zip'))
    await page.getByTestId('to-card-split').click()
    await expect(page.getByTestId('to-run')).toBeEnabled()
    await page.getByTestId('to-run').click()
    await expect(page.getByTestId('to-result')).toContainText('ZIP으로 묶음', { timeout: 60_000 })
    await download(at('나눔.zip'))
    const pieces = Object.keys((await JSZip.loadAsync(await readFile(at('나눔.zip')))).files)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((n) => n.endsWith('.pptx'))).toBe(true)

    // different kinds cannot be joined
    await upload([at('보고서.pdf'), PPTX], at('unused'))
    await expect(page.getByRole('alert')).toContainText('같은 종류의 문서끼리만')
  } finally {
    await closeAndSaveVideo(launched, 'ttok-organize')
  }
})
