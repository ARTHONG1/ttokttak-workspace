import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeHostManifest } from '../../cli/src/edufine-register'
import { startControlServer, type ControlServer } from '../../../apps/shell/src/main/control-server'
import { NATIVE_HOST_NAME } from '../src/core/ids'
import { buildPumuiPackage } from '../src/features/edufine-pumui/package'
import { buildRecordPackage } from '../src/features/neis-record/package'

// The desktop route end to end in a real Chromium: the extension asks for a 품의 over
// native messaging, Chromium starts the host, the host asks a running "app" (a control
// server with the app's protocol) and the page shows the preview.
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(HERE, 'dist')
const TEST_DIR = join(HERE, 'dist-test')
const WIN = process.platform === 'win32'

const pkgText = JSON.stringify(
  buildPumuiPackage({
    title: '체육관 공 구입 품의',
    summary: '1. 관련:\n2. 공을 구입하고자 합니다.',
    items: [
      {
        description: '배구공',
        specification: '5호',
        unit: '개',
        quantity: 10,
        unitPrice: 20000,
        amount: 200000,
      },
    ],
  }),
)

let server: Server
let base = ''
let context: BrowserContext
let app: ControlServer | null = null
let waiting: string | null = null
/** the app's queue of the 생기부 task (neis-record) */
let waitingRecord: string | null = null
const userData = mkdtempSync(join(tmpdir(), 'ttok-appdata-'))
const regKeys = WIN
  ? [
      'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\',
      'HKCU\\Software\\Chromium\\NativeMessagingHosts\\',
    ].map((k) => k + NATIVE_HOST_NAME)
  : []

async function startApp(): Promise<void> {
  app = await startControlServer(userData, async (req) => {
    if (req.cmd === 'work-take' && req.feature === 'neis-record') {
      const text = waitingRecord
      waitingRecord = null
      return { ok: true, result: { text } }
    }
    if (req.cmd !== 'work-take' || req.feature !== 'edufine-pumui')
      return { ok: false, error: { reason: 'unsupported', message: 'x' } }
    // like the app's queue: a 품의 is handed over once
    const text = waiting
    waiting = null
    return { ok: true, result: { text } }
  })
}

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

  const profile = mkdtempSync(join(tmpdir(), 'ttok-edufine-native-'))
  const hostDir = mkdtempSync(join(tmpdir(), 'ttok-host-'))
  const script = join(TEST_DIR, 'native-host.cjs')
  const launcher = join(hostDir, WIN ? 'host.bat' : 'host.sh')
  writeFileSync(
    launcher,
    WIN
      ? '@echo off\r\n"' + process.execPath + '" "' + script + '" %*\r\n'
      : '#!/bin/sh\nexec "' + process.execPath + '" "' + script + '" "$@"\n',
  )
  if (!WIN) chmodSync(launcher, 0o755)
  const manifest = JSON.stringify(nativeHostManifest(launcher))
  if (WIN) {
    const file = join(hostDir, NATIVE_HOST_NAME + '.json')
    writeFileSync(file, manifest)
    for (const key of regKeys)
      execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', file, '/f'], {
        stdio: 'ignore',
      })
  } else {
    mkdirSync(join(profile, 'NativeMessagingHosts'), { recursive: true })
    writeFileSync(join(profile, 'NativeMessagingHosts', NATIVE_HOST_NAME + '.json'), manifest)
  }
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath: process.env.EDUFINE_CHROMIUM || undefined,
    args: ['--disable-extensions-except=' + DIST, '--load-extension=' + DIST],
    env: { ...process.env, GENOFFICE_USER_DATA: userData } as Record<string, string>,
  })
  // the extension is ready once its background worker runs
  if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker')
})

test.afterAll(async () => {
  await context?.close()
  server?.close()
  app?.close()
  for (const key of regKeys) {
    try {
      execFileSync('reg', ['delete', key, '/f'], { stdio: 'ignore' })
    } catch {
      /* not there */
    }
  }
})

async function takeFromDesktop(): Promise<import('@playwright/test').Page> {
  const page = await context.newPage()
  await page.goto(base + '/fake-edufine.html')
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  return page
}

test('tells the teacher to start 똑딱작업실 when it is not running', async () => {
  const page = await takeFromDesktop()
  await expect(page.getByText('똑딱작업실이 켜져 있어야 가져올 수 있어요')).toBeVisible({
    timeout: 20_000,
  })
  await page.close()
})

test('takes the waiting 품의 from the running app and fills the screen', async () => {
  await startApp()
  waiting = pkgText
  const page = await takeFromDesktop()
  await expect(page.getByRole('heading', { name: '체육관 공 구입 품의' })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 1줄과 제목·개요를 채웠어요')).toBeVisible()
  const rows = await page.evaluate(() => (window as any).__fake.dataset('dsPrdlstDtl').rows)
  expect(rows[0]).toMatchObject({ prdlstCn: '배구공', qty: 10, expectUntpc: 20000 })
  await page.close()
})

test('a 품의 taken from the app is still there after a look and [취소]', async () => {
  waiting = pkgText
  const page = await takeFromDesktop()
  await expect(page.getByRole('heading', { name: '체육관 공 구입 품의' })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: '취소' }).click()
  expect(waiting).toBeNull()
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await expect(page.getByRole('heading', { name: '체육관 공 구입 품의' })).toBeVisible()
  await page.getByRole('button', { name: 'K-에듀파인에 채우기' }).click()
  await expect(page.getByText('품목 1줄과 제목·개요를 채웠어요')).toBeVisible()
  await page.close()
})

test('the self-check shows the app connection', async () => {
  const page = await context.newPage()
  await page.goto(base + '/fake-edufine.html')
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByText('문제가 있을 때').click()
  await page.getByRole('button', { name: '연결 점검' }).click()
  const row = page.locator('tr', { hasText: '똑딱작업실 프로그램 연결' })
  await expect(row).toContainText('✓', { timeout: 20_000 })
  await page.close()
})

test('takes the 생기부 class from the running app and types it into the NEIS grid', async () => {
  waitingRecord = JSON.stringify(
    buildRecordPackage({
      mode: 'behavior',
      title: '행발 · 2명',
      students: [
        { name: '김하늘', text: '배려심이 깊고 책임감이 강함.' },
        { name: '이바다', text: '모둠 활동에서 의견을 차분히 정리함.' },
      ],
    }),
  )
  // a 품의 waiting in the app stays in its own queue
  waiting = pkgText
  const page = await context.newPage()
  await page.goto(base + '/fake-neis.html')
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '똑딱작업실' })
  await expect(panel.getByRole('heading', { name: '행발 · 2명' })).toBeVisible({ timeout: 20_000 })
  expect(waitingRecord).toBeNull()
  expect(waiting).toBe(pkgText)
  await page.locator('.cl-grid-row').first().click()
  await panel.getByRole('button', { name: '나이스에 채우기' }).click()
  await expect(panel.getByRole('heading', { name: '채웠어요' })).toBeVisible({ timeout: 30_000 })
  expect(await page.evaluate(() => (window as any).__neis.texts())).toEqual([
    '배려심이 깊고 책임감이 강함.',
    '모둠 활동에서 의견을 차분히 정리함.',
    '',
    '',
  ])
  waiting = null
  await page.close()
})
