/**
 * The built-in 똑딱AI: llama.cpp's llama-server on 127.0.0.1 with a per-run key, the Qwen3.5-2B
 * Q8_0 base and 똑딱AI's 생기부 adapter on it (the same files as 똑딱작업실's, shared/model.ts),
 * every request at temperature 0 as the model project measured it. The server comes with the
 * app (Resources/local-ai); the model files are downloaded once into the user's folder
 * (model-store.ts), since they do not fit an installer. Nothing leaves this computer; the
 * server's logs are off so no student text is written out.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { availableParallelism } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { readdir, rm, stat } from 'node:fs/promises'
import type { AiState } from '../shared/api'
import {
  completeObservation,
  composeObservation,
  draftFromObservation,
  type Observation,
  type ObservationExample,
} from '../shared/observation-turn'
import {
  MAX_ANSWER_TOKENS,
  RequestProblem,
  plainTurn,
  type Example,
  type Sampling,
} from './ai-turn'
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
 * The server's arguments. The server runs in the model's folder and gets the model and the
 * adapter by paths inside it: a Windows profile or app folder with Korean letters stays out
 * of argv. The adapter is on for every request (--lora applies it at scale 1).
 */
export function serverArgs(
  port: number,
  apiKey: string,
  threads: number,
  modelFile = 'base.gguf',
  ...adapterFiles: string[]
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
    ...adapterFiles.flatMap((file) => ['--lora', file]),
  ]
}

/** the request body of one 생기부 turn: model answers first as earlier turns, then the request */
export function requestBody(
  system: string,
  text: string,
  sampling: Sampling = { temperature: 0 },
  lora?: { id: number; scale: number }[],
  examples: readonly Example[] = [],
): Record<string, unknown> {
  return {
    model: AI_MODEL,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...examples.flatMap(([request, answer]) => [
        { role: 'user', content: request },
        { role: 'assistant', content: answer },
      ]),
      { role: 'user', content: text },
    ],
    ...sampling,
    max_tokens: MAX_ANSWER_TOKENS,
    stream: false,
    ...(lora ? { lora } : {}),
  }
}

/** an answer that ran to the token cap instead of ending: a loop, not a 생기부 entry */
export const RAN_ON = '똑딱AI의 답이 끝나지 않고 계속 길어져 멈췄어요. 다시 생성해 주세요.'

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
/**
 * where the model comes from: the download stores (the base first, then the adapter), or fixed
 * files for a development run (SAENGGIBU_MODEL_FILE and SAENGGIBU_ADAPTER_FILE)
 */
export type ModelSource = { stores: readonly ModelStore[] } | { file: string; adapter?: string }

export class LocalAi {
  private state: AiState = { state: 'off' }
  private child: ChildProcess | null = null
  private endpoint: Endpoint | null = null
  private starting: Promise<Endpoint> | null = null
  private preparing: Promise<void> | null = null
  private modelPath: string | null = null
  /** the 생기부 adapter first (V7-B); V10-94 after it when V10.1 is on this computer */
  private adapterPaths: string[] = []
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
    this.preparing ??= this.prepareOnce()
      .catch((err: unknown) => {
        // a folder that cannot be read or written: shown on the page, never an unhandled error
        const message = err instanceof Error ? err.message : String(err)
        this.set({ state: 'download-failed', message })
      })
      .finally(() => {
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
      this.adapterPaths = this.source.adapter ? [this.source.adapter] : []
    } else {
      const stores = this.source.stores
      this.set({ state: 'verifying' })
      const missing: ModelStore[] = []
      for (const store of stores) if (!(await store.ready())) missing.push(store)
      // progress over all the missing files together
      const total = missing.reduce((n, s) => n + s.spec.bytes, 0)
      let done = 0
      for (const store of missing) {
        let received = 0
        const progress = (p: Progress) => {
          received = p.received
          this.set({ state: 'downloading', received: done + p.received, total, rate: p.rate })
        }
        for (let attempt = 0; ; attempt++) {
          if (this.stopping) return
          const before = received
          try {
            this.set({ state: 'downloading', received: done + received, total, rate: 0 })
            await store.download((p) => {
              if (p.received >= p.total) this.set({ state: 'verifying' })
              else progress(p)
            })
            break
          } catch (err) {
            if (this.stopping) return
            console.warn(
              '[model] download try failed:',
              store.spec.file,
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
        done += store.spec.bytes
      }
      this.modelPath = stores[0].path
      this.adapterPaths = stores.slice(1).map((store) => store.path)
      await dropEarlierFiles(stores)
    }
    await this.ensure().catch(() => undefined)
  }

  /** [파일로 넣기]: model files downloaded by hand, each recognized by its size */
  async importModel(files: readonly string[]): Promise<void> {
    if (!('stores' in this.source)) return
    const stores = this.source.stores
    if (this.preparing || this.state.state === 'downloading')
      throw new Error('받는 중에는 파일로 넣을 수 없어요. 받기를 멈춘 뒤 다시 해 주세요.')
    try {
      for (const file of files) {
        const size = (await stat(file).catch(() => null))?.size
        const store = stores.find((s) => s.spec.bytes === size)
        if (!store) throw new ModelError('똑딱AI 모델 파일이 아니에요 (크기가 달라요).')
        await store.importFile(file, (p) => this.set({ state: 'downloading', ...p }))
      }
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
    const adapterPaths = this.adapterPaths
    if (!files || !existsSync(modelPath) || adapterPaths.some((path) => !existsSync(path))) {
      this.set({ state: 'missing' })
      throw new Error('똑딱AI 파일을 찾지 못했어요. 똑딱생기부를 다시 설치해 주세요.')
    }
    this.set({ state: 'starting' })
    const port = await freePort()
    const key = randomBytes(32).toString('hex')
    const threads = Math.min(4, Math.max(1, availableParallelism() - 1))
    const cwd = dirname(modelPath)
    const args = serverArgs(
      port,
      key,
      threads,
      basename(modelPath),
      ...adapterPaths.map((path) => relative(cwd, path)),
    )
    const child = spawn(files.executable, args, {
      cwd,
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

  /** one answer: the instructions, the model answers that fit and the request */
  async ask(
    requestId: string,
    system: string,
    text: string,
    sampling: Sampling = { temperature: 0 },
    examples: readonly Example[] = [],
  ): Promise<string> {
    const turn = plainTurn(system, text, examples)
    if (!turn.ok) throw new RequestProblem(turn.error)
    const endpoint = await this.ensure()
    const controller = new AbortController()
    this.running.set(requestId, controller)
    try {
      const res = await fetch(endpoint.url + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + endpoint.key },
        body: JSON.stringify(
          requestBody(turn.system, turn.text, sampling, this.loraFor(0, 1), turn.examples),
        ),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('똑딱AI가 답하지 못했어요 (' + res.status + '). 다시 해 주세요.')
      const json = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[]
      }
      const choice = json.choices?.[0]
      // a 1,500-byte entry is far under the cap: one that reaches it is cut off mid-sentence
      if (choice?.finish_reason === 'length') throw new RequestProblem(RAN_ON)
      return choice?.message?.content ?? ''
    } catch (err) {
      if (controller.signal.aborted) throw new Error('멈췄어요.', { cause: err })
      throw err
    } finally {
      this.running.delete(requestId)
    }
  }

  async writeObservation(
    requestId: string,
    observation: Observation,
    examples: () => ObservationExample[],
  ): Promise<string> {
    const edited = draftFromObservation(observation)
    if (edited) return edited
    const controller = new AbortController()
    this.running.set(requestId, controller)
    try {
      const endpoint = await this.ensure()
      controller.signal.throwIfAborted()
      return await composeObservation(
        observation,
        examples(),
        AI_MODEL,
        (scale) => this.loraFor(this.adapterPaths.length - 1, scale) ?? [],
        (body) =>
          completeObservation(
            endpoint.url + '/v1/chat/completions',
            endpoint.key,
            body,
            controller.signal,
          ),
      )
    } catch (err) {
      if (controller.signal.aborted) throw new Error('멈췄어요.', { cause: err })
      throw err
    } finally {
      this.running.delete(requestId)
    }
  }

  /**
   * One adapter on for a request, every loaded one named, when more than one is loaded (llama-server
   * applies each loaded adapter at full scale otherwise). One adapter alone needs no choice.
   */
  private loraFor(on: number, scale: number): { id: number; scale: number }[] | undefined {
    if (this.adapterPaths.length < 2) return undefined
    return this.adapterPaths.map((_, id) => ({ id, scale: id === on ? scale : 0 }))
  }

  cancel(requestId: string): void {
    this.running.get(requestId)?.abort()
  }

  stop(): void {
    this.stopping = true
    if (this.later) clearTimeout(this.later)
    this.later = null
    if ('stores' in this.source) for (const store of this.source.stores) store.cancel()
    for (const c of this.running.values()) c.abort()
    this.child?.kill()
    this.child = null
    this.endpoint = null
  }
}

/**
 * The files of an earlier model in the model folder (0.2's 똑딱AI 생기부 V7 B as model.gguf)
 * go once the current files are in; anything else stays.
 */
async function dropEarlierFiles(stores: readonly ModelStore[]): Promise<void> {
  const dir = stores[0]?.dir
  if (!dir) return
  const keep = new Set(stores.flatMap((s) => [s.spec.file, s.spec.file + '.verified.json']))
  const names = await readdir(dir, { recursive: true }).catch(() => [] as string[])
  for (const name of names) {
    const rel = String(name).split('\\').join('/')
    if (keep.has(rel) || !/\.(gguf|partial|json)$/.test(rel)) continue
    await rm(join(dir, rel), { force: true }).catch(() => undefined)
  }
}
