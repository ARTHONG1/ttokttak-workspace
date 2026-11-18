/**
 * 나이스로 보내기 without an extension: the app opens its own Chrome or Edge window (a
 * dedicated profile under the app's user-data folder), the teacher signs in there and selects
 * the first student's row, and fillNeis types the texts and reads them back. No AI, cookies,
 * credentials or external queue cross this boundary; saving in NEIS stays with the teacher.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Frame } from 'playwright-core'
import type { NeisResult } from '../shared/api'
import {
  NEIS_BYTE_LIMIT,
  neisBytes,
  parseRecordPackage,
  type RecordPackage,
} from '../shared/record-package'
import { fillNeis } from './neis-fill'

export type DriverResult =
  { ok: true; written: number; next: number; startedFrom?: number } | { ok: false; reason: string }
export interface NeisDriver {
  send(payload: RecordPackage): Promise<DriverResult>
}

/** the page's text checked as a 생기부 꾸러미, then filled by the driver */
export async function neisRequest(text: string, driver: NeisDriver): Promise<NeisResult> {
  const fail = (message: string): NeisResult => ({ ok: false, route: 'direct', message })
  if (text.length > 100_000) return fail('보낼 내용이 너무 커요.')
  const parsed = parseRecordPackage(text)
  if (!parsed.ok) return fail(parsed.reason)
  const payload = parsed.pkg
  const names = payload.students.map((s) => s.name.replace(/\s/g, ''))
  if (names.some((n) => !n) || new Set(names).size !== names.length)
    return fail(
      '나이스로 보내려면 모든 학생의 이름이 필요해요. 동명이인은 한 명씩 나누어 보내 주세요.',
    )
  if (payload.students.some((s) => neisBytes(s.text) > NEIS_BYTE_LIMIT))
    return fail('1,500바이트를 넘는 학생 글이 있어요. 줄인 뒤 보내 주세요.')
  try {
    const result = await driver.send(payload)
    if (!result.ok) return fail(result.reason)
    return {
      ok: true,
      route: 'direct',
      written: result.written,
      next: result.next,
      message: result.startedFrom
        ? `나이스 입력 화면에 ${result.startedFrom + 1}번째 학생부터 ${result.written}명을 채웠어요. 화면을 확인한 뒤 저장하세요.`
        : `나이스 입력 화면에 ${result.written}명을 채웠어요. 화면을 확인한 뒤 저장하세요.`,
    }
  } catch {
    return fail(
      '브라우저 연결이 끊겼거나 입력을 확인하지 못했어요. 화면에 들어간 내용을 확인한 뒤 다시 보내 주세요.',
    )
  }
}

export interface NeisDriverOptions {
  userDataDir: string
  neisUrl?: string
  executablePath?: string
}

export function findBrowser(explicit?: string): string | undefined {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ...[process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]
      .filter((p): p is string => Boolean(p))
      .flatMap((p) => [
        join(p, 'Google/Chrome/Application/chrome.exe'),
        join(p, 'Microsoft/Edge/Application/msedge.exe'),
      ]),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium',
  ]
  return candidates.find((p): p is string => typeof p === 'string' && existsSync(p))
}

/** an HTTPS NEIS work host (not the open-data one): the only place texts are typed into */
export function isNeisTarget(address: string): boolean {
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    return host !== 'open.neis.go.kr' && (host === 'neis.go.kr' || host.endsWith('.neis.go.kr'))
  } catch {
    return false
  }
}

function effectiveFrameUrl(frame: Frame): string {
  let cur: Frame | null = frame
  while (cur && (!cur.url() || cur.url() === 'about:blank')) {
    cur = cur.parentFrame()
  }
  return cur?.url() ?? frame.url()
}

const PLACES_FILE = 'neis-place.json'

type Launch = (options: NeisDriverOptions) => Promise<BrowserContext>
async function launchBrowser(options: NeisDriverOptions): Promise<BrowserContext> {
  const executablePath = findBrowser(options.executablePath)
  if (!executablePath) throw new Error('Chrome 또는 Edge를 설치한 뒤 다시 보내 주세요.')
  mkdirSync(options.userDataDir, { recursive: true, mode: 0o700 })
  const { chromium } = await import('playwright-core')
  return chromium.launchPersistentContext(options.userDataDir, {
    executablePath,
    headless: false,
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  })
}

export class PlaywrightNeisDriver implements NeisDriver {
  private context: BrowserContext | null = null
  private busy = false
  constructor(
    private readonly options: NeisDriverOptions,
    private readonly launch: Launch = launchBrowser,
  ) {}

  /** the NEIS origin the teacher used last time (no path or query: no tokens kept) */
  private readSavedOrigin(): string | undefined {
    try {
      const raw = JSON.parse(readFileSync(join(this.options.userDataDir, PLACES_FILE), 'utf8'))
      const candidate = typeof raw?.neis === 'string' ? raw.neis : undefined
      return candidate && isNeisTarget(candidate) ? new URL(candidate).origin : undefined
    } catch {
      return undefined
    }
  }

  private rememberOrigin(address: string): void {
    if (!isNeisTarget(address) || !existsSync(this.options.userDataDir)) return
    try {
      writeFileSync(
        join(this.options.userDataDir, PLACES_FILE),
        JSON.stringify({ neis: new URL(address).origin }),
        { mode: 0o600 },
      )
    } catch {}
  }

  async send(payload: RecordPackage): Promise<DriverResult> {
    if (this.busy)
      return { ok: false, reason: '다른 입력이 진행 중이에요. 끝난 뒤 다시 보내 주세요.' }
    this.busy = true
    try {
      if (!this.context) {
        try {
          this.context = await this.launch(this.options)
        } catch (err) {
          const msg = String((err as Error)?.message ?? err)
          if (/SingletonLock|ProcessSingleton|profile.*in use|already in use/i.test(msg)) {
            return {
              ok: false,
              reason:
                '이미 열려 있는 전송용 브라우저 창이 프로필을 사용 중이에요. 열려 있는 전송용 Chrome 또는 Edge 창을 닫은 뒤 다시 보내 주세요.',
            }
          }
          return {
            ok: false,
            reason:
              '전용 브라우저를 열지 못했어요. Chrome 또는 Edge 설치와 열려 있는 전송용 창을 확인해 주세요.',
          }
        }
        const context = this.context
        context.on('close', () => {
          if (this.context === context) this.context = null
        })
        context.setDefaultTimeout(3_000)
      }

      const candidates: Frame[] = []
      for (const page of this.context.pages()) {
        for (const frame of page.frames()) {
          const url = effectiveFrameUrl(frame)
          if (!isNeisTarget(url)) continue
          this.rememberOrigin(url)
          const ready = (await frame.locator('.cl-grid-row.cl-selected:visible').count()) > 0
          if (ready) candidates.push(frame)
        }
      }
      if (candidates.length > 1)
        return {
          ok: false,
          reason:
            '입력 가능한 나이스 화면이 여러 개예요. 보낼 화면 하나만 남긴 뒤 다시 보내 주세요.',
        }
      if (!candidates.length) {
        const url = this.options.neisUrl || this.readSavedOrigin() || 'https://www.neis.go.kr'
        let page = this.context.pages().find((p) => isNeisTarget(p.url()))
        if (!page) {
          page = this.context.pages()[0] ?? (await this.context.newPage())
          if (page.url() === 'about:blank')
            await page.goto(url, { timeout: 20_000, waitUntil: 'domcontentloaded' })
        }
        await page.bringToFront()
        return {
          ok: false,
          reason:
            '전용 브라우저에서 업무포털에 로그인하고 나이스 입력 화면의 첫 학생 줄을 선택한 뒤, 앱에서 다시 보내 주세요.',
        }
      }
      const frame = candidates[0]
      await frame.page().bringToFront()
      return await fillNeis(frame, payload)
    } finally {
      this.busy = false
    }
  }

  async close(): Promise<void> {
    const context = this.context
    this.context = null
    await context?.close()
  }
}

export function createNeisDriver(userDataDir: string): PlaywrightNeisDriver {
  return new PlaywrightNeisDriver({
    userDataDir: join(userDataDir, 'neis-browser'),
    ...(process.env.SAENGGIBU_NEIS_URL ? { neisUrl: process.env.SAENGGIBU_NEIS_URL } : {}),
  })
}
