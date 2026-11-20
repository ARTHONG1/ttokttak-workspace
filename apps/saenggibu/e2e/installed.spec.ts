import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * An installed 똑딱생기부 (SAENGGIBU_PACKAGED_EXE: the Mac app's binary or the Windows exe) on
 * a fresh user folder: it downloads 똑딱AI's base and 생기부 adapter from the shared model
 * release, checks them, starts the server and writes one 행발. Run by hand after installing,
 * and by the Windows build on its runner. The user folder's name has Korean letters, as a
 * teacher's may.
 */
const EXE = process.env.SAENGGIBU_PACKAGED_EXE ?? ''
const NOMINAL = /(함|됨|임|음|보임|남|냄|름|님|줌|킴|침|큼|듦)\.?$/

test('the installed app downloads its model and writes a 행발', async () => {
  test.skip(!EXE, 'SAENGGIBU_PACKAGED_EXE is not set')
  test.setTimeout(30 * 60_000)
  const userData = join(mkdtempSync(join(tmpdir(), 'saenggibu-installed-')), '똑딱생기부')
  const {
    SAENGGIBU_AI_DIR: _a,
    SAENGGIBU_MODEL_FILE: _b,
    SAENGGIBU_MODEL_URL: _c,
    SAENGGIBU_ADAPTER_FILE: _d,
    ...env
  } = process.env
  const app = await electron.launch({
    executablePath: EXE,
    env: { ...env, SAENGGIBU_USER_DATA: userData } as Record<string, string>,
  })
  try {
    const info = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      version: app.getVersion(),
    }))
    console.log('[installed]', JSON.stringify(info))
    expect(info.packaged).toBe(true)
    const page = await app.firstWindow()
    const state = page.getByTestId('sg-ai-state')
    const started = Date.now()
    await expect(state).toContainText(/받는 중|확인 중|준비/, { timeout: 60_000 })
    await expect(state).toHaveText('똑딱AI 준비됨', { timeout: 25 * 60_000 })
    console.log('[installed] model ready after', ((Date.now() - started) / 1000).toFixed(0) + 's')
    await page.getByRole('tab', { name: /행발/ }).click()
    await page.getByTestId('record-name').first().fill('김하늘')
    await page
      .getByTestId('record-notes')
      .first()
      .fill('모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 발표함. 교실 화분에 매일 물을 줌.')
    await page.getByTestId('record-generate-one').first().click()
    const result = page.getByTestId('record-result').first()
    await expect(result).not.toHaveValue('', { timeout: 5 * 60_000 })
    const said = await result.inputValue()
    console.log('[installed] 행발', JSON.stringify(said))
    expect(said).toMatch(NOMINAL)
  } finally {
    await app.close()
  }
})
