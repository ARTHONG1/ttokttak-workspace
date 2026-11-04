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
import { EXTENSION_ID } from '../src/core/ids'
import { buildPumuiPackage } from '../src/features/edufine-pumui/package'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(HERE, 'dist')
const TEST_DIR = join(HERE, 'dist-test')

const pkgText = JSON.stringify(
  buildPumuiPackage({
    title: '과학실 실험 도구 구입',
    summary: '1. 관련:\n2. 실험 도구를 구입하고자 합니다.',
    items: [
      {
        description: '비커 500ml',
        specification: '유리',
        unit: '개',
        quantity: 4,
        unitPrice: 3000,
        amount: 12000,
      },
      {
        description: '실험 키트',
        specification: '전기',
        unit: '세트',
        quantity: 2,
        unitPrice: 15000,
        amount: 30000,
      },
      {
        description: '배송비',
        specification: '',
        unit: '식',
        quantity: 1,
        unitPrice: 3000,
        amount: 3000,
      },
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

// a 품의 the web app handed over stays until it is filled; each test starts without one
test.beforeEach(async () => {
  await sw.evaluate(async () => {
    await (globalThis as any).chrome.storage.local.remove(['pending', 'autoOpenUntil'])
  })
})

async function openEdufine(query = ''): Promise<Page> {
  const page = await context.newPage()
  await page.goto(base + '/fake-edufine.html' + query)
  await expect(page.getByRole('button', { name: '똑딱', exact: true })).toBeVisible({
    timeout: 15_000,
  })
  return page
}

async function pastePumui(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 받은 품의가 없어요' })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByText('복사했거나 파일로 받은 품의 넣기').click()
  await page.getByLabel('품의 붙여 넣기').fill(text)
}

const writesOf = (page: Page) =>
  page.evaluate(
    () => (window as any).__fake.writes.filter((w: { op: string }) => w.op !== 'call').length,
  )

test('keeps the fixed extension id', async () => {
  expect(new URL(sw.url()).host).toBe(EXTENSION_ID)
})

test('needs no setting: the 똑딱 button appears on K-에듀파인 and nowhere else', async () => {
  const page = await openEdufine()
  await page.close()
  const other = await context.newPage()
  await other.goto(base + '/web-sender.html')
  await other.waitForTimeout(3_000)
  await expect(other.getByRole('button', { name: '똑딱', exact: true })).toHaveCount(0)
  await other.close()
})

test('shows the 품의 first and writes nothing until 채우기 is pressed', async () => {
  const page = await openEdufine()
  await pastePumui(page, pkgText)
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await expect(page.getByText('합계 45,000원')).toBeVisible()
  await expect(page.getByRole('button', { name: 'K-에듀파인에 채우기' })).toBeEnabled()
  expect(await writesOf(page)).toBe(0)
  await page.close()
})

test('fills title, summary and items with one press, and never saves', async () => {
  const page = await openEdufine()
  await pastePumui(page, pkgText)
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  const state = await page.evaluate(() => {
    const f = (window as any).__fake
    return {
      rows: f.dataset('dsPrdlstDtl').rows,
      title: f.form.divMain.form.edtCnsulSj.value,
      forbidden: f.forbiddenCalls(),
    }
  })
  expect(state.rows.map((r: { prdlstCn: string }) => r.prdlstCn)).toEqual([
    '비커 500ml',
    '실험 키트',
    '배송비',
  ])
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

test('without a budget line it waits, then fills by itself once one is picked', async () => {
  const page = await openEdufine('?budget=0')
  await pastePumui(page, pkgText)
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByRole('heading', { name: '예산 줄을 골라 주세요' })).toBeVisible()
  expect(await writesOf(page)).toBe(0)
  // the teacher picks a budget line on the K-에듀파인 screen; no further press
  await page.evaluate(() => (window as any).__fake.selectBudget())
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible({ timeout: 5_000 })
  expect(await page.evaluate(() => (window as any).__fake.forbiddenCalls())).toBe(0)
  await page.close()
})

test('pressing 똑딱 while the panel is open looks again instead of closing it', async () => {
  const page = await openEdufine()
  await pastePumui(page, pkgText)
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '똑딱 에듀파인 연결' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '아직 받은 품의가 없어요' })).toBeVisible({
    timeout: 20_000,
  })
  await page.close()
})

test('reads a 품의 file', async () => {
  const page = await openEdufine()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByText('복사했거나 파일로 받은 품의 넣기').click()
  await page.locator('input[type=file]').setInputFiles({
    name: '품의.ttokpumui',
    mimeType: 'application/json',
    buffer: Buffer.from(pkgText),
  })
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await page.close()
})

const sendFromWebApp = async (): Promise<{ ok?: boolean; moved?: string }> => {
  const sender = await context.newPage()
  await sender.goto(base + '/web-sender.html')
  const reply = await sender.evaluate((t) => (window as any).sendToExtension(t), pkgText)
  await sender.close()
  return reply as { ok?: boolean; moved?: string }
}

const forgetEdufine = () =>
  sw.evaluate(async () => {
    await (globalThis as any).chrome.storage.local.remove('edufinePlace')
  })

test('before K-에듀파인 was ever opened, a send waits for the 똑딱 button', async () => {
  await forgetEdufine()
  expect(await sendFromWebApp()).toEqual({ ok: true, moved: 'unknown' })
  const page = await openEdufine()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  // filled once: the next press does not offer the same 품의 again
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 받은 품의가 없어요' })).toBeVisible({
    timeout: 20_000,
  })
  await page.close()
})

test('a send brings the open K-에듀파인 tab forward with the 품의 already shown', async () => {
  const page = await openEdufine()
  expect(await sendFromWebApp()).toEqual({ ok: true, moved: 'focused' })
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  expect(await page.evaluate(() => document.visibilityState)).toBe('visible')
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  await page.close()
})

test('with no K-에듀파인 tab open, a send opens the remembered one and shows the 품의 when ready', async () => {
  for (const p of context.pages()) if (p.url().includes('fake-edufine')) await p.close()
  const opened = context.waitForEvent('page', (p) => p.url().includes('fake-edufine'))
  expect(await sendFromWebApp()).toEqual({ ok: true, moved: 'opened' })
  const page = await opened
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  await page.close()
})

test("the desktop app's /edufine/go page brings K-에듀파인 forward and closes itself", async () => {
  const page = await openEdufine()
  const go = await context.newPage()
  const closed = go.waitForEvent('close')
  // the extension closes the page as soon as it moved, often before it finished loading
  await go.goto(base + '/edufine/go.html').catch(() => undefined)
  await closed
  // no 똑딱작업실 in this test: the panel opens and says there is nothing yet
  await expect(page.getByRole('heading', { name: '아직 받은 품의가 없어요' })).toBeVisible({
    timeout: 20_000,
  })
  await page.close()
})

test('the /edufine/go page says what to do while K-에듀파인 is unknown', async () => {
  await forgetEdufine()
  const go = await context.newPage()
  await go.goto(base + '/edufine/go.html')
  await expect(go.getByRole('heading', { name: 'K-에듀파인을 한 번 열어 주세요' })).toBeVisible()
  await go.close()
})

test('from another K-에듀파인 screen, 똑딱 opens 품의등록 by itself and shows the 품의', async () => {
  const page = await openEdufine('?screen=other')
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByText('복사했거나 파일로 받은 품의 넣기').click()
  await page.getByLabel('품의 붙여 넣기').fill(pkgText)
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible()
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  const opened = await page.evaluate(() =>
    (window as any).__fake.writes
      .filter((w: { op: string }) => w.op === 'openMenu')
      .map((w: { target: string }) => w.target),
  )
  expect(opened).toEqual(['A00FAA0104001001'])
  await page.close()
})

test('a send from the web app lands on 품의등록 even when another screen was in front', async () => {
  for (const p of context.pages()) if (p.url().includes('fake-edufine')) await p.close()
  const page = await openEdufine('?screen=other')
  expect(await sendFromWebApp()).toEqual({ ok: true, moved: 'focused' })
  await expect(page.getByRole('heading', { name: '과학실 실험 도구 구입' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  await page.close()
})

test('runs the self-check and saves a diagnostic file without values', async () => {
  const page = await openEdufine()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByText('문제가 있을 때').click()
  await page.getByRole('button', { name: '연결 점검' }).click()
  await expect(page.getByRole('heading', { name: '연결 점검' })).toBeVisible()
  await expect(page.getByText('품의등록 화면 인식')).toBeVisible()
  expect(await page.getByText('✓', { exact: true }).count()).toBeGreaterThanOrEqual(5)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '진단 파일 저장' }).click(),
  ])
  const diag = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(diag.schema).toBe('ttokttak.edufine-diag')
  expect(diag.screen).toEqual({ kind: 'pumui' })
  expect(diag.unitTable.length).toBeGreaterThan(0)
  expect(diag.frames).toEqual([{ depth: 0, path: '/fake-edufine.html', nexacro: true }])
  expect(JSON.stringify(diag)).not.toContain('300000')
  await page.close()
})

test('finds K-에듀파인 inside a same-origin frame of a portal page and fills it there', async () => {
  const page = await openEdufine('?frame=1')
  await expect.poll(() => page.frames().some((f) => f.url().includes('inner=1'))).toBe(true)
  const inner = page.frames().find((f) => f.url().includes('inner=1'))!
  await expect.poll(() => inner.evaluate(() => !!(window as any).__fake)).toBe(true)
  await pastePumui(page, pkgText)
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 3줄과 제목·개요를 채웠어요')).toBeVisible()
  const state = await inner.evaluate(() => {
    const f = (window as any).__fake
    return {
      items: f.dataset('dsPrdlstDtl').rows.length,
      title: f.form.divMain.form.edtCnsulSj.value,
      forbidden: f.forbiddenCalls(),
    }
  })
  expect(state).toEqual({ items: 3, title: '과학실 실험 도구 구입', forbidden: 0 })

  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByText('문제가 있을 때').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '진단 파일 저장' }).click(),
  ])
  const diag = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(diag.frames).toEqual([
    { depth: 0, path: '/fake-edufine.html', nexacro: false },
    { depth: 1, path: '/fake-edufine.html', nexacro: true },
  ])
  expect(diag.screen).toEqual({ kind: 'pumui' })
  await page.close()
})
