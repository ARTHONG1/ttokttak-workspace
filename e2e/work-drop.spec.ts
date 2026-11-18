import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { test, expect, type Page } from '@playwright/test'
import { launchShell, closeAndSaveVideo } from './helpers'

/**
 * 문서 변환 and 똑딱서명 keep a document dragged onto them: the drop is the page's, so it
 * never opens an editor tab, and a dropped document's path opens it the way the open dialog
 * does. (A file made inside the page has no path on disk; a real drop from Finder or
 * Explorer has one, which the second half hands over directly.)
 */

async function onePagePdf(path: string): Promise<void> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('dropped', { x: 60, y: 760, size: 24, font })
  await writeFile(path, await doc.save())
}

async function dropMadeFile(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((root) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['%PDF-1.4'], '놓은 문서.pdf', { type: 'application/pdf' }))
    const drop = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
    root.dispatchEvent(drop)
    return drop.defaultPrevented
  })
}

test('문서 변환 and 똑딱서명 keep documents dragged onto them', async () => {
  test.setTimeout(3 * 60_000)
  const dir = await mkdtemp(join(tmpdir(), 'work-drop-'))
  const file = join(dir, '놓은 문서.pdf')
  await onePagePdf(file)

  const launched = await launchShell({ videoDir: 'work-drop', onboardingSeen: true, lang: 'ko' })
  const { app, page } = launched
  try {
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
    const views = () => app.evaluate(({ webContents }) => webContents.getAllWebContents().length)
    const work = async (id: string) => {
      await page
        .getByRole('button', { name: /똑딱업무/ })
        .first()
        .click()
      await page.getByTestId('special-feature-' + id).click()
    }

    // 문서 변환
    await work('convert')
    const before = await views()
    expect(await dropMadeFile(page, 'tc-root')).toBe(true)
    await expect(page.getByRole('alert')).toContainText('끌어다 놓아 주세요')
    await page.waitForTimeout(1500)
    expect(await views()).toBe(before)
    const converted = await page.evaluate(async (path) => {
      const out = await window.aiOffice.openConvertPath([path])
      return out.ok ? out.extension : out.error
    }, file)
    expect(converted).toBe('pdf')

    // 똑딱서명
    await page.getByRole('button', { name: '똑딱업무' }).first().click()
    await page.getByTestId('special-feature-sign').click()
    expect(await dropMadeFile(page, 'ts-root')).toBe(true)
    await expect(page.getByRole('alert')).toContainText('끌어다 놓아 주세요')
    await page.waitForTimeout(1500)
    expect(await views()).toBe(before)
    const signed = await page.evaluate(async (path) => {
      const out = await window.aiOffice.openSignPath([path])
      return out.ok ? out.name : out.error
    }, file)
    expect(signed).toBe('놓은 문서')
  } finally {
    await closeAndSaveVideo(launched, 'work-drop')
  }
})
