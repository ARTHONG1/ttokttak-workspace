import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * Home's three tiles: 문서 업로드, 똑딱업무 and 똑딱수업. 똑딱업무 opens the work tools in
 * place of the home and their back button returns to it; the 품의서 생성 page checks its inputs before it calls the
 * AI, and 똑딱퀴즈 checks the question count. The AI turns themselves are not run here (no
 * provider in the test app).
 */
test('special features open from the home tiles', async () => {
  const launched = await launchShell({
    videoDir: 'home-special-features',
    onboardingSeen: true,
    lang: 'ko',
  })
  const { page } = launched
  try {
    await expect(page.locator('.hub-tile')).toHaveCount(3)
    await expect(page.locator('.hub-title')).toHaveText(['문서 업로드', '똑딱업무', '똑딱수업'])
    await page.screenshot({ path: screenshotPath('home-hub') })

    // 똑딱수업, with the way over to 똑딱업무
    await page.getByTestId('trial-class').click()
    await expect(page.getByTestId('class-tools')).toBeVisible()
    await page.screenshot({ path: screenshotPath('home-class-tools') })
    await page.getByTestId('class-to-work').click()
    await expect(page.getByTestId('special-features')).toBeVisible()
    await page.locator('.sf-back').first().click()
    await expect(page.getByTestId('special-features')).toHaveCount(0)

    await page.getByTestId('trial-features').click()
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
    await expect(page.getByRole('heading', { name: '똑딱퀴즈' })).toBeVisible()
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

    // 단어 찾기: words typed by hand make a sheet without the AI, every word in the grid
    await page.getByTestId('quiz-mode-words').click()
    for (const word of ['뿌리', '줄기', '열매', '광합성', '꽃가루']) {
      await page.getByTestId('ws-new-word').fill(word)
      await page.getByTestId('ws-new-word').press('Enter')
    }
    await expect(page.getByTestId('ws-list').locator('li')).toHaveCount(5)
    await page.getByTestId('ws-generate').click()
    await expect(page.getByTestId('ws-result')).toBeVisible()
    await expect(page.getByTestId('ws-grid').locator('tr')).toHaveCount(15)
    await page.getByRole('tab', { name: '해답' }).click()
    // 14 letters; at 보통 two words may share a letter, so a few cells fewer
    const hits = await page.locator('.ws-grid td.is-hit').count()
    expect(hits).toBeGreaterThan(9)
    expect(hits).toBeLessThanOrEqual(14)
    await page.screenshot({ path: screenshotPath('home-special-features-wordsearch') })

    // back to the list, then back to the home
    await page.locator('.sf-back').first().click()
    await page.locator('.sf-back').first().click()
    await expect(page.getByTestId('special-features')).toHaveCount(0)
    await expect(page.getByTestId('trial-features')).toBeVisible()
  } finally {
    await closeAndSaveVideo(launched, 'home-special-features')
  }
})
