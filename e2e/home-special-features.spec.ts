import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * Home's 특화 기능 entry: the sidebar opens the feature list in the content pane, the
 * 품의서 생성 page shows its form and paper preview, and the budget total follows the rows.
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

    await page.getByTestId('special-feature-approval').click()
    await expect(page.getByRole('heading', { name: '품의서 생성' })).toBeVisible()
    const budget = page.locator('.sf-budget-row input')
    await budget.nth(0).fill('디지털 저울')
    await budget.nth(1).fill('10')
    await budget.nth(2).fill('45000')
    await budget.nth(3).fill('비커 세트')
    await budget.nth(4).fill('20')
    await budget.nth(5).fill('12000')
    await expect(page.locator('.sf-budget-foot strong')).toHaveText('690,000')
    await expect(page.locator('.sf-paper-sum td').last()).toHaveText('690,000')
    await page.screenshot({ path: screenshotPath('home-special-features-approval') })

    // the recents come back from the sidebar
    await page.locator('.nav-item').first().click()
    await expect(page.getByTestId('special-features')).toHaveCount(0)
  } finally {
    await closeAndSaveVideo(launched, 'home-special-features')
  }
})
