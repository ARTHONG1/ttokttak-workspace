import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'

/**
 * 똑딱AI's model files on a new installation (since 0.17.0 the installer has the server only):
 * the built-in AI is preselected, its four files download from the model release, and both
 * runs answer: a 행발 on 똑딱AI 생기부 V7 B, then the settings' connection test on the base,
 * which switches the server back. 4.1 GB from GitHub, so only with
 * GENOFFICE_E2E_LOCAL_AI_DOWNLOAD=1: a development run with llama.cpp from the model project,
 * or the packaged app (GENOFFICE_E2E_PACKAGED_EXECUTABLE).
 */
const runtime =
  process.env.GENOFFICE_LOCAL_AI_RUNTIME ||
  join(homedir(), 'Desktop/인공지능 모델/.local-ai/runtime/llama-b12167/llama-server')
const packaged = process.env.GENOFFICE_E2E_PACKAGED_EXECUTABLE
const NOMINAL = /(함|됨|임|음|보임|남|냄|름|님|줌|킴|침|큼|듦)\.?$/

test('a new installation downloads the model files, then 생기부 and documents both answer', async () => {
  test.skip(
    process.env.GENOFFICE_E2E_LOCAL_AI_DOWNLOAD !== '1',
    'downloads 4.1 GB: set GENOFFICE_E2E_LOCAL_AI_DOWNLOAD=1',
  )
  test.skip(!packaged && !existsSync(runtime), 'no llama.cpp runtime')
  test.setTimeout(45 * 60_000)
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    lang: 'ko',
    recordVideo: false,
    videoDir: 'local-ai-models',
    env: packaged ? {} : { GENOFFICE_LOCAL_AI_RUNTIME: runtime },
  })
  const { page } = launched
  try {
    // a new installation: the built-in AI is selected, and its files start downloading
    expect((await page.evaluate(() => window.aiOffice.getAiSettings())).provider).toBe('local')
    const started = Date.now()
    let shown = -1
    await expect
      .poll(
        async () => {
          const info = await page.evaluate(() => window.aiOffice.getLocalAiModels?.())
          const tenth = info?.total ? Math.floor(((info.received ?? 0) / info.total) * 10) : -1
          if (info?.state !== 'downloading' || tenth !== shown) {
            shown = tenth
            const s = Math.round((Date.now() - started) / 1000)
            console.log(
              '[local-ai-models]',
              s + 's',
              info?.state,
              tenth >= 0 ? tenth * 10 + '%' : '',
            )
          }
          return info?.state
        },
        { timeout: 40 * 60_000, intervals: [5_000] },
      )
      .toBe('ready')
    const info = await page.evaluate(() => window.aiOffice.getLocalAiModels?.())
    expect(info?.ready).toEqual(['main', 'school_record'])
    const folder = join(launched.userDataDir, 'local-ai-models')
    for (const file of [
      'base.gguf',
      'adapters/document.gguf',
      'adapters/pumui.gguf',
      'school-record.gguf',
    ])
      expect(existsSync(join(folder, file))).toBe(true)

    // 생기부 on V7 B
    await page.getByTestId('trial-features').click()
    await page.getByTestId('special-feature-record').click()
    await page.getByTestId('record-tab-behavior').click()
    await page.getByTestId('record-name').first().fill('김하늘')
    await page
      .getByTestId('record-notes')
      .first()
      .fill('모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 발표함. 교실 화분에 매일 물을 줌.')
    await page.getByTestId('record-generate-one').first().click()
    const result = page.getByTestId('record-result').first()
    await expect(result).not.toHaveValue('', { timeout: 5 * 60_000 })
    const said = await result.inputValue()
    console.log('[local-ai-models] 행발', JSON.stringify(said))
    expect(said).toMatch(NOMINAL)
    await page.screenshot({ path: screenshotPath('local-ai-models-record') })

    // the base again: the settings show the files in, and the connection test answers
    const opened = await launched.app.evaluate(({ Menu, BrowserWindow }) => {
      const item = Menu.getApplicationMenu()
        ?.items.flatMap((entry) => entry.submenu?.items ?? [])
        .find((entry) => entry.id === 'workspace-ai-settings')
      if (!item) return false
      item.click(undefined as never, BrowserWindow.getAllWindows()[0], undefined as never)
      return true
    })
    expect(opened).toBe(true)
    await page.locator('.set-nav-item').filter({ hasText: 'AI' }).first().click()
    await expect(page.getByTestId('local-ai-model')).toHaveAttribute('data-state', 'ready')
    await expect(page.getByTestId('local-ai-model')).toContainText('이 컴퓨터에 있어요')
    await page.screenshot({ path: screenshotPath('local-ai-models-settings') })
    await page.locator('.set-adv-toggle:not(.set-external-ai-toggle)').click()
    await page.locator('.set-pane-head .set-btn').filter({ hasText: '연결 테스트' }).click()
    await expect(page.locator('.set-pane-head [role="status"]')).toContainText(/연결 성공/, {
      timeout: 3 * 60_000,
    })
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-models')
  }
})
