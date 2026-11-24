import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRecordPackage } from '../src/features/neis-record/package'

/**
 * 생기부 나이스 입력 (task id neis-record) against a stand-in NEIS grid: the 똑딱 button on
 * the NEIS page, automatic input after an explicit web send, and the manual paste flow. It never presses NEIS's save.
 */
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(HERE, 'dist')
const TEST_DIR = join(HERE, 'dist-test')

const workText = JSON.stringify(
  buildRecordPackage({
    mode: 'subject',
    title: '과학 세특 · 3명',
    students: [
      { name: '김하늘', text: '탐구에 적극적으로 참여함.' },
      { name: '이바다', text: '' },
      { name: '박나래', text: '관찰 일지를 꼼꼼히 기록함.' },
      { name: '최우주', text: '발표를 논리적으로 함.' },
    ],
  }),
)

let server: Server
let base = ''
let context: BrowserContext
let sw: Worker

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const name = (req.url ?? '/').split('?')[0].replace(/^\//, '') || 'fake-neis.html'
    try {
      const body = await readFile(join(TEST_DIR, name))
      res.writeHead(200, {
        'content-type': name.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'text/javascript; charset=utf-8',
      })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'ttok-neis-')), {
    channel: 'chromium',
    executablePath: process.env.EDUFINE_CHROMIUM || undefined,
    args: ['--disable-extensions-except=' + DIST, '--load-extension=' + DIST],
  })
  sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
})

test.afterAll(async () => {
  await context?.close()
  server?.close()
})

test.beforeEach(async () => {
  await sw.evaluate(async () => {
    await (globalThis as any).chrome.storage.local.remove([
      'inbox:neis-record',
      'inbox:edufine-pumui',
      'place:neis',
      'autoOpenUntil',
    ])
  })
})

async function openNeis(query = ''): Promise<Page> {
  const page = await context.newPage()
  await page.goto(base + '/fake-neis.html' + query)
  await expect(page.getByRole('button', { name: '똑딱', exact: true })).toBeVisible({
    timeout: 15_000,
  })
  // the page told the extension where NEIS runs
  await expect
    .poll(() =>
      sw.evaluate(async () =>
        Boolean((await (globalThis as any).chrome.storage.local.get('place:neis'))['place:neis']),
      ),
    )
    .toBe(true)
  return page
}

async function sendFromWebApp(text: string): Promise<{ page: Page; reply: any }> {
  const page = await context.newPage()
  await page.goto(base + '/web-sender.html')
  const reply = await page.evaluate((t) => (window as any).sendWork('neis-record', t), text)
  return { page, reply }
}

const texts = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__neis.texts())
const row = (page: Page, n: number) => page.locator('.cl-grid-row').nth(n)

const expectedTexts = [
  '탐구에 적극적으로 참여함.',
  '',
  '관찰 일지를 꼼꼼히 기록함.',
  '발표를 논리적으로 함.',
]
const emptyTexts = ['', '', '', '']

async function previewPastedWork(neis: Page) {
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
  await neis.getByRole('button', { name: '똑딱', exact: true }).click()
  await panel.getByText('복사한 생기부 작업 넣기').click()
  await panel.getByLabel('생기부 작업 붙여 넣기').fill(workText)
  return panel
}

for (const mode of ['subject', 'behavior', 'activity'] as const) {
  test(`one web send waits for the right ${mode} student row and confirms every write`, async () => {
    const neis = await openNeis('?mode=' + mode)
    const { page: sender, reply } = await sendFromWebApp(
      JSON.stringify({ ...JSON.parse(workText), mode }),
    )
    expect(reply).toMatchObject({ ok: true, moved: 'focused' })
    const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
    await expect(panel.getByRole('heading', { name: '자동 입력 대기 중' })).toBeVisible()
    expect(await texts(neis)).toEqual(emptyTexts)

    await row(neis, 1).click()
    await expect(panel.getByText('첫 학생 줄을 하나만 골라 주세요.')).toBeVisible()
    expect(await texts(neis)).toEqual(emptyTexts)

    await row(neis, 0).click()
    await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible()
    await expect(panel.getByText('3명의 입력값을 나이스 표에서 확인했어요.')).toBeVisible()
    expect(await texts(neis)).toEqual(expectedTexts)
    expect(await neis.evaluate(() => (window as any).__saved ?? 0)).toBe(0)
    expect(
      await sw.evaluate(
        async () =>
          (await (globalThis as any).chrome.storage.local.get('inbox:neis-record'))[
            'inbox:neis-record'
          ],
      ),
    ).toBeUndefined()
    await sender.close()
    await neis.close()
  })
}

test('cancelling the wait leaves zero writes after row selection and offers a manual preview', async () => {
  const neis = await openNeis('?filled=1')
  const { page: sender } = await sendFromWebApp(workText)
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
  await panel.getByRole('button', { name: '자동 입력 취소' }).click()
  await expect(panel.getByRole('heading', { name: '자동 입력을 취소했어요' })).toBeVisible()
  await row(neis, 0).click()
  // Let more than two readiness polls pass after a newly eligible selection.
  await neis.waitForTimeout(1_800)
  expect(await texts(neis)).toEqual(['지난 학기 글.', '', '', ''])
  await neis.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(panel.getByRole('heading', { name: '과학 세특 · 3명' })).toBeVisible()
  await panel.getByLabel('새 글로 바꾸기').check()
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible()
  expect(await texts(neis)).toEqual(expectedTexts)
  await sender.close()
  await neis.close()
})

test('when the grid does not move on it stops, and goes on from the next student', async () => {
  const neis = await openNeis('?stuck=0')
  const panel = await previewPastedWork(neis)
  await row(neis, 0).click()
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '1명까지 넣고 멈췄어요' })).toBeVisible({
    timeout: 30_000,
  })
  expect(await texts(neis)).toEqual(['탐구에 적극적으로 참여함.', '', '', ''])
  await row(neis, 1).click()
  await panel.getByRole('button', { name: '이어서 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible({ timeout: 30_000 })
  expect(await texts(neis)).toEqual([
    '탐구에 적극적으로 참여함.',
    '',
    '관찰 일지를 꼼꼼히 기록함.',
    '발표를 논리적으로 함.',
  ])
  await neis.close()
})

test('refuses work that is not a 생기부 작업, and takes a pasted one', async () => {
  const neis = await openNeis()
  const { page: sender, reply } = await sendFromWebApp('{"kind":"ttokttak.pumui"}')
  expect(reply).toMatchObject({ ok: false })
  await sender.close()
  await neis.getByRole('button', { name: '똑딱', exact: true }).click()
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
  await expect(panel.getByRole('heading', { name: '아직 받은 생기부 작업이 없어요' })).toBeVisible({
    timeout: 30_000,
  })
  await panel.getByText('복사한 생기부 작업 넣기').click()
  await panel.getByLabel('생기부 작업 붙여 넣기').fill(workText)
  await expect(panel.getByRole('heading', { name: '과학 세특 · 3명' })).toBeVisible()
  await neis.close()
})

test('the first send survives login without a remembered NEIS address', async () => {
  const { page: sender, reply } = await sendFromWebApp(workText)
  expect(reply).toMatchObject({ ok: true, moved: 'unknown' })
  await sender.close()
  const neis = await context.newPage()
  await neis.goto(base + '/fake-neis.html?login=1')
  await expect(neis.getByRole('button', { name: '똑딱', exact: true })).toHaveCount(0)
  await neis.getByRole('button', { name: '로그인' }).click()
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
  await expect(panel.getByRole('heading', { name: '자동 입력 대기 중' })).toBeVisible()
  await row(neis, 0).click()
  await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible()
  expect(await texts(neis)).toEqual(expectedTexts)
  await neis.close()
})
