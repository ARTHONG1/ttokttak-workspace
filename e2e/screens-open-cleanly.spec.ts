import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { closeAndSaveVideo, homeNewTile, launchShell, type LaunchedApp } from './helpers'

/**
 * Every screen a person reaches from the home opens without an error in any of the app's
 * pages: the home, each editor tab (its own WebContents, which the home's Playwright page
 * does not see) and any dialog. Listened for in the main process: console errors, uncaught
 * exceptions (Chromium reports them as console errors), crashed renderers and failed
 * preloads. Added 2026-11-21 after a sweep found tab errors no other test was watching.
 */
async function listen(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, webContents }) => {
    const store = globalThis as unknown as { __screenErrors?: string[] }
    store.__screenErrors = []
    const errors = store.__screenErrors
    const hook = (wc: Electron.WebContents) => {
      wc.on('console-message', (details) => {
        const level = (details as unknown as { level: string | number }).level
        if (level === 'error' || level === 3)
          errors.push(wc.getURL().slice(0, 60) + ' ' + String(details.message).slice(0, 300))
      })
      wc.on('render-process-gone', (_e, d) =>
        errors.push(wc.getURL().slice(0, 60) + ' gone: ' + d.reason),
      )
      wc.on('preload-error', (_e, path, err) => errors.push('preload ' + path + ': ' + String(err)))
    }
    for (const wc of webContents.getAllWebContents()) hook(wc)
    electronApp.on('web-contents-created', (_e, wc) => hook(wc))
  })
}

async function screenOpensCleanly(
  name: string,
  open: (launched: LaunchedApp) => Promise<void>,
): Promise<void> {
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    videoDir: 'screen-' + name,
  })
  try {
    await listen(launched.app)
    const pageErrors: string[] = []
    launched.page.on('pageerror', (e) => pageErrors.push(e.message))
    await open(launched)
    // the editor finishes loading and its first background work runs
    await launched.page.waitForTimeout(6_000)
    const errors = await launched.app.evaluate(
      () => (globalThis as unknown as { __screenErrors: string[] }).__screenErrors,
    )
    expect([...pageErrors, ...errors]).toEqual([])
  } finally {
    await closeAndSaveVideo(launched, 'screen-' + name)
  }
}

for (const ext of ['hwp', 'docx', 'xlsx', 'pptx', 'pdf', 'md', 'html', 'xmind']) {
  test('a new ' + ext + ' document opens without an error', async () => {
    await screenOpensCleanly('new-' + ext, async ({ page }) => {
      await homeNewTile(page, ext).click()
      await page.waitForTimeout(6_000)
    })
  })
}

for (const feature of ['proposal', 'quiz', 'sign', 'convert', 'organize', 'record']) {
  test('똑딱업무 ' + feature + ' opens without an error', async () => {
    await screenOpensCleanly('feature-' + feature, async ({ page }) => {
      await page.getByTestId('trial-features').click()
      await page.getByTestId('special-feature-' + feature).click()
    })
  })
}

test('똑딱수업 opens without an error', async () => {
  await screenOpensCleanly('class', async ({ page }) => {
    await page.getByTestId('trial-class').click()
  })
})

test('the intro opens without an error', async () => {
  await screenOpensCleanly('intro', async ({ page }) => {
    await page.getByTestId('trial-intro').click()
  })
})
