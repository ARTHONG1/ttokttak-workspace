/**
 * The built-in 똑딱AI: llama.cpp's llama-server on 127.0.0.1 with a per-run key and the
 * 똑딱AI 생기부 V7 B model (school-record-v7-b), a whole Q8_0 model with no adapter: the file
 * the model project measured on its 80 생기부 dev prompts, and every request goes at
 * temperature 0 as there. The server comes with the app (Resources/local-ai); the model is
 * downloaded once into the user's folder (model-store.ts), since it does not fit an installer.
 * Nothing leaves this computer; the server's logs are off so no student text is written out.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { availableParallelism } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { AiState } from '../shared/api'
import { MAX_ANSWER_TOKENS, plainTurn } from './ai-turn'
import { ModelError, type ModelStore, type Progress } from './model-store'

export const AI_MODEL = 'ttokttak-saenggibu'

export interface AiFiles {
  dir: string
  executable: string
}

/** the bundled server folder (Resources/local-ai), or SAENGGIBU_AI_DIR for a development run */
export function aiFiles(resourcesPath: string, platform = process.platform): AiFiles | null {
  const dir = process.env.SAENGGIBU_AI_DIR || join(resourcesPath, 'local-ai')
  const executable = join(dir, platform === 'win32' ? 'llama-server.exe' : 'llama-server')
  return existsSync(executable) ? { dir, executable } : null
}

/**
 * The server's arguments. The server runs in the model's folder and gets the model by its
 * bare file name: a Windows profile or app folder with Korean letters stays out of argv.
 */
export function serverArgs(
  port: number,
  apiKey: string,
  threads: number,
  modelFile = 'model.gguf',
): string[] {
  return [
    '--model',
    modelFile,
    '--alias',
    AI_MODEL,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--api-key',
    apiKey,
    '--no-webui',
    '--log-disable',
    '--ctx-size',
    '4096',
    '--parallel',
    '1',
    '--threads',
    String(threads),
    '--n-gpu-layers',
    '0',
    '--reasoning',
    'off',
    '--jinja',
  ]
}

/** the request body of one 생기부 turn: the model's measured settings */
export function requestBody(system: string, text: string): Record<string, unknown> {
  return {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
    temperature: 0,
    max_tokens: MAX_ANSWER_TOKENS,
    stream: false,
  }
}

/** what a writing request is told while the model is not usable yet */
export function notReadyMessage(state: AiState): string {
  switch (state.state) {
    case 'downloading':
      return (
        '똑딱AI를 처음 한 번 받는 중이에요 (' +
        Math.floor((state.received / state.total) * 100) +
        '%). 다 받으면 바로 쓸 수 있어요.'
      )
    case 'verifying':
      return '받은 똑딱AI를 확인하는 중이에요. 잠시 뒤 다시 해 주세요.'
    case 'download-failed':
      return '똑딱AI를 아직 받지 못했어요. 위의 [다시 받기]나 [파일로 넣기]를 눌러 주세요.'
    default:
      return '똑딱AI가 아직 준비되지 않았어요. 잠시 뒤 다시 해 주세요.'
  }
}

/** automatic retries of a dropped download before the page shows [다시 받기] */
const RETRY_WAITS_MS = [3_000, 10_000, 30_000]
/** after those, the download keeps trying this often by itself (Wi-Fi back, the lid opened) */
const DROPPED_RETRY_MS = 60_000
/** a download that kept dropping, as the page shows it */
const DROPPED =
  '인터넷 연결이 끊겨 잠시 멈췄어요. 연결되면 받던 곳부터 저절로 이어서 받아요. 바로 하려면 [다시 받기]를 눌러 주세요.'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

type Endpoint = { url: string; key: string }
/** where the model comes from: the download store, or a fixed file (SAENGGIBU_MODEL_FILE) */
export type ModelSource = { store: ModelStore } | { file: string }

export class LocalAi {
  private state: AiState = { state: 'off' }
  private child: ChildProcess | null = null
  private endpoint: Endpoint | null = null
  private starting: Promise<Endpoint> | null = null
  private preparing: Promise<void> | null = null
  private modelPath: string | null = null
  private stopping = false
  /** the next automatic try after a dropped download */
  private later: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<(state: AiState) => void>()
  private readonly running = new Map<string, AbortController>()

  constructor(
    private readonly resourcesPath: string,
    private readonly source: ModelSource,
    private readonly retryWaitsMs: readonly number[] = RETRY_WAITS_MS,
    private readonly droppedRetryMs: number = DROPPED_RETRY_MS,
  ) {}

  current(): AiState {
    return this.state
  }

  onState(listener: (state: AiState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(state: AiState): void {
    this.state = state
    for (const l of this.listeners) l(state)
  }

  /**
   * At launch and on [다시 받기]: find the verified model, download it if it is not here
   * (retrying a dropped connection a few times), then start the server.
   */
  prepare(): Promise<void> {
    if (this.later) clearTimeout(this.later)
    this.later = null
    this.preparing ??= this.prepareOnce().finally(() => {
      this.preparing = null
    })
    return this.preparing
  }

  /** the computer woke up or came back online: a dropped download goes on at once */
  resumeDropped(): void {
    if (this.later) void this.prepare()
  }

  private async prepareOnce(): Promise<void> {
    if ('file' in this.source) {
      this.modelPath = this.source.file
    } else {
      const store = this.source.store
      this.set({ state: 'verifying' })
      if (!(await store.ready())) {
        let received = 0
        const progress = (p: Progress) => {
          received = p.received
          this.set({ state: 'downloading', ...p })
        }
        for (let attempt = 0; ; attempt++) {
          if (this.stopping) return
          const before = received
          try {
            this.set({ state: 'downloading', received, total: store.spec.bytes, rate: 0 })
            await store.download((p) => {
              if (p.received >= p.total) this.set({ state: 'verifying' })
              else progress(p)
            })
            break
          } catch (err) {
            if (this.stopping) return
            console.warn(
              '[model] download try failed at',
              received,
              'bytes:',
              String(err),
              err instanceof Error && err.cause ? String(err.cause) : '',
            )
            // a full disk or a damaged file will not mend itself; a dropped connection may
            if (err instanceof ModelError) {
              this.set({ state: 'download-failed', message: err.message })
              return
            }
            // a try that got further counts as a fresh start: only stalls in a row give up
            if (received > before) attempt = -1
            if (attempt >= this.retryWaitsMs.length) {
              this.set({ state: 'download-failed', message: DROPPED })
              this.later = setTimeout(() => void this.prepare(), this.droppedRetryMs)
              return
            }
            await new Promise((r) => setTimeout(r, this.retryWaitsMs[Math.max(0, attempt)]))
          }
        }
      }
      this.modelPath = store.path
    }
    await this.ensure().catch(() => undefined)
  }

  /** [파일로 넣기]: a model file downloaded by hand */
  async importModel(file: string): Promise<void> {
    if (!('store' in this.source)) return
    const store = this.source.store
    if (this.preparing || this.state.state === 'downloading')
      throw new Error('받는 중에는 파일로 넣을 수 없어요. 받기를 멈춘 뒤 다시 해 주세요.')
    try {
      await store.importFile(file, (p) => this.set({ state: 'downloading', ...p }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.set({ state: 'download-failed', message })
      throw err
    }
    await this.prepare()
  }

  /** start the server (once) on the verified model; the first answer waits for it */
  ensure(): Promise<Endpoint> {
    if (this.endpoint && this.child && this.child.exitCode === null) {
      return Promise.resolve(this.endpoint)
    }
    if (!this.modelPath) return Promise.reject(new Error(notReadyMessage(this.state)))
    this.starting ??= this.start(this.modelPath).finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async start(modelPath: string): Promise<Endpoint> {
    if (this.stopping) throw new Error('똑딱생기부를 닫는 중이에요.')
    const files = aiFiles(this.resourcesPath)
    if (!files || !existsSync(modelPath)) {
      this.set({ state: 'missing' })
      throw new Error('똑딱AI 파일을 찾지 못했어요. 똑딱생기부를 다시 설치해 주세요.')
    }
    this.set({ state: 'starting' })
    const port = await freePort()
    const key = randomBytes(32).toString('hex')
    const threads = Math.min(4, Math.max(1, availableParallelism() - 1))
    const child = spawn(files.executable, serverArgs(port, key, threads, basename(modelPath)), {
      cwd: dirname(modelPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout?.resume()
    child.stderr?.resume()
    let error: Error | null = null
    child.once('error', (e) => {
      error = e
    })
    const endpoint = { url: `http://127.0.0.1:${port}`, key }
    const deadline = Date.now() + 120_000
    try {
      while (Date.now() < deadline) {
        if (this.stopping) throw new Error('똑딱생기부를 닫는 중이에요.')
        if (error) throw error
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error(
            '똑딱AI 실행 파일이 멈췄어요 (' + (child.exitCode ?? child.signalCode) + ').',
          )
        try {
          const res = await fetch(endpoint.url + '/health', {
            headers: { Authorization: 'Bearer ' + key },
            signal: AbortSignal.timeout(1500),
          })
          if (res.ok) {
            this.child = child
            this.endpoint = endpoint
            child.once('exit', () => {
              if (this.child === child) {
                this.child = null
                this.endpoint = null
                if (!this.stopping) this.set({ state: 'off' })
              }
            })
            this.set({ state: 'ready' })
            return endpoint
          }
        } catch {
          /* expected until the model is loaded */
        }
        await new Promise((r) => setTimeout(r, 400))
      }
      throw new Error('똑딱AI가 2분 안에 준비되지 않았어요. 메모리를 확인해 주세요.')
    } catch (err) {
      child.kill()
      const message = err instanceof Error ? err.message : String(err)
      this.set({ state: 'failed', message })
      throw err
    }
  }

  /** one answer: the page's instructions and request, at the model's measured settings */
  async ask(requestId: string, system: string, text: string): Promise<string> {
    const turn = plainTurn(system, text)
    if (!turn.ok) throw new Error(turn.error)
    const endpoint = await this.ensure()
    const controller = new AbortController()
    this.running.set(requestId, controller)
    try {
      const res = await fetch(endpoint.url + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + endpoint.key },
        body: JSON.stringify(requestBody(turn.system, turn.text)),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('똑딱AI가 답하지 못했어요 (' + res.status + '). 다시 해 주세요.')
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return json.choices?.[0]?.message?.content ?? ''
    } catch (err) {
      if (controller.signal.aborted) throw new Error('멈췄어요.', { cause: err })
      throw err
    } finally {
      this.running.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    this.running.get(requestId)?.abort()
  }

  stop(): void {
    this.stopping = true
    if (this.later) clearTimeout(this.later)
    this.later = null
    if ('store' in this.source) this.source.store.cancel()
    for (const c of this.running.values()) c.abort()
    this.child?.kill()
    this.child = null
    this.endpoint = null
  }
}
