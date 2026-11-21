import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

/**
 * 똑딱생기부 itself, launched from its build (out/): the page, the built-in 똑딱AI writing one
 * 행발, 세특 and 창체 entry, and the first-launch model download. The server comes from
 * build/local-ai (scripts/prepare-ai.mjs); the writing test reads 똑딱AI's base and 생기부
 * adapter from the model project (SAENGGIBU_TEST_MODEL, SAENGGIBU_TEST_ADAPTER) and is skipped
 * without them.
 */
const APP = resolve(__dirname, '..')
const AI_DIR = process.env.SAENGGIBU_AI_DIR || join(APP, 'build/local-ai')
const MODELS = join(homedir(), 'Desktop/인공지능 모델/.local-ai')
const MODEL = process.env.SAENGGIBU_TEST_MODEL || join(MODELS, 'models/Qwen3.5-2B-Q8_0.gguf')
const ADAPTER =
  process.env.SAENGGIBU_TEST_ADAPTER ||
  join(MODELS, 'ddak/models/school_record/school-record-v7-b-app-lora/school_record.gguf')
const NOMINAL = /(함|됨|임|음|보임|남|냄|름|님|줌|킴|침|큼|듦)\.?$/

/**
 * Close an app whose page may hold students' work: it asks before they go (main/index.ts), and
 * here the question is answered [저장하지 않고 닫기].
 */
async function closeApp(app: ElectronApplication): Promise<void> {
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as never
    })
    .catch(() => undefined)
  await app.close()
}

test('똑딱생기부 writes 행발 and 세특 with the built-in 똑딱AI', async () => {
  test.skip(
    !existsSync(MODEL) || !existsSync(ADAPTER) || !existsSync(join(AI_DIR, 'manifest.json')),
    'no model or runtime',
  )
  const app = await electron.launch({
    args: [APP],
    env: {
      ...process.env,
      SAENGGIBU_AI_DIR: AI_DIR,
      SAENGGIBU_MODEL_FILE: MODEL,
      SAENGGIBU_ADAPTER_FILE: ADAPTER,
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

    // [멈추기] calls off the students being written: a run asks three at once, and waiting
    // for them took half a minute while all three were written (2026-11-21)
    await page.getByRole('tab', { name: /행발/ }).click()
    await page.getByTestId('record-count').fill('3')
    await page.getByTestId('record-count').press('Enter')
    const notes = [
      '청소 당번을 성실히 하며 교실 화분을 돌봄.',
      '모둠 활동에서 갈등을 조정하고 의견을 모음.',
      '독서 기록장을 꾸준히 쓰고 친구에게 책을 추천함.',
    ]
    for (const [i, note] of notes.entries()) {
      await page
        .getByTestId('record-name')
        .nth(i)
        .fill('학생' + (i + 1))
      await page.getByTestId('record-notes').nth(i).fill(note)
      await page.getByTestId('record-result').nth(i).fill('')
    }
    await page.getByTestId('record-generate-all').click()
    await expect(page.getByTestId('record-stop')).toBeVisible()
    await page.getByTestId('record-stop').click()
    await expect(page.getByTestId('record-stop')).toHaveCount(0, { timeout: 10_000 })
    const written = await page
      .getByTestId('record-result')
      .evaluateAll((areas) => areas.filter((a) => (a as HTMLTextAreaElement).value).length)
    expect(written).toBeLessThan(3)
    await expect(page.locator('.sf-toast')).not.toContainText('만들지 못했어요')

    // 겹치는 글 한꺼번에 바꾸기 counts only the texts that came back changed (one handed
    // back word for word was counted as reworded)
    const alike =
      '여러 가지 물질의 밀도를 측정하고 결과를 그래프로 정리하여 발표함. 실험 결과를 표로 정리하고 오차의 원인을 모둠원과 토의함.'
    for (let i = 0; i < 3; i++) await page.getByTestId('record-result').nth(i).fill(alike)
    await expect(page.getByTestId('record-alike')).toHaveCount(3)
    await page.getByTestId('record-reword-all').click()
    await expect(page.getByTestId('record-stop')).toBeVisible()
    await expect(page.getByTestId('record-stop')).toHaveCount(0, { timeout: 240_000 })
    const claimed = Number(
      /(\d+)명의 글 표현을 바꿨어요/.exec(
        (await page.locator('.sf-toast').textContent()) ?? '',
      )?.[1],
    )
    const changed = await page
      .getByTestId('record-result')
      .evaluateAll(
        (areas, text) => areas.filter((a) => (a as HTMLTextAreaElement).value !== text).length,
        alike,
      )
    expect(claimed).toBe(changed)
  } finally {
    await closeApp(app)
  }
})

/**
 * The students' work stays in the page until [임시 저장]. A close asks before it goes and can
 * save it on the way out; [학생 목록 비우기] asks before it empties a list. (Both took a
 * class's texts with nothing said, 2026-11-21.) No model is needed for this.
 */
test('asks before the students go, on close and on clearing the list', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'saenggibu-e2e-'))
  const launch = () =>
    electron.launch({
      args: [APP],
      env: {
        ...process.env,
        SAENGGIBU_AI_DIR: AI_DIR,
        SAENGGIBU_MODEL_FILE: join(userData, 'no-model.gguf'),
        SAENGGIBU_USER_DATA: userData,
      } as Record<string, string>,
    })
  // the close question answers itself in this test: response 0 saves, 2 keeps the window
  const answerClose = (app: Awaited<ReturnType<typeof launch>>, response: number) =>
    app.evaluate(({ dialog }, r) => {
      const g = globalThis as { asked?: number }
      g.asked = 0
      dialog.showMessageBox = (async () => {
        g.asked = (g.asked ?? 0) + 1
        return { response: r, checkboxChecked: false }
      }) as never
    }, response)
  const asked = (app: Awaited<ReturnType<typeof launch>>) =>
    app.evaluate(() => (globalThis as { asked?: number }).asked ?? 0)

  const app = await launch()
  const page = await app.firstWindow()
  await page.getByRole('tab', { name: /행발/ }).click()
  await page.getByTestId('record-name').first().fill('김하늘')
  await page.getByTestId('record-notes').first().fill('친구의 의견을 끝까지 듣고 정리해 발표함.')

  // clearing asks first; [취소] keeps the student
  await page.getByTestId('record-clear').click()
  await page.getByRole('dialog').getByRole('button', { name: '취소' }).click()
  await expect(page.getByTestId('record-name').first()).toHaveValue('김하늘')
  await page.getByTestId('record-clear').click()
  await page.getByTestId('record-clear-confirm').click()
  await expect(page.getByTestId('record-name').first()).toHaveValue('')

  // a close with a student in the page asks; [취소] keeps the window
  await page.getByTestId('record-name').first().fill('이바다')
  await answerClose(app, 2)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await expect.poll(() => asked(app)).toBe(1)
  await expect(page.getByTestId('record-name').first()).toHaveValue('이바다')

  // [임시 저장하고 닫기]: saved, then closed
  await answerClose(app, 0)
  const closed = app.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await closed

  // the next launch has it under [불러오기], and closes without asking (an asked close would
  // be answered [취소] here and never end)
  const again = await launch()
  try {
    const next = await again.firstWindow()
    await expect(next.getByTestId('record-open-list')).toHaveText('불러오기 (1)')
    await next.getByTestId('record-open-list').click()
    await next.getByRole('dialog').getByRole('button', { name: '불러오기' }).click()
    await expect(next.getByTestId('record-name').first()).toHaveValue('이바다')
    await answerClose(again, 2)
    const done = again.waitForEvent('close')
    await again.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    await done
  } finally {
    await again.close().catch(() => undefined)
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
      await closeApp(app)
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

/**
 * 나이스에서 가져오기 without a school's NEIS: the main process's reading is answered here
 * (the reading itself is tested against a fake NEIS screen in tests/neis-browser.test.ts).
 */
test('takes the class and its 누가기록 from NEIS into 행발', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'saenggibu-e2e-'))
  const app = await electron.launch({
    args: [APP],
    env: {
      ...process.env,
      SAENGGIBU_AI_DIR: AI_DIR,
      SAENGGIBU_MODEL_FILE: join(userData, 'no-model.gguf'),
      SAENGGIBU_USER_DATA: userData,
    } as Record<string, string>,
  })
  try {
    const page = await app.firstWindow()
    const answer = (result: unknown) =>
      app.evaluate(({ ipcMain }, r) => {
        ipcMain.removeHandler('saenggibu:read-neis-class')
        ipcMain.handle('saenggibu:read-neis-class', () => r)
      }, result)
    await page.getByRole('tab', { name: /행발/ }).click()
    await page.getByTestId('record-name').first().fill('이바다')
    await page.getByTestId('record-notes').first().fill('청소 당번을 성실히 함.')

    // NEIS not on the 누가기록 screen yet: what to do is said in the dialog
    await answer({ ok: false, message: '누가기록 화면을 연 뒤 다시 눌러 주세요.' })
    await page.getByTestId('record-neis').click()
    await page.getByTestId('record-neis-read').click()
    await expect(page.getByTestId('record-neis-error')).toContainText('누가기록 화면')

    // the class with its 누가기록: previewed, then put in the NEIS order
    await answer({
      ok: true,
      recordsFor: 'all',
      recordsRead: 2,
      unplaced: 0,
      students: [
        {
          cls: '3',
          no: '1',
          name: '김하늘',
          records: [{ date: '20260315', text: '질문을 자주 함.' }],
        },
        {
          cls: '3',
          no: '2',
          name: '이바다',
          records: [{ date: '20260310', text: '화분을 돌봄.' }],
        },
        { cls: '3', no: '3', name: '박구름', records: [] },
      ],
    })
    await page.getByTestId('record-neis-read').click()
    await expect(page.getByTestId('record-neis-summary')).toContainText('3명')
    await expect(page.getByTestId('record-neis-summary')).toContainText('누가기록 2건')
    await expect(page.getByTestId('record-neis-outcome')).toContainText('이미 목록에 있는 학생 1명')
    await expect(page.getByTestId('record-neis-outcome')).toContainText('새 학생 2명')
    await page.screenshot({ path: join(APP, 'test-results/saenggibu-neis-preview.png') })
    await page.getByTestId('record-neis-apply').click()
    await expect(page.getByTestId('record-name')).toHaveCount(3)
    expect(
      await page
        .getByTestId('record-name')
        .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)),
    ).toEqual(['김하늘', '이바다', '박구름'])
    expect(
      await page
        .getByTestId('record-notes')
        .evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value)),
    ).toEqual(['질문을 자주 함.', '청소 당번을 성실히 함.\n화분을 돌봄.', ''])
    await page.screenshot({ path: join(APP, 'test-results/saenggibu-neis-import.png') })

    // a list longer than one list holds is shown, never put in (saving would drop the rest)
    await answer({
      ok: true,
      recordsFor: 'none',
      recordsRead: 0,
      unplaced: 0,
      students: Array.from({ length: 51 }, (_, i) => ({
        cls: '3',
        no: String(i + 1),
        name: '학생' + (i + 1),
        records: [],
      })),
    })
    await page.getByTestId('record-neis').click()
    await page.getByTestId('record-neis-read').click()
    await expect(page.getByTestId('record-neis-too-many')).toContainText('50명')
    await expect(page.getByTestId('record-neis-apply')).toBeDisabled()
    await page.getByRole('button', { name: '취소' }).click()
    await expect(page.getByTestId('record-name')).toHaveCount(3)
  } finally {
    await closeApp(app)
  }
})
