import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * Home's 특화 기능 entry: the sidebar opens the feature list in the content pane and the
 * 품의서 생성 page asks for a title of 5+ characters and a cart of 10+ before it calls the AI.
 * The AI turn itself is not run here (no provider in the test app).
 */
test('special features open from the home sidebar', async () => {
  const launched = await launchShell({
    videoDir: 'home-special-features',
    onboardingSeen: true,
    lang: 'ko',
  })
  const { page } = launched
  try {
    await page.getByTestId('home-features-nav').click()
    await expect(page.getByTestId('special-features')).toBeVisible()
    await page.screenshot({ path: screenshotPath('home-special-features-list') })

    await page.getByTestId('special-feature-proposal').click()
    await expect(page.getByRole('heading', { name: '품의서 생성' })).toBeVisible()
    await page.getByTestId('proposal-title').fill('볼펜')
    await page.getByTestId('proposal-generate').click()
    await expect(page.getByText('품의 제목을 5자 이상 입력해주세요.')).toBeVisible()
    await expect(page.getByText('장바구니 내용을 10자 이상 입력해주세요.')).toBeVisible()
    await expect(page.getByTestId('proposal-result')).toHaveCount(0)
    await page.screenshot({ path: screenshotPath('home-special-features-proposal') })

    // the recents come back from the sidebar
    await page.locator('.nav-item').first().click()
    await expect(page.getByTestId('special-features')).toHaveCount(0)
  } finally {
    await closeAndSaveVideo(launched, 'home-special-features')
  }
})
