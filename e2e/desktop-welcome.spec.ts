import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo } from './helpers'

test('desktop welcome opens the AI connection page', async () => {
  const launched = await launchShell({ videoDir: 'desktop-welcome', lang: 'ko', recordVideo: false })
  try {
    const { page } = launched
    await page.setViewportSize({ width: 1440, height: 900 })
    const intro = page.frameLocator('iframe[title="똑딱작업실 소개"]')
    await expect(intro.locator('h1')).toContainText('말 한마디에')
    await expect(intro.locator('h1 span').first()).toHaveCSS('filter', 'none')
    await expect(intro.locator('#frame')).toHaveCSS('filter', 'none')
    await expect(intro.locator('[data-action="connect"]').last()).toHaveText('연결하기')
    await expect(intro.locator('.cta [data-action="start"]')).toHaveText('시작하기')
    await expect(intro.locator('#uniStage svg circle')).toHaveCount(586)
    await expect(intro.locator('#uniLegend li')).toHaveCount(10)
    await page.screenshot({ path: 'e2e/artifacts/desktop-welcome.png' })
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(intro.locator('.cta [data-action=connect]')).toBeVisible()
    await intro.locator('.cta [data-action="connect"]').click()
    await expect(page.getByRole('heading', { name: 'AI 연결하기' })).toBeVisible()
    await expect(page.locator('.set-sub-cards')).toContainText('Codex')
    await expect(page.locator('.set-sub-cards')).toContainText('Claude')
    await page.screenshot({ path: 'e2e/artifacts/desktop-connection.png' })
    await expect(page.locator('p[role=status]')).not.toHaveText('연결 확인 중…', { timeout: 30000 })
    const codex = page.getByRole('button', { name: 'Codex 사용하기' })
    if (await codex.isVisible()) {
      await codex.click()
      await expect(page.locator('p[role=status]')).toHaveText('Codex 연결됨')
      await page.getByRole('button', { name: '시작하기' }).click()
      await expect(page.locator('.hub-title')).toHaveText(['문서 업로드', '똑딱업무', '똑딱수업'])
    } else {
      await expect(page.getByRole('button', { name: '시작하기' })).toBeDisabled()
      await page.getByRole('button', { name: '← 뒤로 가기' }).click()
      await expect(intro.locator('h1')).toBeVisible()
    }
  } finally {
    await closeAndSaveVideo(launched, 'desktop-welcome')
  }
})
