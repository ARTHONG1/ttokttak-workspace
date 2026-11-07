import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, copyFile, stat, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { launchShell, waitForPageWithUrl, closeAndSaveVideo } from './helpers'
import JSZip from 'jszip'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

for (const [format, relative] of [
  ['hwp', 'apps/hwp/tests/fixtures/memo.hwp'],
  ['hwpx', 'apps/hwp/tests/fixtures/master-page-next-section.hwpx'],
] as const) {
  test(`opens a ${format.toUpperCase()} fixture without changing its bytes`, async () => {
    const dir = await mkdtemp(join(tmpdir(), `genoffice-qa-${format}-`))
    const source = resolve(__dirname, '..', relative)
    const path = join(dir, `case.${format}`)
    await copyFile(source, path)
    const expected = digest(await readFile(path))
    const launched = await launchShell({
      onboardingSeen: true,
      openFile: path,
      videoDir: `qa-${format}-readonly`,
    })
    try {
      const page = await waitForPageWithUrl(launched.app, '://hwp/', 60_000)
      await expect(page.locator('.hwp-app[data-phase="ready"]')).toBeVisible({ timeout: 60_000 })
      await expect(page.locator('.hwp-editor-host iframe')).toHaveCount(1)
    } finally {
      await closeAndSaveVideo(launched, `qa-${format}-readonly`)
    }
    expect(digest(await readFile(path))).toBe(expected)
  })
}

test('a master-page HWPX save preserves its sections or safely rejects the write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-qa-master-save-'))
  const path = join(dir, 'master.hwpx')
  await copyFile(
    resolve(__dirname, '../apps/hwp/tests/fixtures/master-page-next-section.hwpx'),
    path,
  )
  const before = await readFile(path)
  const beforeTime = (await stat(path)).mtimeMs
  const launched = await launchShell({
    onboardingSeen: true,
    openFile: path,
    videoDir: 'qa-master-save',
    recordVideo: false,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, '://hwp/', 60_000)
    await expect(page.locator('.hwp-app[data-phase="ready"]')).toBeVisible({ timeout: 60_000 })
    await expect(
      page.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ttok-save"]'),
    ).toHaveCount(1)
    // A clean document deliberately skips Save. Make a real edit so the
    // pre-overwrite guard is exercised against this master-page fixture.
    const box = (await page.locator('.hwp-editor-host iframe').boundingBox())!
    await page.mouse.click(box.x + box.width * 0.4, box.y + 300)
    await page.keyboard.type('QA section preservation', { delay: 10 })
    await page.evaluate(() => {
      const frame = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement | null
      frame?.contentWindow?.dispatchEvent(new CustomEvent('ttok:file-command', { detail: 'save' }))
    })
    let outcome = 'pending'
    await expect
      .poll(
        async () => {
          if ((await stat(path)).mtimeMs !== beforeTime) outcome = 'saved'
          else if (
            await page
              .locator('.hwp-notice-error')
              .isVisible()
              .catch(() => false)
          )
            outcome = 'blocked'
          return outcome
        },
        { timeout: 30_000 },
      )
      .not.toBe('pending')

    const after = await readFile(path)
    if (outcome === 'blocked') {
      expect(digest(after)).toBe(digest(before))
      expect(await readdir(dir)).toEqual(['master.hwpx'])
    } else {
      const zip = await JSZip.loadAsync(after, { checkCRC32: true })
      const beforeZip = await JSZip.loadAsync(before, { checkCRC32: true })
      expect(zip.file('Contents/masterpage0.xml')).not.toBeNull()
      expect(zip.file('Contents/section0.xml')).not.toBeNull()
      expect(zip.file('Contents/section1.xml')).not.toBeNull()
      expect(await zip.file('Contents/masterpage0.xml')!.async('nodebuffer')).toEqual(
        await beforeZip.file('Contents/masterpage0.xml')!.async('nodebuffer'),
      )
      expect(await zip.file('Contents/section0.xml')!.async('string')).toContain(
        'QA section preservation',
      )
    }
    console.log(`master-page HWPX in-app save: ${outcome}`)
  } finally {
    await closeAndSaveVideo(launched, 'qa-master-save')
  }
})
