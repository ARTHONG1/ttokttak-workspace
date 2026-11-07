import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

const packagedExecutable = process.env.GENOFFICE_E2E_PACKAGED_EXECUTABLE
const bundled = packagedExecutable
  ? resolve(dirname(packagedExecutable), '../Resources/local-ai')
  : null
const modelReady = !!bundled && existsSync(join(bundled, 'model.gguf'))

async function createPptx(path: string): Promise<void> {
  const p = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
  const a = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
  const r = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const shape = (id: number, content: string, top: number) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="900000" y="${top}"/><a:ext cx="7000000" cy="700000"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${content}</a:t></a:r></a:p></p:txBody></p:sp>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation ${p} ${r} ${a}><p:sldIdLst>` +
      '<p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
      '<p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/>' +
      '</p:presentation>',
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0"?><p:sld ${p} ${r} ${a}><p:cSld><p:spTree>` +
      '<p:nvGrpSpPr/><p:grpSpPr/>' +
      shape(2, 'Old', 900000) +
      shape(3, 'Keep', 2400000) +
      '</p:spTree></p:cSld></p:sld>',
  )
  await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }))
}

async function slideXml(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(path))
  return (await zip.file('ppt/slides/slide1.xml')?.async('string')) ?? ''
}

async function pdfText(path: string): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const bytes = await readFile(path)
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  const pdf = await loadingTask.promise
  try {
    const content = await (await pdf.getPage(1)).getTextContent()
    return content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  } finally {
    await loadingTask.destroy()
  }
}

test('bundled offline AI changes slide text and keeps adjacent text through PPTX save and reopen', async () => {
  test.setTimeout(240_000)
  test.skip(!modelReady, 'A packaged local model is required')
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-offline-pptx-'))
  const file = join(dir, 'edit.pptx')
  await createPptx(file)
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-pptx',
  })
  try {
    const page = await waitForPageWithUrl(launched.app, '://slides/')
    await expect(page.locator('.stage-wrap canvas').first()).toBeVisible({ timeout: 30_000 })
    const input = page.locator('.ai-composer textarea')
    await expect(input).toBeVisible({ timeout: 30_000 })
    await input.fill('첫 번째 슬라이드의 Old를 Ready로 바꿔 줘. Keep은 그대로 둬.')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-chat .ai-msg-user')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('.ai-composer .ai-stop-btn')).toHaveCount(0, { timeout: 180_000 })
    const result = await page.evaluate(() => window.slidesApi.save())
    expect(result.ok, result.error).toBe(true)
    try {
      await expect.poll(() => slideXml(file), { timeout: 20_000 }).toContain('Ready')
    } catch (error) {
      console.log('[local-ai-pptx-e2e] transcript:', await page.locator('.ai-chat').innerText())
      throw error
    }
    expect(await slideXml(file)).toContain('Keep')
    expect(await slideXml(file)).not.toContain('>Old<')
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-pptx')
  }
  const reopened = await launchShell({
    onboardingSeen: true,
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-pptx-reopen',
  })
  try {
    const page = await waitForPageWithUrl(reopened.app, '://slides/')
    await expect(page.locator('.stage-wrap canvas').first()).toBeVisible({ timeout: 30_000 })
    expect(await slideXml(file)).toContain('Ready')
    expect(await slideXml(file)).toContain('Keep')
  } finally {
    await closeAndSaveVideo(reopened, 'local-ai-pptx-reopen')
    await rm(dir, { recursive: true, force: true })
  }
})

test('bundled offline AI changes PDF text and keeps adjacent text through save and reopen', async () => {
  test.setTimeout(240_000)
  test.skip(!modelReady, 'A packaged local model is required')
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-offline-pdf-'))
  const file = join(dir, 'edit.pdf')
  const original = await PDFDocument.create()
  const font = await original.embedFont(StandardFonts.Helvetica)
  original.addPage([595, 842]).drawText('Old Keep', { x: 60, y: 730, size: 20, font })
  await writeFile(file, await original.save({ useObjectStreams: false }))
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-pdf',
  })
  try {
    const page = await waitForPageWithUrl(launched.app, '://pdf/')
    await expect(page.locator('.pdf-page').first()).toBeVisible({ timeout: 30_000 })
    const input = page.locator('.ai-composer textarea')
    await expect(input).toBeVisible({ timeout: 30_000 })
    await input.fill('1페이지의 Old를 New로 바꿔 줘. Keep은 그대로 둬.')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-chat .ai-msg-user')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('.ai-composer .ai-stop-btn')).toHaveCount(0, { timeout: 180_000 })
    await page.keyboard.press('ControlOrMeta+s')
    try {
      await expect.poll(() => pdfText(file), { timeout: 25_000 }).toContain('New')
    } catch (error) {
      console.log('[local-ai-pdf-e2e] transcript:', await page.locator('.ai-chat').innerText())
      throw error
    }
    expect(await pdfText(file)).toContain('Keep')
    expect(await pdfText(file)).not.toContain('Old')
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-pdf')
  }
  const reopened = await launchShell({
    onboardingSeen: true,
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-pdf-reopen',
  })
  try {
    const page = await waitForPageWithUrl(reopened.app, '://pdf/')
    await expect(page.locator('.pdf-page').first()).toBeVisible({ timeout: 30_000 })
    expect(await pdfText(file)).toContain('New')
    expect(await pdfText(file)).toContain('Keep')
  } finally {
    await closeAndSaveVideo(reopened, 'local-ai-pdf-reopen')
    await rm(dir, { recursive: true, force: true })
  }
})
