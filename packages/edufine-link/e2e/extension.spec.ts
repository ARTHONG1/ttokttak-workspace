import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXTENSION_ID } from '../src/ids'
import { buildPumuiPackage } from '../src/pumui-package'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(HERE, 'dist')
const TEST_DIR = join(HERE, 'dist-test')

const pkgText = JSON.stringify(
  buildPumuiPackage({
    title: '과학실 실험 도구 구입',
    summary: '1. 관련:\n2. 실험 도구를 구입하고자 합니다.',
    items: [
      { description: '비커 500ml', specification: '유리', unit: '개', quantity: 4, unitPrice: 3000, amount: 12000 },
      { description: '실험 키트', specification: '전기', unit: '세트', quantity: 2, unitPrice: 15000, amount: 30000 },
      { description: '배송비', specification: '', unit: '식', quantity: 1, unitPrice: 3000, amount: 3000 },
    ],
  }),
)

let server: Server
let base = ''
let context: BrowserContext
let sw: Worker

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const name = (req.url ?? '/').split('?')[0].replace(/^\//, '') || 'fake-edufine.html'
    try {
      const body = await readFile(join(TEST_DIR, name))
      res.writeHead(200, { 'content-type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'ttok-edufine-')), {
    channel: 'chromium',
    // EDUFINE_CHROMIUM: a local Chromium when the Playwright one is not installed
    executablePath: process.env.EDUFINE_CHROMIUM || undefined,
    args: ['--disable-extensions-except=' + DIST, '--load-extension=' + DIST],
    acceptDownloads: true,
  })
  sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
})

test.afterAll(async () => {
  await context?.close()
  server?.close()
})

async function setFill(enabled: boolean): Promise<void> {
  await sw.evaluate(async (v) => {
    const c = (globalThis as any).chrome
    const { settings } = await c.storage.local.get('settings')
    await c.storage.local.set({ settings: { fillEnabled: false, origins: [], ...(settings ?? {}), fillEnabled: v } })
  }, enabled)
}

async function openEdufine(query = ''): Promise<Page> {
  const page = await context.newPage()
  await page.goto(base + '/fake-edufine.html' + query)
  await expect(page.getByRole('button', { name: '똑딱', exact: true })).toBeVisible({ timeout: 15_000 })
  return page
}

async function pastePumui(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByRole('button', { name: '똑딱 품의 넣기' }).click()
  await page.getByLabel('품의 붙여 넣기').fill(text)
}

const writesOf = (page: Page) => page.evaluate(() => (window as any).__fake.writes.filter((w: { op: string }) => w.op !== 'call').length)

test('keeps the fixed extension id', async () => {
  expect(new URL(sw.url()).host).toBe(EXTENSION_ID)
})

test('previews only until real fill is turned on', async () => {
  await setFill(false)
  const page = await openEdufine()
  await pastePumui(page, pkgText)
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await expect(page.getByText('합계 45,000원')).toBeVisible()
  await expect(page.getByRole('button', { name: '채우기' })).toBeDisabled()
  await expect(page.getByText('지금은 미리보기 모드예요')).toBeVisible()
  expect(await writesOf(page)).toBe(0)
  await page.close()
})

test('fills title, summary and items once real fill is on, and never saves', async () => {
  await setFill(true)
  const page = await openEdufine()
  await pastePumui(page, pkgText)
  await page.getByRole('button', { name: '채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  const state = await page.evaluate(() => {
    const f = (window as any).__fake
    return {
      rows: f.dataset('dsPrdlstDtl').rows,
      title: f.form.divMain.form.edtCnsulSj.value,
      forbidden: f.forbiddenCalls(),
    }
  })
  expect(state.rows.map((r: { prdlstCn: string }) => r.prdlstCn)).toEqual(['비커 500ml', '실험 키트', '배송비'])
  expect(state.rows[1].thngUnitSeCd).toBe('017')
  expect(state.title).toBe('과학실 실험 도구 구입')
  expect(state.forbidden).toBe(0)
  await page.close()
})

test('refuses pasted text that is not a 똑딱 품의', async () => {
  const page = await openEdufine()
  await pastePumui(page, '볼펜 3개 주문합니다')
  await expect(page.getByText('똑딱작업실에서 만든 품의가 아니에요.')).toBeVisible()
  expect(await writesOf(page)).toBe(0)
  await page.close()
})

test('asks for a budget line when none is selected and writes nothing', async () => {
  await setFill(true)
  const page = await openEdufine('?budget=0')
  await pastePumui(page, pkgText)
  await page.getByRole('button', { name: '채우기' }).click()
  await expect(page.getByText('예산 내역에서 예산 줄을 먼저 골라 주세요.')).toBeVisible()
  expect(await writesOf(page)).toBe(0)
  await page.close()
})

test('reads a 품의 file', async () => {
  const page = await openEdufine()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByRole('button', { name: '똑딱 품의 넣기' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: '품의.ttokpumui', mimeType: 'application/json', buffer: Buffer.from(pkgText) })
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await page.close()
})

test('takes a 품의 the web app sent directly', async () => {
  const sender = await context.newPage()
  await sender.goto(base + '/web-sender.html')
  const reply = await sender.evaluate((t) => (window as any).sendToExtension(t), pkgText)
  expect(reply).toEqual({ ok: true })
  await sender.close()
  const page = await openEdufine()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByRole('button', { name: '똑딱 품의 넣기' }).click()
  await expect(page.getByText('웹 앱에서 보낸 품의가 기다리고 있어요.')).toBeVisible()
  await page.getByRole('button', { name: '이 품의 보기' }).click()
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await page.close()
})

test('runs the self-check and saves a diagnostic file without values', async () => {
  const page = await openEdufine()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByRole('button', { name: '연결 점검' }).click()
  await expect(page.getByRole('heading', { name: '연결 점검' })).toBeVisible()
  await expect(page.getByText('품의등록 화면 인식')).toBeVisible()
  expect(await page.getByText('✓', { exact: true }).count()).toBeGreaterThanOrEqual(5)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '진단 파일 저장' }).click()])
  const diag = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(diag.schema).toBe('ttokttak.edufine-diag')
  expect(diag.screen).toEqual({ kind: 'pumui' })
  expect(diag.unitTable.length).toBeGreaterThan(0)
  expect(diag.frames).toEqual([{ depth: 0, path: '/fake-edufine.html', nexacro: true }])
  expect(JSON.stringify(diag)).not.toContain('300000')
  await page.close()
})

test('finds K-에듀파인 inside a same-origin frame of a portal page and fills it there', async () => {
  await setFill(true)
  const page = await openEdufine('?frame=1')
  await expect.poll(() => page.frames().some((f) => f.url().includes('inner=1'))).toBe(true)
  const inner = page.frames().find((f) => f.url().includes('inner=1'))!
  await expect.poll(() => inner.evaluate(() => !!(window as any).__fake)).toBe(true)
  await pastePumui(page, pkgText)
  await page.getByRole('button', { name: '채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  const state = await inner.evaluate(() => {
    const f = (window as any).__fake
    return { items: f.dataset('dsPrdlstDtl').rows.length, title: f.form.divMain.form.edtCnsulSj.value, forbidden: f.forbiddenCalls() }
  })
  expect(state).toEqual({ items: 3, title: '과학실 실험 도구 구입', forbidden: 0 })

  await page.getByRole('button', { name: '처음으로' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '진단 파일 저장' }).click()])
  const diag = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(diag.frames).toEqual([
    { depth: 0, path: '/fake-edufine.html', nexacro: false },
    { depth: 1, path: '/fake-edufine.html', nexacro: true },
  ])
  expect(diag.screen).toEqual({ kind: 'pumui' })
  await page.close()
})

