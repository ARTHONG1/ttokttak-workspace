import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import {
  encodeNativeMessage,
  handleHostMessage,
  readNativeMessage,
  runEdufineHost,
} from '../src/edufine-host'

const endpoint = { protocol: 1, pid: 1, endpoint: '/tmp/x', token: 't' }

describe('edufine-host native messaging', () => {
  it('frames a message with a 4-byte little-endian length', async () => {
    const buf = encodeNativeMessage({ type: 'ping' })
    expect(buf.readUInt32LE(0)).toBe(buf.length - 4)
    const s = new PassThrough()
    s.end(buf)
    expect(await readNativeMessage(s)).toEqual({ type: 'ping' })
  })

  it('refuses a message over 1 MB and a cut message', async () => {
    const big = new PassThrough()
    const head = Buffer.alloc(4)
    head.writeUInt32LE(2 * 1024 * 1024, 0)
    big.end(head)
    await expect(readNativeMessage(big)).rejects.toThrow('too large')
    const cut = new PassThrough()
    cut.end(encodeNativeMessage({ type: 'take' }).subarray(0, 6))
    await expect(readNativeMessage(cut)).rejects.toThrow('incomplete')
  })

  it('answers ping and take from the running app', async () => {
    const asked: unknown[] = []
    const deps = {
      endpoint: () => endpoint,
      request: async (_e: unknown, req: unknown) => (asked.push(req), { text: '{"kind":"ttokttak.pumui"}' }),
      version: '0.15.0',
    }
    expect(await handleHostMessage({ type: 'ping' }, deps)).toEqual({ ok: true, version: '0.15.0' })
    expect(await handleHostMessage({ type: 'take' }, deps)).toEqual({ ok: true, text: '{"kind":"ttokttak.pumui"}' })
    expect(asked).toEqual([{ cmd: 'pumui-take' }])
  })

  it('says the app is off when it is not running or does not answer', async () => {
    const off = { endpoint: () => null, request: async () => ({}), version: '' }
    expect(await handleHostMessage({ type: 'take' }, off)).toEqual({
      ok: false,
      state: 'off',
      reason: '똑딱작업실이 켜져 있지 않아요.',
    })
    const broken = { endpoint: () => endpoint, request: async () => Promise.reject(new Error('pipe')), version: '' }
    expect(await handleHostMessage({ type: 'take' }, broken)).toMatchObject({ ok: false, state: 'off' })
    expect(await handleHostMessage({ type: 'rm' }, broken)).toEqual({ ok: false, state: 'off', reason: '알 수 없는 요청이에요.' })
  })

  it('runs one exchange over stdin and stdout', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const chunks: Buffer[] = []
    stdout.on('data', (c: Buffer) => chunks.push(c))
    stdin.end(encodeNativeMessage({ type: 'ping' }))
    await runEdufineHost(stdin, stdout, { endpoint: () => endpoint, request: async () => ({}), version: '1' })
    const out = Buffer.concat(chunks)
    expect(JSON.parse(out.subarray(4).toString('utf8'))).toEqual({ ok: true, version: '1' })
  })
})

