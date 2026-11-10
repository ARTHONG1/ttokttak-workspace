import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * 똑딱업무 > 생기부: 교과 세특 asks for its common information before it calls the AI, 행발
 * asks for an observation, a typed result is counted in NEIS bytes, and saved work comes
 * back from the list. The AI turns themselves are not run here (no provider in the test app).
 */
test('생기부 checks its inputs, counts NEIS bytes and keeps saved work', async () => {
  const launched = await launchShell({
    videoDir: 'school-record',
    onboardingSeen: true,
    lang: 'ko',
  })
  const { page } = launched
  try {
    await page.getByTestId('trial-features').click()
    await page.getByTestId('special-feature-record').click()
    await expect(page.getByRole('heading', { name: '생기부' })).toBeVisible()

    // 교과 세특: nothing goes to the AI until the common information is there
    await page.getByTestId('record-generate-all').click()
    await expect(page.locator('.sf-toast')).toHaveText('학교급을 골라 주세요.')
    await page.getByTestId('record-school').selectOption('elementary')
    await page.getByTestId('record-subject').selectOption('custom')
    await page.getByTestId('record-subject-custom').fill('정보')
    await page.getByTestId('record-generate-one').first().click()
    await expect(page.locator('.sf-toast')).toHaveText('과제 설명을 입력해 주세요.')

    // students: the count adds rows, and a typed text is counted as NEIS counts it
    await page.getByTestId('record-count').fill('3')
    await page.getByTestId('record-count').blur()
    await expect(page.getByTestId('record-student')).toHaveCount(3)
    await page.getByTestId('record-name').first().fill('김하늘')
    await page.getByTestId('record-result').first().fill('탐구에 적극적으로 참여함.')
    await expect(page.getByTestId('record-bytes').first()).toHaveText('36 / 1,500 바이트')
    await page.screenshot({ path: screenshotPath('school-record-subject') })

    // 행발 keeps its own students and needs an observation
    await page.getByTestId('record-tab-behavior').click()
    await expect(page.getByTestId('record-school')).toHaveCount(0)
    await expect(page.getByTestId('record-student')).toHaveCount(1)
    await page.getByTestId('record-generate-all').click()
    await expect(page.locator('.sf-toast')).toHaveText('관찰 기록을 입력한 학생이 없어요.')
    // nothing to send to NEIS yet
    await page.getByTestId('record-send').click()
    await expect(page.locator('.sf-toast')).toHaveText(
      '나이스로 보낼 글이 없어요. 먼저 글을 만들어 주세요.',
    )
    await expect(page.getByTestId('record-send-note')).toHaveCount(0)
    await page.screenshot({ path: screenshotPath('school-record-behavior') })

    // 임시 저장: the 세특 work comes back after the list is emptied
    await page.getByTestId('record-tab-subject').click()
    await page.getByTestId('record-save').click()
    await page.getByText('학생 목록 비우기').click()
    await expect(page.getByTestId('record-student')).toHaveCount(1)
    await page.getByTestId('record-open-list').click()
    await expect(page.getByTestId('record-session')).toHaveCount(1)
    await expect(page.getByTestId('record-session')).toContainText('정보 세특 · 1명')
    await page.getByTestId('record-session').getByRole('button', { name: '불러오기' }).click()
    await expect(page.getByTestId('record-student')).toHaveCount(3)
    await expect(page.getByTestId('record-name').first()).toHaveValue('김하늘')
  } finally {
    await closeAndSaveVideo(launched, 'school-record')
  }
})
