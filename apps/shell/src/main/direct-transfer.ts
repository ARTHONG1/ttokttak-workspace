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
import type {
  DirectFeature,
  DirectTransferResult,
  DirectTransferStage,
} from '../shared/direct-transfer-api'
import { edufinePage, edufineProbe } from './direct-transfer-edufine'
import { fillNeis, readSelection } from './direct-transfer-neis'
import { waitForTransferFrame, type ReadyFrame } from './direct-transfer-wait'

export type { DirectFeature, DirectTransferResult }
export type DriverResult =
  { ok: true; written: number; next: number; startedFrom?: number } | { ok: false; reason: string }
export interface DirectSendOptions {
  signal?: AbortSignal
  onStage?: (stage: DirectTransferStage) => void
}
export interface DirectTransferDriver {
  send(
    feature: DirectFeature,
    payload: RecordPackage | PumuiPackage,
    options?: DirectSendOptions,
  ): Promise<DriverResult>
}

/** No AI, cookies, credentials or external queue cross this boundary. */
export async function directTransferRequest(
  feature: string,
  text: string,
  driver: DirectTransferDriver,
  options?: DirectSendOptions,
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
    const result = await driver.send(feature, payload, options)
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
  waitTimeoutMs?: number
  pollMs?: number
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

/** Cancellation must win over an OS browser launch or a hung browser command.
 * A result that arrives after cancellation is disposed of without taking ownership. */
function awaitPreparation<T>(
  work: Promise<T>,
  signal: AbortSignal,
  disposeLate: (value: T) => void = () => {},
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      resolve(null)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => {
        if (settled) {
          if (signal.aborted) disposeLate(value)
          return
        }
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
    if (signal.aborted) onAbort()
  })
}

export class PlaywrightDirectTransferDriver implements DirectTransferDriver {
  private context: BrowserContext | null = null
  private cleanup: Promise<void> | null = null
  private busy = false
  private activeCancel: AbortController | null = null
  constructor(
    private readonly options: DirectTransferOptions,
    private readonly launch: Launch = launchBrowser,
  ) {}

  private trackCleanup(work: Promise<unknown>): Promise<void> {
    const cleanup = work.then(
      () => undefined,
      () => undefined,
    )
    this.cleanup = cleanup
    void cleanup.then(() => {
      if (this.cleanup === cleanup) this.cleanup = null
    })
    return cleanup
  }

  private readSavedOrigin(feature: DirectFeature): string | undefined {
    try {
      const raw = JSON.parse(readFileSync(join(this.options.userDataDir, PLACES_FILE), 'utf8'))
      const candidate = typeof raw?.[feature] === 'string' ? raw[feature] : undefined
      return candidate && isDirectTarget(feature, candidate) ? new URL(candidate).origin : undefined
    } catch {
      return undefined
    }
  }

  getStartOrigin(feature: DirectFeature): string | null {
    const configured = feature === 'edufine-pumui' ? this.options.edufineUrl : this.options.neisUrl
    return (
      this.readSavedOrigin(feature) ??
      (configured && isDirectTarget(feature, configured) ? new URL(configured).origin : null)
    )
  }

  setStartOrigin(feature: DirectFeature, address: string | null): boolean {
    if (address !== null && !isDirectTarget(feature, address)) return false
    try {
      mkdirSync(this.options.userDataDir, { recursive: true, mode: 0o700 })
      const file = join(this.options.userDataDir, PLACES_FILE)
      let stored: Record<string, string> = {}
      try {
        stored = JSON.parse(readFileSync(file, 'utf8')) ?? {}
      } catch {}
      if (address === null) delete stored[feature]
      else stored[feature] = new URL(address).origin
      writeFileSync(file, JSON.stringify(stored), { mode: 0o600 })
      return true
    } catch {
      return false
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

  async send(
    feature: DirectFeature,
    payload: RecordPackage | PumuiPackage,
    options: DirectSendOptions = {},
  ): Promise<DriverResult> {
    if (this.busy)
      return { ok: false, reason: '다른 입력이 진행 중이에요. 끝난 뒤 다시 보내 주세요.' }
    this.busy = true
    const internalCancel = new AbortController()
    this.activeCancel = internalCancel
    const signal = options.signal
      ? AbortSignal.any([options.signal, internalCancel.signal])
      : internalCancel.signal
    let preparingBrowser = true
    try {
      const cancelled = () => signal.aborted
      const cancelResult = (): DriverResult => {
        options.onStage?.('cancelled')
        return { ok: false, reason: '전송을 취소했어요.' }
      }
      if (cancelled()) return cancelResult()
      if (
        this.cleanup &&
        (await awaitPreparation(
          this.cleanup.then(() => true),
          signal,
        )) === null
      )
        return cancelResult()
      if (cancelled()) return cancelResult()
      const startUrl =
        this.getStartOrigin(feature) ||
        (feature === 'neis-record' ? 'https://www.neis.go.kr' : undefined)
      const hasTargetPage = (context: BrowserContext) =>
        context
          .pages()
          .some((page) =>
            page.frames().some((frame) => isDirectTarget(feature, effectiveFrameUrl(frame))),
          )
      if (!startUrl && (!this.context || !hasTargetPage(this.context))) {
        options.onStage?.('failed')
        return {
          ok: false,
          reason:
            'K-에듀파인 업무포털 시작 주소를 먼저 등록해 주세요. HTTPS로 시작하는 교육청 주소가 필요해요.',
        }
      }
      options.onStage?.('browser-opening')
      if (!this.context) {
        try {
          const launch = this.launch(this.options)
          const launched = await awaitPreparation(launch, signal)
          if (!launched) {
            this.trackCleanup(launch.then((late) => late.close()))
            return cancelResult()
          }
          this.context = launched
        } catch (err) {
          if (cancelled()) return cancelResult()
          const msg = String((err as Error)?.message ?? err)
          options.onStage?.('failed')
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

      if (cancelled()) return cancelResult()
      const context = this.context
      if (!hasTargetPage(context)) {
        const page =
          context.pages()[0] ??
          (await awaitPreparation(context.newPage(), signal, (late) => {
            void late.close().catch(() => undefined)
          }))
        if (!page) return cancelResult()
        if (cancelled()) return cancelResult()
        if (page.url() === 'about:blank' && startUrl && isDirectTarget(feature, startUrl)) {
          try {
            await awaitPreparation(
              page.goto(startUrl, { timeout: 20_000, waitUntil: 'domcontentloaded' }),
              signal,
            )
          } catch {
            if (cancelled()) return cancelResult()
          }
        }
        if (cancelled()) return cancelResult()
        if (
          (await awaitPreparation(
            page.bringToFront().then(() => true),
            signal,
          )) === null
        )
          return cancelResult()
      }
      if (cancelled()) return cancelResult()
      preparingBrowser = false
      // A new teacher can navigate to the school's portal while this request waits.
      // Remember only its origin when they arrive, never a path or credential.
      const menuOpened = new WeakSet<Frame>()
      const until = Date.now() + (this.options.waitTimeoutMs ?? 600_000)
      while (Date.now() < until) {
        const remaining = until - Date.now()
        const ready = await waitForTransferFrame(
          context,
          async (isActive): Promise<ReadyFrame[]> => {
            const found: ReadyFrame[] = []
            for (const page of context.pages()) {
              for (const frame of page.frames()) {
                if (!isActive()) return []
                const url = effectiveFrameUrl(frame)
                if (!isDirectTarget(feature, url)) continue
                this.rememberOrigin(feature, url)
                if (feature === 'neis-record') {
                  const selection = await frame.evaluate(readSelection).catch(() => null)
                  if (!isActive()) return []
                  if (selection?.ok) found.push({ frame })
                  else if (selection && (selection.hasGrid || selection.kind !== 'none')) {
                    found.push({
                      frame,
                      stage: 'waiting-selection',
                      ...(selection.kind === 'multi-row'
                        ? {
                            reason:
                              '나이스 표에서 여러 학생 줄이 선택돼 있어요. 한 줄만 선택해 주세요.',
                          }
                        : selection.kind === 'ambiguous-grid'
                          ? { reason: '선택된 나이스 표가 여러 개예요. 하나만 선택해 주세요.' }
                          : {}),
                    })
                  }
                  continue
                }
                const probe = await frame
                  .evaluate(edufineProbe, {
                    map: DEFAULT_SCREEN_MAP,
                    tryOpenMenu: false,
                  })
                  .catch(() => ({ state: 'no-app' as const }))
                if (!isActive()) return []
                if (probe.state === 'no-app') continue
                if (probe.state === 'pumui') {
                  found.push({
                    frame,
                    ...(probe.ready ? {} : { stage: 'waiting-selection' as const }),
                  })
                } else {
                  found.push({ frame, stage: 'finding-screen' })
                  if (!menuOpened.has(frame) && isActive()) {
                    const opening = await frame
                      .evaluate(edufineProbe, {
                        map: DEFAULT_SCREEN_MAP,
                        tryOpenMenu: true,
                      })
                      .catch(() => null)
                    if (!isActive()) return []
                    if (opening?.state === 'other-screen' && opening.openedMenu)
                      menuOpened.add(frame)
                  }
                }
              }
            }
            return found
          },
          {
            signal,
            timeoutMs: Math.max(0, remaining),
            pollMs: this.options.pollMs ?? 350,
            onStage: options.onStage,
          },
        )
        if (!('frame' in ready)) return { ok: false, reason: ready.reason }
        if (cancelled()) return cancelResult()
        preparingBrowser = true
        if (
          (await awaitPreparation(
            ready.frame
              .page()
              .bringToFront()
              .then(() => true),
            signal,
          )) === null
        )
          return cancelResult()
        if (cancelled()) return cancelResult()
        preparingBrowser = false
        if (!isDirectTarget(feature, effectiveFrameUrl(ready.frame))) continue
        options.onStage?.('writing')
        if (feature === 'neis-record') {
          const result = await fillNeis(ready.frame, payload as RecordPackage, {
            signal,
            onVerifying: () => options.onStage?.('verifying'),
          })
          options.onStage?.(result.ok ? 'done' : cancelled() ? 'cancelled' : 'failed')
          return result
        }
        if (cancelled()) return cancelResult()
        const result = await ready.frame
          .evaluate(edufinePage, {
            map: DEFAULT_SCREEN_MAP,
            pkg: payload as PumuiPackage,
            unitAliases: UNIT_ALIASES,
          })
          .catch(() => ({
            ok: false as const,
            reason: '입력 화면이 바뀌었어요. 화면의 입력 내용을 확인해 주세요.',
          }))
        if (result.ok) options.onStage?.('verifying')
        // A failed write may already have called the form's add-row handler.
        // Returning its exact reason prevents a retry from adding duplicate rows.
        // The synchronous page script may have finished before the cancellation
        // arrived. Report that verified outcome to prevent an unsafe repeat.
        options.onStage?.(result.ok ? 'done' : cancelled() ? 'cancelled' : 'failed')
        return result
      }
      options.onStage?.('failed')
      return {
        ok: false,
        reason: '화면 준비 대기 시간이 지났어요. 화면을 확인한 뒤 다시 보내 주세요.',
      }
    } finally {
      if (preparingBrowser && signal.aborted && this.context) {
        const context = this.context
        this.context = null
        this.trackCleanup(context.close())
      }
      if (this.activeCancel === internalCancel) this.activeCancel = null
      this.busy = false
    }
  }

  async close(): Promise<void> {
    this.activeCancel?.abort()
    const context = this.context
    this.context = null
    if (context) await this.trackCleanup(context.close())
    else await this.cleanup
  }
}

export function createDirectTransferDriver(userDataDir: string): PlaywrightDirectTransferDriver {
  return new PlaywrightDirectTransferDriver({
    userDataDir: join(userDataDir, 'direct-transfer-browser'),
    neisUrl: process.env.TTOKTTAK_NEIS_URL,
    edufineUrl: process.env.TTOKTTAK_EDUFINE_URL,
  })
}
