/**
 * 나이스로 보내기 without an extension: the app opens its own Chrome or Edge window (a
 * dedicated profile under the app's user-data folder), the teacher signs in there and selects
 * the first student's row, and fillNeis types the texts and reads them back. No AI, cookies,
 * credentials or external queue cross this boundary; saving in NEIS stays with the teacher.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Frame, Page } from 'playwright-core'
import type { NeisResult, NeisStage } from '../shared/api'
import { classResult, readClassInPage, type NeisClassResult } from '../shared/neis-class'
import {
  NEIS_BYTE_LIMIT,
  neisBytes,
  parseRecordPackage,
  type RecordPackage,
} from '../shared/record-package'
import { fillNeis, pinNeis, probeNeis } from './neis-fill'

export type DriverResult =
  { ok: true; written: number; next: number; startedFrom?: number } | { ok: false; reason: string }
export interface NeisDriver {
  send(payload: RecordPackage, options?: NeisSendOptions): Promise<DriverResult>
}

interface NeisSendOptions {
  signal?: AbortSignal
  onStage?: (stage: NeisStage, hint?: string) => void
}

/** the page's text checked as a 생기부 꾸러미, then filled by the driver */
export async function neisRequest(
  text: string,
  driver: NeisDriver,
  options?: NeisSendOptions,
): Promise<NeisResult> {
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
  // 창체 is capped by the page per school level (초등 has no cap)
  if (
    payload.mode !== 'activity' &&
    payload.students.some((s) => neisBytes(s.text) > NEIS_BYTE_LIMIT)
  )
    return fail('1,500바이트를 넘는 학생 글이 있어요. 줄인 뒤 보내 주세요.')
  try {
    const result = await driver.send(payload, options)
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
  waitTimeoutMs?: number
  pollMs?: number
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
type OpenResult = { ok: true } | { ok: false; reason: string }
const CANCELLED = '나이스 전송을 취소했어요.'
const WINDOW_CLOSED = '전송용 브라우저 창을 닫았어요. 다시 보내 주세요.'
const TIMEOUT = '나이스 전송 대기 시간이 지났어요.'
const MULTIPLE_SCREENS = '입력 화면이 여러 개예요. 보낼 나이스 화면 하나만 남겨 주세요.'
const MULTIPLE_ROWS =
  '입력할 표나 여러 학생 줄이 선택돼 있어요. 표 하나에서 학생 한 줄만 선택해 주세요.'

/** Only race preparation. An in-flight write keeps exclusive ownership until it settles. */
function interruptible<T>(
  work: Promise<T>,
  signal: AbortSignal,
  disposeLate?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason)
    signal.addEventListener('abort', stop, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener('abort', stop)
        if (signal.aborted) disposeLate?.(value)
        else resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', stop)
        reject(error)
      },
    )
    if (signal.aborted) stop()
  })
}

/** Navigation replaces frames; a scan made across such a change is stale. */
function observeBrowser(context: BrowserContext, abort: () => void) {
  let revision = 0
  let wake: (() => void) | undefined
  const pages = new Set<Page>()
  const changed = () => {
    revision++
    wake?.()
  }
  const pageClosed = (page: Page) => {
    pages.delete(page)
    if (context.pages().every((page) => page.isClosed())) abort()
    changed()
  }
  const track = (page: Page) => {
    pages.add(page)
    page.once('close', pageClosed)
    changed()
  }
  context.pages().forEach(track)
  context.on('page', track)
  context.on('framenavigated', changed)
  context.on('framedetached', changed)
  context.on('close', abort)
  return {
    get revision() {
      return revision
    },
    pause(ms: number, signal: AbortSignal) {
      return new Promise<void>((resolve) => {
        const end = () => {
          clearTimeout(timer)
          wake = undefined
          signal.removeEventListener('abort', end)
          resolve()
        }
        const timer = setTimeout(end, ms)
        wake = end
        signal.addEventListener('abort', end, { once: true })
        if (signal.aborted) end()
      })
    },
    dispose() {
      for (const page of pages) page.off('close', pageClosed)
      context.off('page', track)
      context.off('framenavigated', changed)
      context.off('framedetached', changed)
      context.off('close', abort)
    },
  }
}

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
  private opening: Promise<OpenResult> | null = null
  private sending: AbortController | null = null
  private closed = false
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

  async send(payload: RecordPackage, options: NeisSendOptions = {}): Promise<DriverResult> {
    if (this.busy)
      return { ok: false, reason: '다른 입력이 진행 중이에요. 끝난 뒤 다시 보내 주세요.' }
    this.busy = true
    const controller = new AbortController()
    this.sending = controller
    const { signal } = controller
    const cancel = () => controller.abort(CANCELLED)
    options.signal?.addEventListener('abort', cancel, { once: true })
    if (options.signal?.aborted || this.closed) cancel()
    const timeoutMs = this.options.waitTimeoutMs ?? 600_000
    const deadline = Date.now() + timeoutMs
    const timeout = setTimeout(() => controller.abort(TIMEOUT), timeoutMs)
    let browser: ReturnType<typeof observeBrowser> | undefined
    let lastStage: NeisStage | undefined
    let lastHint: string | undefined
    const stage = (value: NeisStage, hint?: string) => {
      if (lastStage === value && lastHint === hint) return
      lastStage = value
      lastHint = hint
      options.onStage?.(value, hint)
    }
    const fail = (reason: string): DriverResult => {
      stage(signal.reason === CANCELLED ? 'cancelled' : 'failed')
      return { ok: false, reason }
    }
    try {
      signal.throwIfAborted()
      stage('browser-opening')
      const opened = await this.open(signal)
      if (!opened.ok) return fail(opened.reason)
      signal.throwIfAborted()
      const context = this.context
      if (!context) return fail(WINDOW_CLOSED)
      browser = observeBrowser(context, () => controller.abort(WINDOW_CLOSED))
      await this.showNeis(signal)

      type Ready = Extract<Awaited<ReturnType<typeof probeNeis>>, { kind: 'ready' }>
      const origins = new Set<string>()
      while (true) {
        signal.throwIfAborted()
        const revision = browser.revision
        const screens: { frame: Frame; state: Ready | { kind: 'selection' | 'multiple' } }[] = []
        let onNeis = false
        let scanFailed = false
        for (const page of context.pages()) {
          for (const frame of page.frames()) {
            signal.throwIfAborted()
            const url = effectiveFrameUrl(frame)
            if (page.isClosed() || !isNeisTarget(url)) continue
            const host = new URL(url).hostname
            onNeis ||= host !== 'www.neis.go.kr' && host !== 'neis.go.kr'
            const origin = new URL(url).origin
            if (!origins.has(origin)) {
              this.rememberOrigin(origin)
              origins.add(origin)
            }
            const state = await interruptible(
              probeNeis(frame, payload.mode).catch(() => null),
              signal,
            )
            if (!state || state.kind === 'changed') {
              scanFailed = true
            } else if (state.kind === 'ready') {
              screens.push({ frame, state })
            } else if (state.kind !== 'no-screen') {
              screens.push({ frame, state: { kind: state.kind } })
            }
          }
        }
        signal.throwIfAborted()
        if (revision !== browser.revision) continue
        const [screen] = screens
        if (
          !scanFailed &&
          screens.length === 1 &&
          screen.state.kind === 'ready' &&
          !screen.state.editing
        ) {
          const { frame, state } = screen
          const grid = await interruptible(
            pinNeis(frame, payload.mode, state.identity).catch(() => null),
            signal,
            (late) => {
              void late?.dispose().catch(() => undefined)
            },
          )
          if (grid) {
            try {
              const foreground = await interruptible(
                frame
                  .page()
                  .bringToFront()
                  .then(
                    () => true,
                    () => false,
                  ),
                signal,
              )
              signal.throwIfAborted()
              if (!foreground || revision !== browser.revision || frame.isDetached()) continue
              stage('writing')
              const result = await fillNeis(frame, grid, state, payload, {
                signal,
                deadline,
                onVerifying: () => stage('verifying'),
              })
              if (!result.ok) return fail(result.reason)
              stage('done')
              return result
            } finally {
              await grid.dispose().catch(() => undefined)
            }
          }
        }
        if (screens.length > 1) stage('waiting-selection', MULTIPLE_SCREENS)
        else if (screen)
          stage('waiting-selection', screen.state.kind === 'multiple' ? MULTIPLE_ROWS : undefined)
        else stage(onNeis ? 'finding-screen' : 'waiting-login')
        await browser.pause(this.options.pollMs ?? 500, signal)
      }
    } catch {
      if (signal.reason === TIMEOUT) {
        const hint =
          lastHint ??
          (lastStage === 'waiting-selection'
            ? '나이스에서 보낼 학생 줄을 선택해 주세요.'
            : '전용 브라우저에서 업무포털 로그인과 나이스 입력 화면을 확인해 주세요.')
        return fail(`${TIMEOUT} ${hint}`)
      }
      return fail(
        signal.aborted
          ? String(signal.reason)
          : '브라우저 연결이 끊겼거나 나이스 화면이 바뀌었어요. 화면을 확인해 주세요.',
      )
    } finally {
      browser?.dispose()
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', cancel)
      this.sending = null
      this.busy = false
    }
  }

  /**
   * 나이스에서 가져오기: the class list (and its 누가기록) of the NEIS screen open in the app's
   * window, read from the screen's data. Nothing in NEIS is changed. Without an open NEIS the
   * window shows it and the teacher is told to sign in and open the 누가기록 screen.
   */
  async readClass(): Promise<NeisClassResult> {
    if (this.busy)
      return { ok: false, message: '다른 나이스 작업이 진행 중이에요. 끝난 뒤 다시 해 주세요.' }
    this.busy = true
    try {
      const opened = await this.open()
      if (!opened.ok) return { ok: false, message: opened.reason }
      if (!this.context) return { ok: false, message: '전용 브라우저를 열지 못했어요.' }
      let onNeis = false
      let unclear: 'many-lists' | 'many-classes' | null = null
      const read = new Map<string, ReturnType<typeof classResult>>()
      for (const page of this.context.pages()) {
        for (const frame of page.frames()) {
          const url = effectiveFrameUrl(frame)
          if (!isNeisTarget(url)) continue
          onNeis = true
          this.rememberOrigin(url)
          const got = await frame.evaluate(readClassInPage).catch(() => null)
          if (!got) continue
          if (got.ok) {
            const result = classResult(got)
            read.set(JSON.stringify(result), result)
          } else if (got.kind === 'many-lists' || got.kind === 'many-classes') {
            unclear = unclear === 'many-lists' ? unclear : got.kind
          }
        }
      }
      // a screen of another class anywhere: which to read is the teacher's to say
      if (unclear) return classResult({ ok: false, kind: unclear })
      if (read.size > 1) return classResult({ ok: false, kind: 'many-lists' })
      const [result] = read.values()
      if (result) return result
      if (!onNeis) {
        await this.showNeis()
        return {
          ok: false,
          message:
            '전용 브라우저에서 업무포털에 로그인하고 나이스의 [학급담임 → 행동특성및종합의견 → 누가기록] 화면을 연 뒤, 앱에서 다시 눌러 주세요.',
        }
      }
      return classResult({ ok: false, kind: 'no-class' })
    } catch {
      return {
        ok: false,
        message: '브라우저 연결이 끊겼거나 나이스 화면을 읽지 못했어요. 다시 해 주세요.',
      }
    } finally {
      this.busy = false
    }
  }

  /** the app's own browser window, opened once (and again after the teacher closed it) */
  private async open(signal?: AbortSignal): Promise<OpenResult> {
    // A cancelled launch can still be starting at the OS level. Let it release the
    // persistent profile before another operation tries to acquire it.
    if (this.opening) {
      if (signal) await interruptible(this.opening, signal)
      else await this.opening
    }
    signal?.throwIfAborted()
    if (this.closed) return { ok: false, reason: WINDOW_CLOSED }
    if (this.context) return { ok: true }
    const opening = this.launchContext(signal).finally(() => {
      this.opening = null
    })
    this.opening = opening
    return signal ? interruptible(opening, signal) : opening
  }

  private async launchContext(signal?: AbortSignal): Promise<OpenResult> {
    let context: BrowserContext
    try {
      context = await this.launch(this.options)
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
    if (this.closed || signal?.aborted) {
      await context.close().catch(() => undefined)
      return { ok: false, reason: WINDOW_CLOSED }
    }
    this.context = context
    context.on('close', () => {
      if (this.context === context) this.context = null
    })
    context.setDefaultTimeout(3_000)
    return { ok: true }
  }

  /** NEIS in the window, in front (the place used last time, or the national portal) */
  private async showNeis(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const context = this.context
    if (!context) return
    const url = this.options.neisUrl || this.readSavedOrigin() || 'https://www.neis.go.kr'
    let page = context.pages().find((p) => isNeisTarget(p.url()))
    if (!page) {
      page = context.pages()[0]
      if (!page) {
        const newPage = context.newPage()
        page = signal
          ? await interruptible(newPage, signal, (late) => {
              void late.close().catch(() => undefined)
            })
          : await newPage
      }
      signal?.throwIfAborted()
      if (page.url() === 'about:blank') {
        const navigation = page.goto(url, {
          timeout: 20_000,
          waitUntil: signal ? 'commit' : 'domcontentloaded',
        })
        if (signal)
          await interruptible(
            navigation.catch(() => undefined),
            signal,
          )
        else await navigation
      }
    }
    signal?.throwIfAborted()
    const foreground = page.bringToFront()
    if (signal)
      await interruptible(
        foreground.catch(() => undefined),
        signal,
      )
    else await foreground
  }

  async focusSendWindow(): Promise<void> {
    if (!this.sending || this.sending.signal.aborted) return
    const pages = this.context?.pages().filter((page) => !page.isClosed())
    const page =
      pages?.find((page) =>
        page.frames().some((frame) => isNeisTarget(effectiveFrameUrl(frame))),
      ) ?? pages?.at(-1)
    await page?.bringToFront().catch(() => undefined)
  }

  async close(): Promise<void> {
    this.closed = true
    this.sending?.abort(WINDOW_CLOSED)
    const context = this.context
    this.context = null
    await context?.close()
    await this.opening
  }
}

export function createNeisDriver(userDataDir: string): PlaywrightNeisDriver {
  return new PlaywrightNeisDriver({
    userDataDir: join(userDataDir, 'neis-browser'),
    ...(process.env.SAENGGIBU_NEIS_URL ? { neisUrl: process.env.SAENGGIBU_NEIS_URL } : {}),
  })
}
