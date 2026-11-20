/**
 * Downloading 똑딱AI's model files (local-ai-model-files.ts) into the user's folder: each file
 * is fetched once from the model release, resumed where a download stopped (HTTP Range on
 * <file>.partial), and accepted only at its pinned size and SHA256. A verified file leaves a
 * small record beside it, so later launches check size and time instead of hashing 4 GB again.
 * The same way 똑딱생기부 downloads its model (apps/saenggibu/src/main/model-store.ts), which was
 * checked against the GitHub release on 2026-11-20: the connection can stall or break mid-file,
 * and every such case resumes.
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  truncate,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  LOCAL_AI_MODEL_FILES,
  LOCAL_AI_RUNS,
  localAiRunFiles,
  type LocalAiFileId,
  type LocalAiModelFile,
  type LocalAiRun,
} from './local-ai-model-files'

/** room left beside the models, so a full disk does not stop the computer */
const SPARE_BYTES = 300 * 1024 * 1024
/** a connection that sends nothing for this long is dropped and resumed */
const IDLE_MS = 30_000
/** automatic retries of a dropped download before the page shows [다시 받기] */
const RETRY_WAITS_MS = [3_000, 10_000, 30_000]
/** after those, the download keeps trying this often by itself (Wi-Fi back, the lid opened) */
const DROPPED_RETRY_MS = 60_000
const DROPPED =
  '인터넷 연결이 끊겨 잠시 멈췄어요. 연결되면 받던 곳부터 저절로 이어서 받아요. 바로 하려면 [다시 받기]를 눌러 주세요.'

/** p, or a rejection once ms pass: a stalled fetch or read ends even if it ignores abort */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('응답이 ' + ms / 1000 + '초 동안 없어요.')), ms)
  })
  return Promise.race([p, late]).finally(() => clearTimeout(timer))
}

export interface Progress {
  received: number
  total: number
  /** bytes per second over the last few seconds, 0 until known */
  rate: number
}

export type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>

/** a problem a retry will not mend (a full disk, a damaged or wrong file, a missing release) */
export class ModelError extends Error {}

export interface StoreOptions {
  freeBytes?: (dir: string) => Promise<number>
  idleMs?: number
  /** drops the open connections, so a try after a failed one starts on a new one */
  reconnect?: () => Promise<void>
}

const statfsFree = async (d: string) => {
  const s = await statfs(d)
  return Number(s.bavail) * Number(s.bsize)
}

/** one model file in the models folder */
export class ModelFileStore {
  private controller: AbortController | null = null
  private readonly freeBytes: (dir: string) => Promise<number>
  private readonly idleMs: number
  private readonly reconnect: () => Promise<void>
  private tries = 0

  constructor(
    readonly dir: string,
    readonly spec: LocalAiModelFile,
    private readonly fetchImpl: Fetch,
    options: StoreOptions = {},
  ) {
    this.freeBytes = options.freeBytes ?? statfsFree
    this.idleMs = options.idleMs ?? IDLE_MS
    this.reconnect = options.reconnect ?? (async () => undefined)
  }

  get path(): string {
    return join(this.dir, this.spec.file)
  }

  private get partial(): string {
    return this.path + '.partial'
  }

  private get record(): string {
    return this.path + '.verified.json'
  }

  /** the file is here and verified (by its record, or by hashing it once) */
  async ready(): Promise<boolean> {
    const info = await stat(this.path).catch(() => null)
    if (!info || info.size !== this.spec.bytes) return false
    const record = await readFile(this.record, 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    if (
      record?.sha256 === this.spec.sha256 &&
      record.bytes === info.size &&
      record.mtimeMs === info.mtimeMs
    )
      return true
    if ((await sha256Of(this.path)) !== this.spec.sha256) return false
    await this.writeRecord()
    return true
  }

  /** bytes of this file still to download */
  async missingBytes(): Promise<number> {
    const have = (await stat(this.partial).catch(() => null))?.size ?? 0
    return have > this.spec.bytes ? this.spec.bytes : this.spec.bytes - have
  }

  /** download (or finish downloading) the file; resolves once it is verified in place */
  async download(onProgress: (p: Progress) => void): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    // after a connection broke mid-file, requests sent on it again can keep failing:
    // each later try opens a new connection
    if (this.tries++ > 0) await this.reconnect().catch(() => undefined)
    let have = (await stat(this.partial).catch(() => null))?.size ?? 0
    if (have > this.spec.bytes) {
      await truncate(this.partial, 0)
      have = 0
    }
    await checkRoom(this.freeBytes, this.dir, this.spec.bytes - have)
    const controller = new AbortController()
    this.controller = controller
    try {
      if (have < this.spec.bytes) await this.receive(have, controller, onProgress)
      onProgress({ received: this.spec.bytes, total: this.spec.bytes, rate: 0 })
      await this.accept()
    } finally {
      // whatever stopped this try (a stall, an error, cancel) also closes the connection
      controller.abort()
      this.controller = null
    }
  }

  /** one request: append what the server sends to the partial file, which holds have bytes */
  private async receive(
    have: number,
    controller: AbortController,
    onProgress: (p: Progress) => void,
  ): Promise<void> {
    const res = await within(
      this.fetchImpl(this.spec.url, {
        headers: have > 0 ? { Range: 'bytes=' + have + '-' } : {},
        signal: controller.signal,
      }),
      this.idleMs,
    )
    // 206: the rest of the file; 200: the whole file (the server ignored Range)
    if (res.status === 200) have = 0
    else if (res.status === 404 || res.status === 410)
      throw new ModelError('똑딱AI 모델 파일을 찾지 못했어요 (HTTP ' + res.status + ').', {
        cause: await answerOf(res),
      })
    // anything else is tried again: GitHub's file servers now and then answer a resume
    // with 400 or 5xx, and the same request goes through a few seconds later
    else if (res.status !== 206 || have === 0)
      throw new Error('모델 서버가 잠시 받아 주지 않아요 (HTTP ' + res.status + ').', {
        cause: await answerOf(res),
      })
    else {
      // the part must start where ours ends, or appending it would spoil the file
      const start = /^bytes (\d+)-/.exec(res.headers.get('content-range') ?? '')
      if (start && Number(start[1]) !== have)
        throw new Error('모델 서버가 엉뚱한 위치부터 보냈어요.')
    }
    if (!res.body) throw new ModelError('똑딱AI 모델 파일을 받지 못했어요 (빈 응답).')
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const out = createWriteStream(this.partial, { flags: have > 0 ? 'a' : 'w' })
    const finished = new Promise<void>((resolve, reject) => {
      out.once('error', reject)
      out.once('finish', resolve)
    })
    // a write error is thrown where it is awaited, not reported as unhandled before that
    finished.catch(() => undefined)
    let received = have
    const window: { at: number; bytes: number }[] = [{ at: Date.now(), bytes: received }]
    let lastReport = 0
    try {
      for (;;) {
        // each read has its own deadline: a connection that stops sending is given up
        const { done, value: chunk } = await within(reader.read(), this.idleMs)
        if (done) break
        received += chunk.byteLength
        if (received > this.spec.bytes) throw new ModelError('모델 파일 크기가 맞지 않아요.')
        if (!out.write(chunk))
          await within(
            Promise.race([new Promise<void>((r) => out.once('drain', () => r())), finished]),
            this.idleMs,
          )
        const now = Date.now()
        if (now - lastReport >= 250) {
          lastReport = now
          window.push({ at: now, bytes: received })
          while (window.length > 2 && now - window[0].at > 5000) window.shift()
          const first = window[0]
          const rate = now > first.at ? ((received - first.bytes) * 1000) / (now - first.at) : 0
          onProgress({ received, total: this.spec.bytes, rate })
        }
      }
    } catch (err) {
      controller.abort()
      void reader.cancel().catch(() => undefined)
      throw err
    } finally {
      // what was written stays in the partial file for the next try
      out.end()
      await within(finished, this.idleMs)
    }
    // a connection that ended early: the next try resumes from here
    if (received !== this.spec.bytes) throw new Error('연결이 중간에 끊겼어요.')
  }

  /** a file the user downloaded by hand: copied in, then checked like a download */
  async importFile(source: string, onProgress: (p: Progress) => void): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await checkRoom(this.freeBytes, this.dir, this.spec.bytes)
    const out = createWriteStream(this.partial, { flags: 'w' })
    let received = 0
    let last = 0
    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(source)
      input.on('data', (chunk) => {
        received += chunk.length
        const now = Date.now()
        if (now - last >= 250) {
          last = now
          onProgress({ received, total: this.spec.bytes, rate: 0 })
        }
      })
      input.once('error', reject)
      out.once('error', reject)
      out.once('finish', resolve)
      input.pipe(out)
    })
    await this.accept()
  }

  /** stop a running download; the part already received stays for the next try */
  cancel(): void {
    this.controller?.abort()
  }

  private async accept(): Promise<void> {
    const actual = await sha256Of(this.partial)
    if (actual !== this.spec.sha256) {
      await rm(this.partial, { force: true })
      throw new ModelError('받은 모델 파일이 손상됐어요. 처음부터 다시 받아 주세요.')
    }
    await rm(this.record, { force: true })
    await rename(this.partial, this.path)
    await this.writeRecord()
  }

  private async writeRecord(): Promise<void> {
    const info = await stat(this.path)
    await writeFile(
      this.record,
      JSON.stringify({ sha256: this.spec.sha256, bytes: info.size, mtimeMs: info.mtimeMs }) + '\n',
    )
  }
}

async function checkRoom(
  freeBytes: (dir: string) => Promise<number>,
  dir: string,
  needed: number,
): Promise<void> {
  await mkdir(dir, { recursive: true })
  const free = await freeBytes(dir).catch(() => Number.POSITIVE_INFINITY)
  if (free < needed + SPARE_BYTES) {
    const gb = (n: number) => (n / 1e9).toFixed(1) + 'GB'
    throw new ModelError(
      '디스크 공간이 모자라요. ' +
        gb(needed + SPARE_BYTES) +
        ' 이상 비워 주세요 (지금 ' +
        gb(free) +
        ').',
    )
  }
}

export async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const block of createReadStream(path, { highWaterMark: 1 << 22 })) hash.update(block)
  return hash.digest('hex')
}

/** for the log: who answered a refused request, and how (the start of its body) */
async function answerOf(res: Response): Promise<string> {
  const text = await within(res.text(), 5000).catch(() => '')
  return (res.headers.get('server') ?? '?') + ': ' + text.replace(/\s+/g, ' ').slice(0, 300)
}

/** what the settings page and a waiting AI request see */
export type LocalAiModelState =
  | { state: 'checking'; ready: LocalAiRun[] }
  | { state: 'idle'; ready: LocalAiRun[] }
  | { state: 'downloading'; ready: LocalAiRun[]; received: number; total: number; rate: number }
  | { state: 'verifying'; ready: LocalAiRun[] }
  | { state: 'ready'; ready: LocalAiRun[] }
  | { state: 'failed'; ready: LocalAiRun[]; message: string; retrying: boolean }
type WithoutReady<T> = T extends unknown ? Omit<T, 'ready'> : never

/** what a request is told while its model is not usable yet */
export function notReadyMessage(state: LocalAiModelState): string {
  switch (state.state) {
    case 'downloading':
      return (
        '똑딱AI 모델을 처음 한 번 받는 중이에요 (' +
        Math.floor((state.received / Math.max(1, state.total)) * 100) +
        '%). 다 받으면 바로 쓸 수 있어요. 진행 상황은 설정 → AI에서 볼 수 있어요.'
      )
    case 'checking':
    case 'verifying':
      return '받은 똑딱AI 모델을 확인하는 중이에요. 잠시 뒤 다시 해 주세요.'
    case 'idle':
      return '똑딱AI 모델을 아직 받지 않았어요. 설정 → AI → 똑딱AI 모델에서 [받기]를 눌러 주세요.'
    case 'failed':
      return (
        '똑딱AI 모델을 아직 다 받지 못했어요. ' +
        state.message +
        ' 설정 → AI → 똑딱AI 모델에서 [다시 받기]나 [파일로 넣기]를 할 수 있어요.'
      )
    default:
      return '똑딱AI 모델이 아직 준비되지 않았어요. 잠시 뒤 다시 해 주세요.'
  }
}

/**
 * All of 똑딱AI's files: checked at launch, the missing ones downloaded in the list's order
 * (a run is usable as soon as its own files are in), and retried by themselves after a
 * dropped connection.
 */
export class LocalAiModels {
  private state: LocalAiModelState = { state: 'checking', ready: [] }
  private readonly stores: Map<LocalAiFileId, ModelFileStore>
  private readonly verified = new Set<LocalAiFileId>()
  private readonly listeners = new Set<(state: LocalAiModelState) => void>()
  private preparing: Promise<void> | null = null
  private checking: Promise<boolean> | null = null
  private later: ReturnType<typeof setTimeout> | null = null
  private stopping = false
  private readonly freeBytes: (dir: string) => Promise<number>
  private readonly retryWaitsMs: readonly number[]
  private readonly droppedRetryMs: number

  constructor(
    readonly dir: string,
    fetchImpl: Fetch,
    options: StoreOptions & {
      files?: readonly LocalAiModelFile[]
      retryWaitsMs?: readonly number[]
      droppedRetryMs?: number
    } = {},
  ) {
    const files = options.files ?? LOCAL_AI_MODEL_FILES
    this.stores = new Map(files.map((f) => [f.id, new ModelFileStore(dir, f, fetchImpl, options)]))
    this.freeBytes = options.freeBytes ?? statfsFree
    this.retryWaitsMs = options.retryWaitsMs ?? RETRY_WAITS_MS
    this.droppedRetryMs = options.droppedRetryMs ?? DROPPED_RETRY_MS
  }

  current(): LocalAiModelState {
    return this.state
  }

  onState(listener: (state: LocalAiModelState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** the runs whose files are all verified */
  readyRuns(): LocalAiRun[] {
    return (Object.keys(LOCAL_AI_RUNS) as LocalAiRun[]).filter((run) =>
      localAiRunFiles(run).every((id) => this.verified.has(id)),
    )
  }

  /** a ready run's model and adapters, or null while its files are not all here */
  pathsFor(run: LocalAiRun): { model: string; adapters: { name: string; path: string }[] } | null {
    if (!this.readyRuns().includes(run)) return null
    const { model, adapters } = LOCAL_AI_RUNS[run]
    const pathOf = (id: LocalAiFileId) => this.stores.get(id)!.path
    return {
      model: pathOf(model),
      adapters: adapters.map((name) => ({ name, path: pathOf(name) })),
    }
  }

  private set(state: WithoutReady<LocalAiModelState>): void {
    this.state = { ...state, ready: this.readyRuns() } as LocalAiModelState
    for (const listener of this.listeners) listener(this.state)
  }

  /** at launch and on [다시 받기]: check every file, download the missing ones */
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

  /** a download (or a check) is running */
  busy(): boolean {
    return this.preparing !== null || this.checking !== null
  }

  /**
   * Check the files already here, downloading nothing: true when all are in. Afterwards the
   * state is ready, or idle (some are missing) unless a download has started meanwhile.
   */
  check(): Promise<boolean> {
    this.checking ??= this.checkOnce().finally(() => {
      this.checking = null
    })
    return this.checking
  }

  private async checkOnce(): Promise<boolean> {
    if (this.state.state !== 'downloading') this.set({ state: 'checking' })
    for (const store of this.stores.values()) {
      if (this.verified.has(store.spec.id)) continue
      if (await store.ready().catch(() => false)) this.verified.add(store.spec.id)
    }
    const all = this.verified.size === this.stores.size
    if (all) {
      this.set({ state: 'ready' })
      await this.dropOldFiles()
    } else if (!this.preparing) this.set({ state: 'idle' })
    return all
  }

  private async prepareOnce(): Promise<void> {
    if (await this.check()) return
    this.set({ state: 'checking' })
    const missing = [...this.stores.values()].filter((s) => !this.verified.has(s.spec.id))
    const left = await Promise.all(missing.map((s) => s.missingBytes()))
    const total = missing.reduce((n, s) => n + s.spec.bytes, 0)
    let done = total - left.reduce((n, b) => n + b, 0)
    try {
      await checkRoom(this.freeBytes, this.dir, total - done)
    } catch (err) {
      this.set({ state: 'failed', message: (err as Error).message, retrying: false })
      return
    }
    for (const store of missing) {
      const before = store.spec.bytes - (await store.missingBytes())
      done -= before
      let received = before
      for (let attempt = 0; ; attempt++) {
        if (this.stopping) return
        const reached = received
        try {
          this.set({ state: 'downloading', received: done + received, total, rate: 0 })
          await store.download((p) => {
            received = p.received
            if (p.received >= p.total) this.set({ state: 'verifying' })
            else
              this.set({ state: 'downloading', received: done + p.received, total, rate: p.rate })
          })
          break
        } catch (err) {
          if (this.stopping) return
          console.warn(
            '[local-ai] model download try failed:',
            store.spec.file,
            received,
            String(err),
            err instanceof Error && err.cause ? String(err.cause) : '',
          )
          // a full disk or a damaged file will not mend itself; a dropped connection may
          if (err instanceof ModelError) {
            this.set({ state: 'failed', message: err.message, retrying: false })
            return
          }
          // a try that got further counts as a fresh start: only stalls in a row give up
          if (received > reached) attempt = -1
          if (attempt >= this.retryWaitsMs.length) {
            this.set({ state: 'failed', message: DROPPED, retrying: true })
            this.later = setTimeout(() => void this.prepare(), this.droppedRetryMs)
            return
          }
          await new Promise((r) => setTimeout(r, this.retryWaitsMs[Math.max(0, attempt)]))
        }
      }
      this.verified.add(store.spec.id)
      done += store.spec.bytes
    }
    this.set({ state: 'ready' })
    await this.dropOldFiles()
  }

  /**
   * [파일로 넣기]: files the user downloaded by hand (the model release's .gguf files), each
   * recognized by its size and checked by its SHA256 like a download
   */
  async importFiles(paths: string[]): Promise<void> {
    if (this.preparing)
      throw new Error('받는 중에는 파일로 넣을 수 없어요. 잠시 뒤 다시 해 주세요.')
    const bySize = new Map([...this.stores.values()].map((s) => [s.spec.bytes, s]))
    try {
      for (const path of paths) {
        const info = await stat(path).catch(() => null)
        const store = info?.isFile() ? bySize.get(info.size) : undefined
        if (!store) throw new ModelError('똑딱AI 모델 파일이 아니에요 (크기가 달라요): ' + path)
        await store.importFile(path, (p) =>
          this.set({ state: 'downloading', received: p.received, total: p.total, rate: 0 }),
        )
        this.verified.add(store.spec.id)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.set({ state: 'failed', message, retrying: false })
      throw err
    }
    await this.prepare()
  }

  /** files of an earlier model set (another name in the folder) go once this one is in */
  private async dropOldFiles(): Promise<void> {
    const keep = new Set<string>()
    for (const s of this.stores.values()) {
      keep.add(s.spec.file)
      keep.add(s.spec.file + '.verified.json')
    }
    const names = await readdir(this.dir, { recursive: true }).catch(() => [] as string[])
    for (const name of names) {
      const rel = String(name).split('\\').join('/')
      if (keep.has(rel) || !/\.(gguf|partial|json)$/.test(rel)) continue
      await rm(join(this.dir, rel), { force: true }).catch(() => undefined)
    }
  }

  stop(): void {
    this.stopping = true
    if (this.later) clearTimeout(this.later)
    this.later = null
    for (const store of this.stores.values()) store.cancel()
  }
}
