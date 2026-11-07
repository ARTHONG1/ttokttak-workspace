import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

const source = resolve(__dirname, '../apps/sheets/fixtures/generated/compatibility-basic.xlsx')
const packagedExecutable = process.env.GENOFFICE_E2E_PACKAGED_EXECUTABLE
const bundled = packagedExecutable
  ? resolve(dirname(packagedExecutable), '../Resources/local-ai')
  : null

function sheetXml(path: string): string {
  return execFileSync('unzip', ['-p', path, 'xl/worksheets/sheet1.xml'], {
    encoding: 'utf8',
  })
}

test('packaged offline AI changes XLSX A1 and preserves B1 after saving and reopening', async () => {
  test.setTimeout(240_000)
  test.skip(
    !packagedExecutable || !bundled || !existsSync(join(bundled, 'model.gguf')),
    'This is an isolated packaged/offline app verification',
  )
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-offline-xlsx-'))
  const workbook = join(dir, 'edit.xlsx')
  await copyFile(source, workbook)

  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    openFile: workbook,
    recordVideo: false,
    videoDir: 'local-ai-xlsx-edit',
  })
  try {
    const page = await waitForPageWithUrl(launched.app, '://sheets/')
    await page.waitForFunction(() => document.body.textContent?.includes('Sheet1'), null, {
      timeout: 30_000,
    })
    const input = page.locator('.ai-composer textarea')
    await expect(input).toBeVisible({ timeout: 30_000 })
    await input.fill('Sheet1의 A1 셀에 있는 Old를 Ready로 바꿔 줘. B1 셀 값 10은 그대로 둬.')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-chat .ai-msg-user')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('.ai-msg-assistant').last()).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
      timeout: 120_000,
    })
    await expect(page.locator('.ai-msg-error')).toHaveCount(0)

    await launched.app.evaluate(({ webContents }) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('://sheets/'))
      wc?.send('menu:action', 'save')
    })
    try {
      await expect.poll(() => sheetXml(workbook), { timeout: 30_000 }).toContain('Ready')
    } catch (err) {
      console.log('[local-ai-xlsx-e2e] assistant:', await page.locator('.ai-chat').innerText())
      throw err
    }
    expect(sheetXml(workbook)).toContain('<v>10</v>')
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-xlsx-edit')
  }

  const reopened = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    openFile: workbook,
    recordVideo: false,
    videoDir: 'local-ai-xlsx-reopen',
  })
  try {
    const page = await waitForPageWithUrl(reopened.app, '://sheets/')
    await page.waitForFunction(() => document.body.textContent?.includes('Sheet1'), null, {
      timeout: 30_000,
    })
    expect(sheetXml(workbook)).toContain('Ready')
    expect(sheetXml(workbook)).toContain('<v>10</v>')
    expect((await readFile(workbook)).byteLength).toBeGreaterThan(0)
  } finally {
    await closeAndSaveVideo(reopened, 'local-ai-xlsx-reopen')
    await rm(dir, { recursive: true, force: true })
  }
})
