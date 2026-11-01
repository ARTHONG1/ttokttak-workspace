import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo } from './helpers'

test('desktop uses the web home and exposes personal AI settings', async () => {
  const launched = await launchShell({
    videoDir: 'workspace-parity',
    lang: 'ko',
    recordVideo: false,
  })
  const { page, app } = launched
  page.on('pageerror', (error) => console.log('renderer error:', error.stack))
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('renderer console:', message.text())
  })
  try {
    const identity = await app.evaluate(({ app }) => ({
      name: app.getName(),
      userData: app.getPath('userData'),
    }))
    expect(identity.name).toBe('똑딱작업실')
    expect(identity.userData).toBe(launched.userDataDir)
    await expect(page.locator('.hub-title')).toHaveText(['문서 업로드', '똑딱업무', '똑딱수업'])
    await expect(page.getByTestId('tab-open-file')).toBeVisible()
    await expect(page.locator('.trial-note')).toHaveText('작업을 마치면 문서를 저장해 주세요.')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.screenshot({ path: 'e2e/artifacts/workspace-parity-home.png' })
    await page.getByTestId('trial-class').click()
    await expect(page.getByTestId('class-tools')).toBeVisible()
    await page.getByTestId('class-to-work').click()
    await expect(page.getByTestId('special-features')).toBeVisible()
    await page.locator('.sf-back').first().click()
    await expect(page.getByTestId('trial-work')).toHaveCount(0)
    await expect(page.getByTestId('trial-features')).toBeVisible()
    const menuHasAi = await app.evaluate(({ Menu, BrowserWindow }) => {
      const menu = Menu.getApplicationMenu()
      const entry = menu?.items
        .flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.id === 'workspace-ai-settings')
      if (!entry) return false
      entry.click(undefined as never, BrowserWindow.getAllWindows()[0], undefined as never)
      return true
    })
    expect(menuHasAi).toBe(true)
    await expect(page.locator('.set-sub-cards')).toBeVisible()
    await expect(page.locator('.set-sub-cards')).toContainText('Codex')
    await expect(page.locator('.set-sub-cards')).toContainText('Claude')
    await page.screenshot({ path: 'e2e/artifacts/workspace-parity-settings.png' })
  } catch (error) {
    console.log('window URL:', page.url())
    console.log(
      'window text:',
      await page
        .locator('body')
        .innerText()
        .catch(() => 'unavailable'),
    )
    console.log(
      'window HTML:',
      (
        await page
          .locator('body')
          .innerHTML()
          .catch(() => 'unavailable')
      ).slice(0, 3000),
    )
    throw error
  } finally {
    await closeAndSaveVideo(launched, 'workspace-parity')
  }
})
