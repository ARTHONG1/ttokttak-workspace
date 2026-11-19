import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ModelError, ModelStore, type Progress } from '../src/main/model-store'
import type { ModelSpec } from '../src/shared/model'

/** a 3 MB stand-in for the model, served with Range support (and a few failure modes) */
const DATA = randomBytes(3 * 1024 * 1024)
const SHA = createHash('sha256').update(DATA).digest('hex')
const ranges: (string | undefined)[] = []
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    ranges.push(req.headers.range)
    const path = req.url ?? '/'
    if (path === '/missing') return void res.writeHead(404).end()
    if (path === '/busy') return void res.writeHead(503).end()
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
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const spec = (path: string, sha = SHA): ModelSpec => ({
  name: 'test',
  bytes: DATA.length,
  sha256: sha,
  url: base + path,
  page: base,
})
const store = (path: string, opts: { sha?: string; free?: number } = {}) =>
  new ModelStore(
    mkdtempSync(join(tmpdir(), 'sgb-model-')),
    spec(path, opts.sha),
    (url, init) => fetch(url, init),
    async () => opts.free ?? Number.MAX_SAFE_INTEGER,
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

  it('throws away a damaged file', async () => {
    const s = store('/model', { sha: '0'.repeat(64) })
    await expect(s.download(() => undefined)).rejects.toBeInstanceOf(ModelError)
    expect(existsSync(s.path)).toBe(false)
    expect(existsSync(join(s.dir, 'model.gguf.partial'))).toBe(false)
  })

  it('tells a missing file (no retry) from a busy server (retry)', async () => {
    await expect(store('/missing').download(() => undefined)).rejects.toBeInstanceOf(ModelError)
    const busy = await store('/busy')
      .download(() => undefined)
      .catch((e: unknown) => e)
    expect(busy).toBeInstanceOf(Error)
    expect(busy).not.toBeInstanceOf(ModelError)
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
