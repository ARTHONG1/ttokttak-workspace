import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Frame } from 'playwright-core'
import { parsePumuiPackage, type PumuiPackage } from '@genoffice/ttokttak-extension/package'
import {
  neisBytes,
  NEIS_BYTE_LIMIT,
  parseRecordPackage,
  type RecordPackage,
} from '@genoffice/ttokttak-extension/record'
import { DEFAULT_SCREEN_MAP } from '@genoffice/ttokttak-extension/screen-map'
import { UNIT_ALIASES } from '@genoffice/ttokttak-extension/units'
import type { DirectFeature, DirectTransferResult } from '../shared/direct-transfer-api'
import { edufinePage, edufineProbe } from './direct-transfer-edufine'
import { fillNeis } from './direct-transfer-neis'

export type { DirectFeature, DirectTransferResult }
export type DriverResult =
  { ok: true; written: number; next: number; startedFrom?: number } | { ok: false; reason: string }
export interface DirectTransferDriver {
  send(feature: DirectFeature, payload: RecordPackage | PumuiPackage): Promise<DriverResult>
}

/** No AI, cookies, credentials or external queue cross this boundary. */
export async function directTransferRequest(
  feature: string,
  text: string,
  driver: DirectTransferDriver,
): Promise<DirectTransferResult> {
  const fail = (message: string): DirectTransferResult => ({ ok: false, route: 'direct', message })
  if (text.length > 100_000) return fail('보낼 내용이 너무 커요.')
  let payload: RecordPackage | PumuiPackage
  if (feature === 'neis-record') {
    const parsed = parseRecordPackage(text)
    if (!parsed.ok) return fail(parsed.reason)
    payload = parsed.pkg
    const names = payload.students.map((s) => s.name.replace(/\s/g, ''))
    if (names.some((n) => !n) || new Set(names).size !== names.length)
      return fail('직접 전송은 모든 학생의 이름이 필요해요. 동명이인은 한 명씩 나누어 보내 주세요.')
    // 창체 is capped by the page per school level (초등 has no cap)
    if (
      payload.mode !== 'activity' &&
      payload.students.some((s) => neisBytes(s.text) > NEIS_BYTE_LIMIT)
    )
      return fail('1,500바이트를 넘는 학생 글이 있어요. 줄인 뒤 보내 주세요.')
  } else if (feature === 'edufine-pumui') {
    const parsed = parsePumuiPackage(text)
    if (!parsed.ok) return fail(parsed.reason)
    payload = parsed.pkg
  } else return fail('지원하지 않는 직접 전송 업무예요.')
  try {
    const result = await driver.send(feature, payload)
    if (!result.ok) return fail(result.reason)
    return {
      ok: true,
      route: 'direct',
      written: result.written,
      next: result.next,
      ...(result.startedFrom !== undefined ? { startedFrom: result.startedFrom } : {}),
      message:
        feature === 'neis-record'
          ? result.startedFrom
            ? `나이스 입력 화면에 ${result.startedFrom + 1}번째 학생부터 ${result.written}명을 채웠어요. 화면을 확인한 뒤 저장하세요.`
            : `나이스 입력 화면에 ${result.written}명을 채웠어요. 화면을 확인한 뒤 저장하세요.`
          : `K-에듀파인 입력 화면에 ${result.written}개 품목을 채웠어요. 화면을 확인한 뒤 저장하세요.`,
    }
  } catch {
    return fail(
      '브라우저 연결이 끊겼거나 입력을 확인하지 못했어요. 화면에 들어간 내용을 확인한 뒤 다시 보내 주세요.',
    )
  }
}

export interface DirectTransferOptions {
  userDataDir: string
  neisUrl?: string
  edufineUrl?: string
  executablePath?: string
}

export function findDirectBrowser(explicit?: string): string | undefined {
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

export function isDirectTarget(feature: DirectFeature, address: string): boolean {
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    const isNeis = host === 'neis.go.kr' || host.endsWith('.neis.go.kr')
    return feature === 'neis-record'
      ? host !== 'open.neis.go.kr' && isNeis
      : host.endsWith('.go.kr') && !isNeis
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

const PLACES_FILE = 'ttokttak-places.json'

type Launch = (options: DirectTransferOptions) => Promise<BrowserContext>
async function launchBrowser(options: DirectTransferOptions): Promise<BrowserContext> {
  const executablePath = findDirectBrowser(options.executablePath)
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

export class PlaywrightDirectTransferDriver implements DirectTransferDriver {
  private context: BrowserContext | null = null
  private busy = false
  constructor(
    private readonly options: DirectTransferOptions,
    private readonly launch: Launch = launchBrowser,
  ) {}

  private readSavedOrigin(feature: DirectFeature): string | undefined {
    try {
      const raw = JSON.parse(readFileSync(join(this.options.userDataDir, PLACES_FILE), 'utf8'))
      const candidate = typeof raw?.[feature] === 'string' ? raw[feature] : undefined
      return candidate && isDirectTarget(feature, candidate) ? new URL(candidate).origin : undefined
    } catch {
      return undefined
    }
  }

  private rememberOrigin(feature: DirectFeature, address: string): void {
    if (!isDirectTarget(feature, address) || !existsSync(this.options.userDataDir)) return
    try {
      const file = join(this.options.userDataDir, PLACES_FILE)
      let stored: Record<string, string> = {}
      try {
        stored = JSON.parse(readFileSync(file, 'utf8')) ?? {}
      } catch {}
      stored[feature] = new URL(address).origin
      writeFileSync(file, JSON.stringify(stored), { mode: 0o600 })
    } catch {}
  }

  async send(feature: DirectFeature, payload: RecordPackage | PumuiPackage): Promise<DriverResult> {
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

      if (feature === 'edufine-pumui') {
        const appFrames: { frame: Frame; url: string; state: 'other-screen' | 'pumui' }[] = []
        for (const page of this.context.pages()) {
          for (const frame of page.frames()) {
            const url = effectiveFrameUrl(frame)
            if (!isDirectTarget('edufine-pumui', url)) continue
            const probe = await frame
              .evaluate(edufineProbe, { map: DEFAULT_SCREEN_MAP, tryOpenMenu: false })
              .catch(() => ({ state: 'no-app' as const }))
            if (probe.state !== 'no-app') {
              appFrames.push({ frame, url, state: probe.state })
            }
          }
        }
        if (appFrames.length > 1) {
          return {
            ok: false,
            reason:
              '입력 가능한 업무 화면이 여러 개예요. 보낼 화면 하나만 남긴 뒤 다시 보내 주세요.',
          }
        }
        if (appFrames.length === 1) {
          const target = appFrames[0]
          this.rememberOrigin('edufine-pumui', target.url)
          await target.frame.page().bringToFront()
          if (target.state === 'other-screen') {
            await target.frame
              .evaluate(edufineProbe, { map: DEFAULT_SCREEN_MAP, tryOpenMenu: true })
              .catch(() => undefined)
            const deadline = Date.now() + 5_000
            let onPumui = false
            while (Date.now() < deadline) {
              const next = await target.frame
                .evaluate(edufineProbe, { map: DEFAULT_SCREEN_MAP, tryOpenMenu: false })
                .catch(() => ({ state: 'no-app' as const }))
              if (next.state === 'pumui') {
                onPumui = true
                break
              }
              await target.frame.page().waitForTimeout(150)
            }
            if (!onPumui) {
              return { ok: false, reason: 'K-에듀파인 품의등록 화면을 열어 주세요.' }
            }
          }
          return await target.frame.evaluate(edufinePage, {
            map: DEFAULT_SCREEN_MAP,
            pkg: payload as PumuiPackage,
            unitAliases: UNIT_ALIASES,
          })
        }
        const url = this.options.edufineUrl || this.readSavedOrigin('edufine-pumui')
        let page = this.context.pages().find((p) => isDirectTarget('edufine-pumui', p.url()))
        if (!page) {
          page = this.context.pages()[0] ?? (await this.context.newPage())
          if (url && page.url() === 'about:blank') {
            await page.goto(url, { timeout: 20_000, waitUntil: 'domcontentloaded' })
          }
        }
        await page.bringToFront()
        return {
          ok: false,
          reason:
            '전용 브라우저에서 소속 교육청 업무포털에 로그인하고 K-에듀파인 품의등록 화면과 예산을 선택한 뒤, 앱에서 다시 보내 주세요.',
        }
      }

      const candidates: Frame[] = []
      for (const page of this.context.pages()) {
        for (const frame of page.frames()) {
          const url = effectiveFrameUrl(frame)
          if (!isDirectTarget('neis-record', url)) continue
          this.rememberOrigin('neis-record', url)
          const ready = (await frame.locator('.cl-grid-row.cl-selected:visible').count()) > 0
          if (ready) candidates.push(frame)
        }
      }
      if (candidates.length > 1)
        return {
          ok: false,
          reason: '입력 가능한 업무 화면이 여러 개예요. 보낼 화면 하나만 남긴 뒤 다시 보내 주세요.',
        }
      if (!candidates.length) {
        const url =
          this.options.neisUrl || this.readSavedOrigin('neis-record') || 'https://www.neis.go.kr'
        let page = this.context.pages().find((p) => isDirectTarget('neis-record', p.url()))
        if (!page) {
          page = this.context.pages()[0] ?? (await this.context.newPage())
          if (page.url() === 'about:blank')
            await page.goto(url, {
              timeout: 20_000,
              waitUntil: 'domcontentloaded',
            })
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
      return await fillNeis(frame, payload as RecordPackage)
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

export function createDirectTransferDriver(userDataDir: string): PlaywrightDirectTransferDriver {
  return new PlaywrightDirectTransferDriver({
    userDataDir: join(userDataDir, 'direct-transfer-browser'),
    neisUrl: process.env.TTOKTTAK_NEIS_URL,
    edufineUrl: process.env.TTOKTTAK_EDUFINE_URL,
  })
}
