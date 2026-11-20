/**
 * One downloaded model file on this computer (userData/ai/<spec.file>): fetched once from the
 * model release, resumed where a download stopped (HTTP Range on <file>.partial), and
 * accepted only at the pinned size and SHA256. A verified file leaves a small record beside
 * it, so later launches check size and time instead of hashing 2 GB again.
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, statfs, truncate, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ModelSpec } from '../shared/model'

/** room left beside the model, so a full disk does not stop the computer */
const SPARE_BYTES = 300 * 1024 * 1024
/**
 * a connection that sends nothing for this long is dropped and resumed: a GitHub download of
 * the 2 GB file can stop mid-way with the connection still open, and would otherwise wait forever
 */
const IDLE_MS = 30_000

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

type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>

/** a problem a retry will not mend (a full disk, a damaged or wrong file, a missing release) */
export class ModelError extends Error {}

export class ModelStore {
  private controller: AbortController | null = null
  private readonly freeBytes: (dir: string) => Promise<number>
  private readonly idleMs: number
  private readonly reconnect: () => Promise<void>
  private tries = 0

  constructor(
    readonly dir: string,
    readonly spec: ModelSpec,
    private readonly fetchImpl: Fetch,
    options: {
      freeBytes?: (dir: string) => Promise<number>
      idleMs?: number
      /** drops the open connections, so a try after a failed one starts on a new one */
      reconnect?: () => Promise<void>
    } = {},
  ) {
    this.freeBytes =
      options.freeBytes ??
      (async (d) => {
        const s = await statfs(d)
        return Number(s.bavail) * Number(s.bsize)
      })
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

  /** the model is here and verified (by its record, or by hashing it once) */
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

  /** download (or finish downloading) the model; resolves once it is verified in place */
  async download(onProgress: (p: Progress) => void): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    // after a GitHub connection broke mid-file (ERR_HTTP2_PROTOCOL_ERROR), every request
    // sent on it again was answered with HTTP 400: each later try opens a new connection
    if (this.tries++ > 0) await this.reconnect().catch(() => undefined)
    const partial = this.partial
    let have = (await stat(partial).catch(() => null))?.size ?? 0
    if (have > this.spec.bytes) {
      await truncate(partial, 0)
      have = 0
    }
    await this.checkRoom(this.spec.bytes - have)
    const controller = new AbortController()
    this.controller = controller
    try {
      if (have < this.spec.bytes) await this.receive(partial, have, controller, onProgress)
      onProgress({ received: this.spec.bytes, total: this.spec.bytes, rate: 0 })
      await this.accept(partial)
    } finally {
      // whatever stopped this try (a stall, an error, cancel) also closes the connection
      controller.abort()
      this.controller = null
    }
  }

  /** one request: append what the server sends to partial, which holds `have` bytes */
  private async receive(
    partial: string,
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
      throw new ModelError('모델 파일을 찾지 못했어요 (HTTP ' + res.status + ').', {
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
    if (!res.body) throw new ModelError('모델 파일을 받지 못했어요 (빈 응답).')
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const out = createWriteStream(partial, { flags: have > 0 ? 'a' : 'w' })
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
      // what was written stays in partial for the next try
      out.end()
      await within(finished, this.idleMs)
    }
    // a connection that ended early: the next try resumes from here
    if (received !== this.spec.bytes) throw new Error('연결이 중간에 끊겼어요.')
  }

  /** a model file the teacher downloaded by hand: copied in, then checked like a download */
  async importFile(source: string, onProgress: (p: Progress) => void): Promise<void> {
    const info = await stat(source).catch(() => null)
    if (!info?.isFile()) throw new ModelError('고른 파일을 읽지 못했어요.')
    if (info.size !== this.spec.bytes)
      throw new ModelError('똑딱생기부의 모델 파일이 아니에요 (크기가 달라요).')
    await mkdir(dirname(this.path), { recursive: true })
    await this.checkRoom(this.spec.bytes)
    const partial = this.partial
    const out = createWriteStream(partial, { flags: 'w' })
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
    await this.accept(partial)
  }

  /** stop a running download; the part already received stays for the next try */
  cancel(): void {
    this.controller?.abort()
  }

  private async accept(partial: string): Promise<void> {
    const actual = await sha256Of(partial)
    if (actual !== this.spec.sha256) {
      await rm(partial, { force: true })
      throw new ModelError('받은 모델 파일이 손상됐어요. 처음부터 다시 받아 주세요.')
    }
    await rm(this.record, { force: true })
    await rename(partial, this.path)
    await this.writeRecord()
  }

  private async writeRecord(): Promise<void> {
    const info = await stat(this.path)
    await writeFile(
      this.record,
      JSON.stringify({ sha256: this.spec.sha256, bytes: info.size, mtimeMs: info.mtimeMs }) + '\n',
    )
  }

  private async checkRoom(needed: number): Promise<void> {
    const free = await this.freeBytes(this.dir).catch(() => Number.POSITIVE_INFINITY)
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
