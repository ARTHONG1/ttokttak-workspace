import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LocalAiFileId, LocalAiModelFile } from '../src/main/local-ai-model-files'
import {
  LocalAiModels,
  ModelError,
  ModelFileStore,
  notReadyMessage,
  type Fetch,
  type LocalAiModelState,
} from '../src/main/local-ai-model-store'

/** small stand-ins for the four model files, served with Range support and a few failures */
const DATA: Record<LocalAiFileId, Buffer> = {
  base: randomBytes(3 * 1024 * 1024),
  document: randomBytes(64 * 1024),
  pumui: randomBytes(96 * 1024),
  school_record: randomBytes(2 * 1024 * 1024),
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const requests: { path: string; range?: string }[] = []
const stalled: ServerResponse[] = []
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const [path, mode] = (req.url ?? '/').split('?')
    requests.push({ path, range: req.headers.range })
    const data = DATA[path.slice(1) as LocalAiFileId]
    if (!data || mode === 'missing') return void res.writeHead(404).end()
    if (mode === 'busy') return void res.writeHead(503).end()
    if (mode === 'refused') return void res.writeHead(400).end('Bad Request')
    if (mode === 'stall') {
      res.writeHead(200, { 'Content-Length': data.length })
      res.write(data.subarray(0, data.length / 2))
      stalled.push(res)
      return
    }
    const range = /^bytes=(\d+)-$/.exec(req.headers.range ?? '')
    if (range && mode === 'badrange') {
      res.writeHead(206, { 'Content-Range': 'bytes 0-' + (data.length - 1) + '/' + data.length })
      return void res.end(data)
    }
    if (range && mode !== 'norange') {
      const from = Number(range[1])
      res.writeHead(206, {
        'Content-Length': data.length - from,
        'Content-Range': 'bytes ' + from + '-' + (data.length - 1) + '/' + data.length,
      })
      return void res.end(data.subarray(from))
    }
    res.writeHead(200, { 'Content-Length': data.length })
    res.end(data)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})
afterAll(() => {
  for (const res of stalled) res.destroy()
  return new Promise<void>((r) => server.close(() => r()))
})

const FILE_NAMES: Record<LocalAiFileId, string> = {
  base: 'base.gguf',
  document: 'adapters/document.gguf',
  pumui: 'adapters/pumui.gguf',
  school_record: 'adapters/school_record.gguf',
}
/** the four files as the app lists them, from the test server (mode: a failure for all) */
const files = (mode: Partial<Record<LocalAiFileId, string>> = {}): LocalAiModelFile[] =>
  (Object.keys(DATA) as LocalAiFileId[]).map((id) => ({
    id,
    file: FILE_NAMES[id],
    bytes: DATA[id].length,
    sha256: sha(DATA[id]),
    url: base + '/' + id + (mode[id] ? '?' + mode[id] : ''),
  }))
const fetchImpl: Fetch = (url, init) => fetch(url, init)
const scratch = () => mkdtempSync(join(tmpdir(), 'ddak-models-'))
const models = (
  dir: string,
  mode: Partial<Record<LocalAiFileId, string>> = {},
  opts: { free?: number; retryWaitsMs?: number[]; droppedRetryMs?: number } = {},
) =>
  new LocalAiModels(dir, fetchImpl, {
    files: files(mode),
    freeBytes: async () => opts.free ?? Number.MAX_SAFE_INTEGER,
    idleMs: 400,
    retryWaitsMs: opts.retryWaitsMs ?? [0, 0],
    droppedRetryMs: opts.droppedRetryMs ?? 60_000,
  })
const fileStore = (dir: string, id: LocalAiFileId, mode?: string) =>
  new ModelFileStore(
    dir,
    files(mode ? { [id]: mode } : {}).find((f) => f.id === id)!,
    fetchImpl,
    {
      freeBytes: async () => Number.MAX_SAFE_INTEGER,
      idleMs: 400,
    },
  )

describe("똑딱AI's model files", () => {
  it('downloads every file in order, and remembers the check', async () => {
    const dir = scratch()
    const m = models(dir)
    const seen: LocalAiModelState[] = []
    m.onState((s) => seen.push(s))
    requests.length = 0
    await m.prepare()
    expect(m.current()).toMatchObject({ state: 'ready', ready: ['main'] })
    expect(requests.map((r) => r.path)).toEqual(['/base', '/document', '/pumui', '/school_record'])
    for (const id of Object.keys(DATA) as LocalAiFileId[])
      expect(readFileSync(join(dir, FILE_NAMES[id])).equals(DATA[id])).toBe(true)
    // the one server needs all four files: it is usable once the last one is in
    const firstMain = seen.findIndex((s) => s.ready.includes('main'))
    expect(seen[firstMain - 1]?.state).not.toBe('ready')
    expect(m.pathsFor('main')).toEqual({
      model: join(dir, 'base.gguf'),
      adapters: [
        { name: 'document', path: join(dir, 'adapters/document.gguf') },
        { name: 'pumui', path: join(dir, 'adapters/pumui.gguf') },
        { name: 'school_record', path: join(dir, 'adapters/school_record.gguf') },
      ],
    })
    // a later launch checks the records and downloads nothing
    requests.length = 0
    const again = models(dir)
    expect(await again.check()).toBe(true)
    expect(again.current().state).toBe('ready')
    expect(requests).toEqual([])
  })

  it('says idle, downloading nothing, when the files are missing and no one asked for them', async () => {
    requests.length = 0
    const m = models(scratch())
    expect(await m.check()).toBe(false)
    expect(m.current()).toMatchObject({ state: 'idle', ready: [] })
    expect(requests).toEqual([])
    expect(notReadyMessage(m.current())).toMatch(/\[받기\]/)
  })

  it('resumes from the part already received', async () => {
    const dir = scratch()
    const half = DATA.base.length / 2
    writeFileSync(join(dir, 'base.gguf.partial'), DATA.base.subarray(0, half))
    requests.length = 0
    await fileStore(dir, 'base').download(() => undefined)
    expect(requests).toEqual([{ path: '/base', range: 'bytes=' + half + '-' }])
    expect(readFileSync(join(dir, 'base.gguf')).equals(DATA.base)).toBe(true)
  })

  it('starts over when the server sends the whole file instead', async () => {
    const dir = scratch()
    writeFileSync(join(dir, 'base.gguf.partial'), randomBytes(1000))
    await fileStore(dir, 'base', 'norange').download(() => undefined)
    expect(readFileSync(join(dir, 'base.gguf')).equals(DATA.base)).toBe(true)
  })

  it('does not append a part that starts somewhere else', async () => {
    const dir = scratch()
    const half = DATA.base.length / 2
    writeFileSync(join(dir, 'base.gguf.partial'), DATA.base.subarray(0, half))
    const err = await fileStore(dir, 'base', 'badrange')
      .download(() => undefined)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ModelError)
    expect(readFileSync(join(dir, 'base.gguf.partial')).equals(DATA.base.subarray(0, half))).toBe(
      true,
    )
  })

  it('gives up on a connection that stops sending, keeping what came', async () => {
    const dir = scratch()
    const started = Date.now()
    const err = await fileStore(dir, 'base', 'stall')
      .download(() => undefined)
      .catch((e: unknown) => e)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(err).not.toBeInstanceOf(ModelError)
    expect(readFileSync(join(dir, 'base.gguf.partial')).length).toBe(DATA.base.length / 2)
  })

  it('stops at a missing file, and keeps trying a busy or refusing server by itself', async () => {
    const gone = models(scratch(), { document: 'missing' })
    await gone.prepare()
    expect(gone.current()).toMatchObject({ state: 'failed', retrying: false })
    expect((gone.current() as { message: string }).message).toMatch(/404/)

    for (const mode of ['busy', 'refused']) {
      requests.length = 0
      const m = models(scratch(), { base: mode }, { droppedRetryMs: 30 })
      await m.prepare()
      expect(m.current()).toMatchObject({ state: 'failed', retrying: true })
      expect(requests.length).toBe(3)
      await new Promise((r) => setTimeout(r, 200))
      expect(requests.length).toBeGreaterThan(3)
      m.stop()
      const stopped = requests.length
      await new Promise((r) => setTimeout(r, 200))
      expect(requests.length).toBe(stopped)
    }
  })

  it('stops before downloading onto a full disk', async () => {
    requests.length = 0
    const m = models(scratch(), {}, { free: 10 })
    await m.prepare()
    expect(m.current()).toMatchObject({ state: 'failed', retrying: false })
    expect((m.current() as { message: string }).message).toMatch(/디스크 공간/)
    expect(requests).toEqual([])
  })

  it('takes files downloaded by hand, recognized by size and checked by SHA256', async () => {
    const dir = scratch()
    const hand = scratch()
    for (const id of Object.keys(DATA) as LocalAiFileId[])
      writeFileSync(join(hand, id + '.gguf'), DATA[id])
    const m = models(dir)
    await m.check()
    requests.length = 0
    await m.importFiles(
      (Object.keys(DATA) as LocalAiFileId[]).map((id) => join(hand, id + '.gguf')),
    )
    expect(m.current()).toMatchObject({ state: 'ready', ready: ['main'] })
    expect(requests).toEqual([])
    expect(readFileSync(join(dir, 'adapters/school_record.gguf')).equals(DATA.school_record)).toBe(
      true,
    )

    writeFileSync(join(hand, 'other.gguf'), randomBytes(1234))
    const other = models(scratch())
    await expect(other.importFiles([join(hand, 'other.gguf')])).rejects.toBeInstanceOf(ModelError)
    expect(other.current()).toMatchObject({ state: 'failed' })
  })

  it('checks a changed file again instead of trusting the record', async () => {
    const dir = scratch()
    await models(dir).prepare()
    const damaged = Buffer.from(DATA.pumui)
    damaged[0] ^= 0xff
    writeFileSync(join(dir, 'adapters/pumui.gguf'), damaged)
    const m = models(dir)
    expect(await m.check()).toBe(false)
    expect(m.current()).toMatchObject({ state: 'idle', ready: [] })
  })

  it('an update downloads only the new file, and drops the earlier set’s other files', async () => {
    const dir = scratch()
    // a 0.17 folder: the base and two adapters checked, 생기부 as a standalone model
    const earlier = new LocalAiModels(dir, fetchImpl, {
      files: files().filter((f) => f.id !== 'school_record'),
      freeBytes: async () => Number.MAX_SAFE_INTEGER,
      idleMs: 400,
    })
    await earlier.prepare()
    writeFileSync(join(dir, 'school-record.gguf'), 'the standalone V7 B')
    writeFileSync(join(dir, 'school-record.gguf.verified.json'), '{}')
    writeFileSync(join(dir, 'model.gguf'), 'old model')
    writeFileSync(join(dir, 'notes.txt'), 'mine')
    requests.length = 0
    await models(dir).prepare()
    expect(requests.map((r) => r.path)).toEqual(['/school_record'])
    expect(existsSync(join(dir, 'model.gguf'))).toBe(false)
    expect(existsSync(join(dir, 'school-record.gguf'))).toBe(false)
    expect(existsSync(join(dir, 'school-record.gguf.verified.json'))).toBe(false)
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true)
    expect(existsSync(join(dir, 'base.gguf'))).toBe(true)
    expect(existsSync(join(dir, 'adapters/school_record.gguf'))).toBe(true)
  })
})
