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
 * the NEIS page, work sent from the web app shown there, and one press typing each
 * student's text into that student's row. It never presses NEIS's save.
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

test('a send brings NEIS forward with the class shown, and one press fills each row', async () => {
  const neis = await openNeis()
  const { page: sender, reply } = await sendFromWebApp(workText)
  expect(reply).toMatchObject({ ok: true, moved: 'focused' })
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
  await expect(panel.getByRole('heading', { name: '과학 세특 · 3명' })).toBeVisible()
  await expect(panel.getByText('글이 없는 1명의 줄은 건너뛰어요')).toBeVisible()
  // nothing is typed before the press
  expect(await texts(neis)).toEqual(['', '', '', ''])

  await row(neis, 0).click()
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByText('3명의 교과 세특을 나이스 표에 넣었어요')).toBeVisible()
  expect(await texts(neis)).toEqual([
    '탐구에 적극적으로 참여함.',
    '',
    '관찰 일지를 꼼꼼히 기록함.',
    '발표를 논리적으로 함.',
  ])
  // saving stays with the teacher
  expect(await neis.evaluate(() => (window as any).__saved ?? 0)).toBe(0)
  // done work does not come back
  await neis.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(panel.getByRole('heading', { name: '과학 세특 · 3명' })).toHaveCount(0)
  await sender.close()
  await neis.close()
})

test('it asks for a row first, and stops before writing into another student’s row', async () => {
  const neis = await openNeis()
  const { page: sender } = await sendFromWebApp(workText)
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '학생 줄을 먼저 눌러 주세요' })).toBeVisible()

  // the second student's row, while the class starts with the first
  await row(neis, 1).click()
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '넣지 않고 멈췄어요' })).toBeVisible()
  expect(await texts(neis)).toEqual(['', '', '', ''])

  // the right row: it goes on from there
  await row(neis, 0).click()
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible({ timeout: 30_000 })
  expect((await texts(neis))[3]).toBe('발표를 논리적으로 함.')
  await sender.close()
  await neis.close()
})

test('when the grid does not move on it stops, and goes on from the next student', async () => {
  const neis = await openNeis('?stuck=0')
  const { page: sender } = await sendFromWebApp(workText)
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
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
  await sender.close()
  await neis.close()
})

test('a text already in the cell is written after by default for 세특, or replaced', async () => {
  const neis = await openNeis('?filled=1')
  const { page: sender } = await sendFromWebApp(workText)
  const panel = neis.getByRole('dialog', { name: '똑딱작업실' })
  await panel.getByLabel('새 글로 바꾸기').check()
  await row(neis, 0).click()
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible({ timeout: 30_000 })
  expect((await texts(neis))[0]).toBe('탐구에 적극적으로 참여함.')
  await sender.close()
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

test('before NEIS was ever opened, a send waits for the 똑딱 button', async () => {
  const { page: sender, reply } = await sendFromWebApp(workText)
  expect(reply).toMatchObject({ ok: true, moved: 'unknown' })
  await sender.close()
  const neis = await openNeis()
  await neis.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(
    neis
      .getByRole('dialog', { name: '똑딱작업실' })
      .getByRole('heading', { name: '과학 세특 · 3명' }),
  ).toBeVisible()
  await neis.close()
})
