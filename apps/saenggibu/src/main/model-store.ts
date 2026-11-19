/**
 * The downloaded model on this computer (userData/ai/model.gguf): fetched once from the app's
 * GitHub release, resumed where a download stopped (HTTP Range on model.gguf.partial), and
 * accepted only at the pinned size and SHA256. A verified file leaves a small record beside
 * it, so later launches check size and time instead of hashing 2 GB again.
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, statfs, truncate, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModelSpec } from '../shared/model'

export const MODEL_FILE = 'model.gguf'
const PARTIAL = MODEL_FILE + '.partial'
const RECORD = MODEL_FILE + '.verified.json'
/** room left beside the model, so a full disk does not stop the computer */
const SPARE_BYTES = 300 * 1024 * 1024
/** a connection that sends nothing for this long is dropped and tried again */
const IDLE_MS = 60_000

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

  constructor(
    readonly dir: string,
    readonly spec: ModelSpec,
    private readonly fetchImpl: Fetch,
    private readonly freeBytes: (dir: string) => Promise<number> = async (d) => {
      const s = await statfs(d)
      return Number(s.bavail) * Number(s.bsize)
    },
  ) {}

  get path(): string {
    return join(this.dir, MODEL_FILE)
  }

  /** the model is here and verified (by its record, or by hashing it once) */
  async ready(): Promise<boolean> {
    const info = await stat(this.path).catch(() => null)
    if (!info || info.size !== this.spec.bytes) return false
    const record = await readFile(join(this.dir, RECORD), 'utf8')
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
    await mkdir(this.dir, { recursive: true })
    const partial = join(this.dir, PARTIAL)
    let have = (await stat(partial).catch(() => null))?.size ?? 0
    if (have > this.spec.bytes) {
      await truncate(partial, 0)
      have = 0
    }
    await this.checkRoom(this.spec.bytes - have)
    this.controller = new AbortController()
    const signal = this.controller.signal
    let idle: ReturnType<typeof setTimeout> | undefined
    const awake = () => {
      clearTimeout(idle)
      idle = setTimeout(() => this.controller?.abort(new Error('응답 없음')), IDLE_MS)
    }
    try {
      if (have < this.spec.bytes) {
        awake()
        const res = await this.fetchImpl(this.spec.url, {
          headers: have > 0 ? { Range: 'bytes=' + have + '-' } : {},
          signal,
        })
        // 206: the rest of the file; 200: the whole file (the server ignored Range)
        if (res.status === 200) have = 0
        else if (res.status === 429 || res.status >= 500)
          throw new Error('모델 서버가 잠시 응답하지 않아요 (HTTP ' + res.status + ').')
        else if (res.status !== 206 || have === 0)
          throw new ModelError('모델 파일을 받지 못했어요 (HTTP ' + res.status + ').')
        if (!res.body) throw new ModelError('모델 파일을 받지 못했어요 (빈 응답).')
        const out = createWriteStream(partial, { flags: have > 0 ? 'a' : 'w' })
        const done = new Promise<void>((resolve, reject) => {
          out.once('error', reject)
          out.once('finish', resolve)
        })
        let received = have
        const window: { at: number; bytes: number }[] = [{ at: Date.now(), bytes: received }]
        let lastReport = 0
        try {
          for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            awake()
            received += chunk.byteLength
            if (received > this.spec.bytes) throw new ModelError('모델 파일 크기가 맞지 않아요.')
            if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()))
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
        } finally {
          out.end()
          await done
        }
        // a connection that ended early: the next try resumes from here
        if (received !== this.spec.bytes) throw new Error('연결이 중간에 끊겼어요.')
      }
      onProgress({ received: this.spec.bytes, total: this.spec.bytes, rate: 0 })
      await this.accept(partial)
    } finally {
      clearTimeout(idle)
      this.controller = null
    }
  }

  /** a model file the teacher downloaded by hand: copied in, then checked like a download */
  async importFile(source: string, onProgress: (p: Progress) => void): Promise<void> {
    const info = await stat(source).catch(() => null)
    if (!info?.isFile()) throw new ModelError('고른 파일을 읽지 못했어요.')
    if (info.size !== this.spec.bytes)
      throw new ModelError('똑딱생기부의 모델 파일이 아니에요 (크기가 달라요).')
    await mkdir(this.dir, { recursive: true })
    await this.checkRoom(this.spec.bytes)
    const partial = join(this.dir, PARTIAL)
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
    await rm(join(this.dir, RECORD), { force: true })
    await rename(partial, this.path)
    await this.writeRecord()
  }

  private async writeRecord(): Promise<void> {
    const info = await stat(this.path)
    await writeFile(
      join(this.dir, RECORD),
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
