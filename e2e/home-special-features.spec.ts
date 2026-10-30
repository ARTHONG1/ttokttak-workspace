import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * Home's 특화 기능 entry: the sidebar opens the feature list in the content pane; the
 * 품의서 생성 page checks its inputs before it calls the AI, and the 퀴즈 생성기 page checks
 * the question count. The AI turns themselves are not run here (no provider in the test app).
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

    await page.locator('.sf-back').click()
    await page.getByTestId('special-feature-quiz').click()
    await expect(page.getByRole('heading', { name: '퀴즈 생성기' })).toBeVisible()
    await page
      .getByTestId('quiz-content')
      .fill('광합성은 식물이 빛 에너지로 포도당을 만드는 과정이다.')
    await page.getByTestId('quiz-count-multipleChoice').fill('25')
    await page.getByTestId('quiz-count-ox').fill('10')
    await expect(page.getByText('모두 35문제')).toBeVisible()
    await page.getByTestId('quiz-generate').click()
    await expect(page.getByText('총 문제 수는 1에서 30 사이여야 합니다.')).toBeVisible()
    await expect(page.getByTestId('quiz-result')).toHaveCount(0)
    await page.getByTestId('quiz-input-youtube').click()
    await expect(page.getByTestId('quiz-youtube')).toBeVisible()
    await page.screenshot({ path: screenshotPath('home-special-features-quiz') })

    // the recents come back from the sidebar
    await page.locator('.nav-item').first().click()
    await expect(page.getByTestId('special-features')).toHaveCount(0)
  } finally {
    await closeAndSaveVideo(launched, 'home-special-features')
  }
})
