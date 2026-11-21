import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LocalAi } from '../src/main/local-ai'
import { ModelError, ModelStore, type Progress } from '../src/main/model-store'
import type { ModelSpec } from '../src/shared/model'

/** a 3 MB stand-in for the model, served with Range support (and a few failure modes) */
const DATA = randomBytes(3 * 1024 * 1024)
const SHA = createHash('sha256').update(DATA).digest('hex')
const ranges: (string | undefined)[] = []
const stalled: import('node:http').ServerResponse[] = []
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    ranges.push(req.headers.range)
    const path = req.url ?? '/'
    if (path === '/missing') return void res.writeHead(404).end()
    if (path === '/busy') return void res.writeHead(503).end()
    if (path === '/refused') return void res.writeHead(400).end()
    // /badrange: answers a resume with a part that starts at the beginning of the file
    if (path === '/badrange' && req.headers.range) {
      res.writeHead(206, {
        'Content-Length': DATA.length,
        'Content-Range': 'bytes 0-' + (DATA.length - 1) + '/' + DATA.length,
      })
      return void res.end(DATA)
    }
    // /stall: half the file, then the connection stays open with nothing more (as a stuck
    // CDN connection does); /stall-once does that only to a request that is not a resume
    if (path === '/stall' || (path === '/stall-once' && !req.headers.range)) {
      res.writeHead(200, { 'Content-Length': DATA.length })
      res.write(DATA.subarray(0, DATA.length / 2))
      stalled.push(res)
      return
    }
    const range = /^bytes=(\d+)-$/.exec(req.headers.range ?? '')
    if (range && path !== '/norange') {
      const from = Number(range[1])
      res.writeHead(206, {
        'Content-Length': DATA.length - from,
        'Content-Range': 'bytes ' + from + '-' + (DATA.length - 1) + '/' + DATA.length,
      })
      return void res.end(DATA.subarray(from))
    }
    res.writeHead(200, { 'Content-Length': DATA.length })
    // /drop: half the file, then the connection goes away
    if (path === '/drop') {
      res.write(DATA.subarray(0, DATA.length / 2))
      setTimeout(() => res.destroy(), 50)
      return
    }
    res.end(DATA)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})
afterAll(() => {
  for (const res of stalled) res.destroy()
  return new Promise<void>((r) => server.close(() => r()))
})

const spec = (path: string, sha = SHA, file = 'model.gguf'): ModelSpec => ({
  file,
  bytes: DATA.length,
  sha256: sha,
  url: base + path,
})
const store = (path: string, opts: { sha?: string; free?: number } = {}) =>
  new ModelStore(
    mkdtempSync(join(tmpdir(), 'sgb-model-')),
    spec(path, opts.sha),
    (url, init) => fetch(url, init),
    { freeBytes: async () => opts.free ?? Number.MAX_SAFE_INTEGER, idleMs: 400 },
  )

describe('the model download', () => {
  it('downloads, checks the SHA256 and remembers the check', async () => {
    const s = store('/model')
    expect(await s.ready()).toBe(false)
    const seen: Progress[] = []
    await s.download((p) => seen.push(p))
    expect(readFileSync(s.path).equals(DATA)).toBe(true)
    expect(seen.at(-1)).toMatchObject({ received: DATA.length, total: DATA.length })
    expect(existsSync(join(s.dir, 'model.gguf.partial'))).toBe(false)
    expect(await s.ready()).toBe(true)
  })

  it('resumes from the part already received', async () => {
    const s = store('/model')
    const half = DATA.length / 2
    mkdirSync(s.dir, { recursive: true })
    writeFileSync(join(s.dir, 'model.gguf.partial'), DATA.subarray(0, half))
    ranges.length = 0
    await s.download(() => undefined)
    expect(ranges).toEqual(['bytes=' + half + '-'])
    expect(readFileSync(s.path).equals(DATA)).toBe(true)
  })

  it('starts over when the server sends the whole file instead', async () => {
    const s = store('/norange')
    mkdirSync(s.dir, { recursive: true })
    writeFileSync(join(s.dir, 'model.gguf.partial'), randomBytes(1000))
    await s.download(() => undefined)
    expect(readFileSync(s.path).equals(DATA)).toBe(true)
  })

  it('does not append a part that starts somewhere else', async () => {
    const s = store('/badrange')
    const half = DATA.length / 2
    const partial = join(s.dir, 'model.gguf.partial')
    mkdirSync(s.dir, { recursive: true })
    writeFileSync(partial, DATA.subarray(0, half))
    const err = await s.download(() => undefined).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ModelError)
    expect(readFileSync(partial).equals(DATA.subarray(0, half))).toBe(true)
  })

  it('keeps what a dropped connection delivered, and the next try finishes it', async () => {
    const s = store('/drop')
    const err = await s.download(() => undefined).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ModelError)
    const partial = join(s.dir, 'model.gguf.partial')
    expect(readFileSync(partial).length).toBeGreaterThan(0)
    const again = new ModelStore(s.dir, spec('/model'), (url, init) => fetch(url, init))
    await again.download(() => undefined)
    expect(readFileSync(again.path).equals(DATA)).toBe(true)
  })

  // [멈추기] or closing the app while a try is still getting ready (the folder, the free
  // room) once let that try go on and send its request anyway
  it('sends nothing once canceled while a try is still getting ready', async () => {
    let asked = 0
    const s = new ModelStore(
      mkdtempSync(join(tmpdir(), 'sgb-model-')),
      spec('/model'),
      (url, init) => {
        asked++
        return fetch(url, init)
      },
      { freeBytes: async () => Number.MAX_SAFE_INTEGER, idleMs: 400 },
    )
    const running = s.download(() => undefined).catch((e: unknown) => e)
    s.cancel()
    expect(await running).toBeInstanceOf(Error)
    expect(asked).toBe(0)
  })

  it('gives up on a connection that stops sending, keeping what came', async () => {
    const s = store('/stall')
    const started = Date.now()
    const err = await s.download(() => undefined).catch((e: unknown) => e)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ModelError)
    expect(readFileSync(join(s.dir, 'model.gguf.partial')).length).toBe(DATA.length / 2)
  })

  it('on a first launch, resumes by itself after a stalled connection', async () => {
    const s = store('/stall-once')
    const ai = new LocalAi(tmpdir(), { stores: [s] }, [0, 0])
    await ai.prepare()
    expect(readFileSync(s.path).equals(DATA)).toBe(true)
    // the model is in; only the (absent) server is missing in this test
    expect(ai.current()).toMatchObject({ state: 'missing' })
  })

  it("gets the base and the adapter, then lets 0.2's whole model go", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sgb-two-'))
    // 0.2's 똑딱AI 생기부 V7 B, verified, from before
    writeFileSync(join(dir, 'model.gguf'), DATA)
    writeFileSync(join(dir, 'model.gguf.verified.json'), '{}')
    const files = ['base.gguf', 'adapters/school_record.gguf'].map(
      (file) => new ModelStore(dir, spec('/model', SHA, file), (url, init) => fetch(url, init)),
    )
    const ai = new LocalAi(tmpdir(), { stores: files }, [0, 0])
    await ai.prepare()
    for (const s of files) expect(await s.ready()).toBe(true)
    expect(existsSync(join(dir, 'adapters', 'school_record.gguf'))).toBe(true)
    expect(existsSync(join(dir, 'model.gguf'))).toBe(false)
    expect(existsSync(join(dir, 'model.gguf.verified.json'))).toBe(false)
  })

  it("keeps 0.2's whole model while a new file is still missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sgb-two-'))
    writeFileSync(join(dir, 'model.gguf'), DATA)
    const files = [
      new ModelStore(dir, spec('/model', SHA, 'base.gguf'), (url, init) => fetch(url, init)),
      new ModelStore(dir, spec('/missing', SHA, 'adapters/school_record.gguf'), (url, init) =>
        fetch(url, init),
      ),
    ]
    const ai = new LocalAi(tmpdir(), { stores: files }, [0, 0])
    await ai.prepare()
    expect(ai.current()).toMatchObject({ state: 'download-failed' })
    expect(existsSync(join(dir, 'model.gguf'))).toBe(true)
  })

  it('throws away a damaged file', async () => {
    const s = store('/model', { sha: '0'.repeat(64) })
    await expect(s.download(() => undefined)).rejects.toBeInstanceOf(ModelError)
    expect(existsSync(s.path)).toBe(false)
    expect(existsSync(join(s.dir, 'model.gguf.partial'))).toBe(false)
  })

  it('tells a missing file (no retry) from a busy or refusing server (retry)', async () => {
    await expect(store('/missing').download(() => undefined)).rejects.toBeInstanceOf(ModelError)
    for (const path of ['/busy', '/refused']) {
      const err = await store(path)
        .download(() => undefined)
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(ModelError)
    }
  })

  it('stops before downloading onto a full disk', async () => {
    const s = store('/model', { free: 1000 })
    await expect(s.download(() => undefined)).rejects.toThrow(/디스크 공간/)
  })

  it('checks a changed file again instead of trusting the record', async () => {
    const s = store('/model')
    await s.download(() => undefined)
    const broken = Buffer.from(DATA)
    broken[0] ^= 0xff
    writeFileSync(s.path, broken)
    expect(await s.ready()).toBe(false)
  })
})

describe('파일로 넣기', () => {
  it('copies a downloaded-by-hand file in and checks it', async () => {
    const source = join(mkdtempSync(join(tmpdir(), 'sgb-src-')), 'model.gguf')
    writeFileSync(source, DATA)
    const s = store('/model')
    await s.importFile(source, () => undefined)
    expect(await s.ready()).toBe(true)
  })

  it('refuses a file of another size', async () => {
    const source = join(mkdtempSync(join(tmpdir(), 'sgb-src-')), 'other.gguf')
    writeFileSync(source, DATA.subarray(0, 100))
    await expect(store('/model').importFile(source, () => undefined)).rejects.toThrow(/크기/)
  })
})
