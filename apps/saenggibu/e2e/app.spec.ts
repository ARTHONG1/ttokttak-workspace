import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * 똑딱생기부 itself, launched from its build (out/): the page, the built-in 똑딱AI writing one
 * 행발 entry, and a 교과 세특 entry. The AI part needs the staged model (scripts/prepare-ai.mjs
 * → build/local-ai) and is skipped without it.
 */
const APP = resolve(__dirname, '..')
const AI_DIR = process.env.SAENGGIBU_AI_DIR || join(APP, 'build/local-ai')
const NOMINAL = /(함|됨|임|음|보임|남|냄|름|님|줌|킴|침|큼|듦)\.?$/

test('똑딱생기부 writes 행발 and 세특 with the built-in 똑딱AI', async () => {
  test.skip(!existsSync(join(AI_DIR, 'model.gguf')), 'no staged model')
  const app = await electron.launch({
    args: [APP],
    env: {
      ...process.env,
      SAENGGIBU_AI_DIR: AI_DIR,
      SAENGGIBU_USER_DATA: mkdtempSync(join(tmpdir(), 'saenggibu-e2e-')),
    } as Record<string, string>,
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByText('똑딱생기부').first()).toBeVisible()
    await expect(page.getByTestId('sg-ai-state')).toHaveText('똑딱AI 준비됨', { timeout: 150_000 })

    // 행발: one student, an observation, one answer from the built-in model
    await page.getByRole('tab', { name: /행발/ }).click()
    await page.getByTestId('record-name').first().fill('김하늘')
    await page
      .getByTestId('record-notes')
      .first()
      .fill('모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 발표함. 교실 화분에 매일 물을 줌.')
    await page.getByTestId('record-generate-one').first().click()
    const behavior = page.getByTestId('record-result').first()
    await expect(behavior).not.toHaveValue('', { timeout: 120_000 })
    const said = await behavior.inputValue()
    expect(said).toMatch(NOMINAL)
    expect(said).not.toContain('\n')
    await page.screenshot({ path: join(APP, 'test-results/saenggibu-behavior.png') })

    // 교과 세특: the common information, then one answer
    await page.getByRole('tab', { name: /교과 세특/ }).click()
    await page.getByTestId('record-school').selectOption({ label: '초등학교' })
    await page.getByTestId('record-subject').selectOption({ label: '과학' })
    await page
      .getByTestId('record-assignment')
      .fill('물의 순환 과정을 조사하고 모둠별로 순환 모형을 만들어 발표하는 과제')
    await page.getByTestId('record-standard').fill('[6과04-01] 물의 순환 과정을 설명할 수 있다.')
    await page.getByTestId('record-name').first().fill('이바다')
    await page
      .getByTestId('record-notes')
      .first()
      .fill('증발과 응결 실험 결과를 기록표에 정리함. 구름이 생기는 과정을 그림으로 설명함.')
    await page.getByTestId('record-generate-one').first().click()
    const subject = page.getByTestId('record-result').first()
    await expect(subject).not.toHaveValue('', { timeout: 120_000 })
    expect(await subject.inputValue()).toMatch(NOMINAL)
    await page.screenshot({ path: join(APP, 'test-results/saenggibu-subject.png') })
  } finally {
    await app.close()
  }
})
