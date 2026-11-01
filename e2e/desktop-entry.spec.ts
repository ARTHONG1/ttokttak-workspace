import { test, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { ARTIFACTS_DIR, closeAndSaveVideo, launchShell, screenshotPath } from './helpers'

test('desktop welcome and Codex connection render at desktop sizes', async () => {
  const launched = await launchShell({
    videoDir: 'desktop-entry',
    lang: 'ko',
    recordVideo: false,
  })
  const { page, app } = launched
  try {
    await expect(page.locator('[data-screen="welcome"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: /말 한마디에/ })).toBeVisible()
    await expect(page.locator('.dw-cta').getByRole('button', { name: /연결하기/ })).toBeVisible()
    await expect(page.locator('.dw-cta').getByRole('button', { name: /시작하기/ })).toBeVisible()
    await expect(page.locator('.onb-overlay')).toHaveCount(0)
    // No full-page blur: it previously made the entire first screen unreadable.
    expect(await page.locator('.desktop-welcome').evaluate((element) => getComputedStyle(element).filter)).toBe('none')

    await mkdir(`${ARTIFACTS_DIR}/screenshots`, { recursive: true })
    for (const [width, height] of [[1440, 900], [1024, 768]]) {
      await app.evaluate(({ BrowserWindow }, bounds) => {
        const window = BrowserWindow.getAllWindows()[0]
        window?.setSize(bounds[0], bounds[1])
      }, [width, height])
      await page.screenshot({ path: screenshotPath(`desktop-welcome-${width}x${height}`) })
    }

    await page.locator('.dw-cta').getByRole('button', { name: /연결하기/ }).click()
    await expect(page.locator('[data-screen="connect"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'AI 연결하기' })).toBeVisible()
    await expect(page.locator('[data-provider="codex"]')).toBeVisible()
    await expect(page.locator('[data-provider="claude"]')).toHaveCount(0)
    await page.screenshot({ path: screenshotPath('desktop-connect-1024x768') })

    const available = await page.getByRole('button', { name: /시작하기/ }).isEnabled()
    if (available) {
      await page.getByRole('button', { name: /시작하기/ }).click()
      await expect(page.locator('.home-hero')).toBeVisible()
    } else {
      await expect(page.locator('.dc-start')).toBeDisabled()
    }
    await page.locator('.dc-back').click({ timeout: 1000 }).catch(() => undefined)
    if (!available) await expect(page.locator('[data-screen="welcome"]')).toBeVisible()
  } finally {
    await closeAndSaveVideo(launched, 'desktop-entry')
  }
})

test('first-transmission agreement requires an explicit click and is persisted', async () => {
  const launched = await launchShell({
    videoDir: 'desktop-entry-consent',
    lang: 'ko',
    recordVideo: false,
    subscriptionNoticeSeen: false,
  })
  const { page, userDataDir } = launched
  try {
    await expect(page.locator('[data-screen="welcome"]')).toBeVisible()
    await page.locator('.dw-cta').getByRole('button', { name: /시작하기/ }).click()
    await expect(page.locator('[data-screen="connect"]')).toBeVisible()

    // Real local Codex CLI availability is not faked. CI hosts without the
    // user's existing login cannot exercise the connected consent flow.
    const status = page.locator('.dc-status')
    // The initial status message is not the literal "설정 확인 중", so the
    // previous assertion did not wait for the asynchronous CLI check at all.
    // Read the completed status first, then assert the UI follows it.
    const diagnostic = await page.evaluate(async () => {
      const api = (window as unknown as {
        aiOfficeSubscription?: { recheck: (providers: string[]) => Promise<{ codex?: { state: string; error?: string; version?: string } }> }
      }).aiOfficeSubscription
      const current = (await api?.recheck(['codex']))?.codex
      return current ? { state: current.state, error: current.error, version: current.version } : { state: 'api-unavailable' }
    })
    console.log('[Codex connection check; no account data]', diagnostic)
    test.skip(diagnostic.state !== 'ready', 'Requires an already-signed-in local Codex CLI')
    await expect(status).toContainText('Codex 연결됨', { timeout: 15_000 })

    await expect(page.locator('.first-notice')).toBeVisible()
    await expect(page.locator('.dc-start')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.locator('.first-notice')).toBeVisible()
    await expect(page.locator('.dc-start')).toBeDisabled()

    await page.locator('.first-notice .ai-sub-btn').click()
    await expect(page.locator('.first-notice')).toHaveCount(0)
    const saved = JSON.parse(await readFile(`${userDataDir}/ai-settings.json`, 'utf8'))
    expect(saved.subscriptionNoticeSeen).toBe(true)
    await expect(page.locator('.dc-start')).toBeEnabled()
    await page.locator('.dc-start').click()
    await expect(page.locator('.home-hero')).toBeVisible()
  } finally {
    await closeAndSaveVideo(launched, 'desktop-entry-consent')
  }
})
