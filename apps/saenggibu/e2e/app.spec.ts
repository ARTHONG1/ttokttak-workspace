import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * 똑딱생기부 itself, launched from its build (out/): the page, the built-in 똑딱AI writing one
 * 행발, 세특 and 창체 entry, and the first-launch model download. The server comes from
 * build/local-ai (scripts/prepare-ai.mjs); the writing test reads V7 B from the model project
 * (SAENGGIBU_TEST_MODEL) and is skipped without it.
 */
const APP = resolve(__dirname, '..')
const AI_DIR = process.env.SAENGGIBU_AI_DIR || join(APP, 'build/local-ai')
const MODEL =
  process.env.SAENGGIBU_TEST_MODEL ||
  join(
    homedir(),
    'Desktop/인공지능 모델/.local-ai/ddak/models/school_record/school-record-v7-b/model-Q8_0.gguf',
  )
const NOMINAL = /(함|됨|임|음|보임|남|냄|름|님|줌|킴|침|큼|듦)\.?$/

test('똑딱생기부 writes 행발 and 세특 with the built-in 똑딱AI', async () => {
  test.skip(!existsSync(MODEL) || !existsSync(join(AI_DIR, 'manifest.json')), 'no model or runtime')
  const app = await electron.launch({
    args: [APP],
    env: {
      ...process.env,
      SAENGGIBU_AI_DIR: AI_DIR,
      SAENGGIBU_MODEL_FILE: MODEL,
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

    // 창체: the school level gives the areas; one 동아리활동 entry
    await page.getByRole('tab', { name: /창체/ }).click()
    await expect(page.getByTestId('record-area')).toBeDisabled()
    await page.getByTestId('record-activity-school').selectOption({ label: '고등학교' })
    await page.getByTestId('record-activity-grade').fill('2')
    await page.getByTestId('record-area').selectOption({ label: '동아리활동' })
    await page.getByTestId('record-activity-name').fill('과학탐구반')
    await page
      .getByTestId('record-activity-content')
      .fill('학교 앞 하천의 수질을 4주 동안 측정하고 결과를 학급 게시판에 공유함.')
    await expect(page.getByTestId('record-activity-rule')).toContainText('1,500바이트')
    await page.getByTestId('record-name').first().fill('박구름')
    await page
      .getByTestId('record-notes')
      .first()
      .fill('측정 결과를 표로 정리하고 부원들에게 설명함.')
    await page.getByTestId('record-generate-one').first().click()
    const activity = page.getByTestId('record-result').first()
    await expect(activity).not.toHaveValue('', { timeout: 120_000 })
    expect(await activity.inputValue()).toMatch(NOMINAL)
    await expect(page.getByTestId('record-bytes').first()).toContainText('/ 1,500 바이트')
    await page.screenshot({
      path: join(APP, 'test-results/saenggibu-activity.png'),
      fullPage: true,
    })
  } finally {
    await app.close()
  }
})

/**
 * The first launch without a model: a slow local server stands in for the GitHub release (a
 * few MB, in small steps), so the banner's progress and the writing request's answer show
 * while it downloads. The file is no model, so the server then fails to start: that is the
 * end of what this test checks.
 */
test('the first launch downloads the model and says so', async () => {
  const data = randomBytes(4 * 1024 * 1024)
  const sha256 = createHash('sha256').update(data).digest('hex')
  const server = createServer((req, res) => {
    // as GitHub's file storage (Azure) does: a User-Agent with bytes outside ASCII, such
    // as the app's Korean name, is refused with 400 "The request is badly formed"
    if (/[^\x20-\x7e]/.test(req.headers['user-agent'] ?? '')) return void res.writeHead(400).end()
    // /stall-once: a first request gets half the file and then nothing (a stuck connection)
    if (req.url === '/stall-once' && !req.headers.range) {
      res.writeHead(200, { 'Content-Length': data.length })
      res.write(data.subarray(0, data.length / 2))
      stalled.push(res)
      return
    }
    const range = /^bytes=(\d+)-$/.exec(req.headers.range ?? '')
    if (req.url === '/stall-once' && range) {
      const from = Number(range[1])
      res.writeHead(206, { 'Content-Length': data.length - from })
      return void res.end(data.subarray(from))
    }
    if (req.url !== '/model') return void res.writeHead(404).end()
    res.writeHead(200, { 'Content-Length': data.length })
    let at = 0
    const step = () => {
      if (at >= data.length) return void res.end()
      res.write(data.subarray(at, at + 256 * 1024))
      at += 256 * 1024
      setTimeout(step, 250)
    }
    step()
  })
  const stalled: import('node:http').ServerResponse[] = []
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  const launch = (url: string) =>
    electron.launch({
      args: [APP],
      env: {
        ...process.env,
        SAENGGIBU_AI_DIR: AI_DIR,
        SAENGGIBU_MODEL_URL: url,
        SAENGGIBU_MODEL_BYTES: String(data.length),
        SAENGGIBU_MODEL_SHA256: sha256,
        SAENGGIBU_MODEL_IDLE_MS: '2000',
        SAENGGIBU_USER_DATA: mkdtempSync(join(tmpdir(), 'saenggibu-e2e-')),
      } as Record<string, string>,
    })
  try {
    const app = await launch(base + '/model')
    try {
      const page = await app.firstWindow()
      const banner = page.getByTestId('sg-model')
      await expect(banner).toContainText('처음 한 번 받고 있어요')
      await expect(page.getByTestId('sg-model-progress')).toBeVisible()
      await expect(page.getByTestId('sg-ai-state')).toContainText('똑딱AI 받는 중')
      await page.screenshot({ path: join(APP, 'test-results/saenggibu-download-banner.png') })
      // a writing request during the download is told how far it is
      await page.getByRole('tab', { name: /행발/ }).click()
      await page.getByTestId('record-name').first().fill('김하늘')
      await page
        .getByTestId('record-notes')
        .first()
        .fill('모둠 활동에서 친구의 의견을 정리해 발표함.')
      await page.getByTestId('record-generate-one').first().click()
      await expect(page.locator('.sf-toast')).toContainText('처음 한 번 받는 중이에요')
      await page.screenshot({ path: join(APP, 'test-results/saenggibu-download.png') })
      // downloaded and checked: the banner goes away
      await expect(banner).toHaveCount(0, { timeout: 30_000 })
    } finally {
      await app.close()
    }

    // nothing at the address: the banner offers [다시 받기] and [파일로 넣기]
    const missing = await launch(base + '/nothing')
    try {
      const page = await missing.firstWindow()
      await expect(page.getByTestId('sg-model')).toContainText('다 받지 못했어요')
      await expect(page.getByTestId('sg-model')).toContainText('404')
      await expect(page.getByTestId('sg-model-retry')).toBeVisible()
      await expect(page.getByTestId('sg-model-import')).toBeVisible()
      await expect(page.getByTestId('sg-ai-state')).toHaveText('똑딱AI 받기 멈춤')
      await page.screenshot({ path: join(APP, 'test-results/saenggibu-download-failed.png') })
    } finally {
      await missing.close()
    }

    // a connection that stops sending halfway: dropped after the stall limit and resumed
    const stuck = await launch(base + '/stall-once')
    try {
      const page = await stuck.firstWindow()
      await expect(page.getByTestId('sg-model')).toContainText('처음 한 번 받고 있어요')
      await expect(page.getByTestId('sg-model')).toHaveCount(0, { timeout: 30_000 })
      await expect(page.getByTestId('sg-ai-state')).not.toContainText('받')
    } finally {
      await stuck.close()
    }
  } finally {
    for (const res of stalled) res.destroy()
    server.close()
  }
})
