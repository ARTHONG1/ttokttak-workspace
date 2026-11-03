import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeHostManifest } from '../../cli/src/edufine-register'
import { startControlServer, type ControlServer } from '../../../apps/shell/src/main/control-server'
import { NATIVE_HOST_NAME } from '../src/ids'
import { buildPumuiPackage } from '../src/pumui-package'

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
    items: [{ description: '배구공', specification: '5호', unit: '개', quantity: 10, unitPrice: 20000, amount: 200000 }],
  }),
)

let server: Server
let base = ''
let context: BrowserContext
let sw: Worker
let app: ControlServer | null = null
let waiting: string | null = null
const userData = mkdtempSync(join(tmpdir(), 'ttok-appdata-'))
const regKeys = WIN
  ? ['HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\', 'HKCU\\Software\\Chromium\\NativeMessagingHosts\\'].map((k) => k + NATIVE_HOST_NAME)
  : []

async function startApp(): Promise<void> {
  app = await startControlServer(userData, async (req) =>
    req.cmd === 'pumui-take'
      ? { ok: true, result: { text: waiting } }
      : { ok: false, error: { reason: 'unsupported', message: 'x' } },
  )
}

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

  const profile = mkdtempSync(join(tmpdir(), 'ttok-edufine-native-'))
  const hostDir = mkdtempSync(join(tmpdir(), 'ttok-host-'))
  const script = join(TEST_DIR, 'native-host.cjs')
  const launcher = join(hostDir, WIN ? 'host.bat' : 'host.sh')
  writeFileSync(
    launcher,
    WIN ? '@echo off\r\n"' + process.execPath + '" "' + script + '" %*\r\n' : '#!/bin/sh\nexec "' + process.execPath + '" "' + script + '" "$@"\n',
  )
  if (!WIN) chmodSync(launcher, 0o755)
  const manifest = JSON.stringify(nativeHostManifest(launcher))
  if (WIN) {
    const file = join(hostDir, NATIVE_HOST_NAME + '.json')
    writeFileSync(file, manifest)
    for (const key of regKeys) execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', file, '/f'], { stdio: 'ignore' })
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
  sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  await sw.evaluate(async () => {
    const c = (globalThis as any).chrome
    await c.storage.local.set({ settings: { fillEnabled: true, origins: [] } })
  })
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
  await page.getByRole('button', { name: '똑딱 품의 넣기' }).click()
  await page.getByRole('button', { name: '똑딱작업실에서 받기' }).click()
  return page
}

test('tells the teacher to start 똑딱작업실 when it is not running', async () => {
  const page = await takeFromDesktop()
  await expect(page.getByText('똑딱작업실을 켠 뒤 다시 눌러 주세요.')).toBeVisible({ timeout: 20_000 })
  await page.close()
})

test('takes the waiting 품의 from the running app and fills the screen', async () => {
  await startApp()
  waiting = pkgText
  const page = await takeFromDesktop()
  await expect(page.getByRole('heading', { name: '체육관 공 구입 품의' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '채우기' }).click()
  await expect(page.getByText('품목 1줄과 제목·개요를 채웠어요')).toBeVisible()
  const rows = await page.evaluate(() => (window as any).__fake.dataset('dsPrdlstDtl').rows)
  expect(rows[0]).toMatchObject({ prdlstCn: '배구공', qty: 10, expectUntpc: 20000 })
  await page.close()
})

test('the self-check shows the app connection', async () => {
  const page = await context.newPage()
  await page.goto(base + '/fake-edufine.html')
  await page.getByRole('button', { name: '똑딱', exact: true }).click()
  await page.getByRole('button', { name: '연결 점검' }).click()
  const row = page.locator('tr', { hasText: '똑딱작업실 프로그램 연결' })
  await expect(row).toContainText('✓', { timeout: 20_000 })
  await page.close()
})

