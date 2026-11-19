import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_SYSTEM_BYTES, MAX_TURN_BYTES, plainTurn } from '../src/main/ai-turn'
import { LocalAi, aiFiles, notReadyMessage, requestBody, serverArgs } from '../src/main/local-ai'
import { ModelStore } from '../src/main/model-store'
import { MODEL } from '../src/shared/model'

describe('the built-in 똑딱AI', () => {
  it('runs the 생기부 V7 B model alone, by its bare file name', () => {
    const args = serverArgs(4321, 'k', 3)
    const at = (flag: string) => args[args.indexOf(flag) + 1]
    expect(at('--model')).toBe('model.gguf')
    expect(serverArgs(1, 'k', 1, 'v7b.gguf')[1]).toBe('v7b.gguf')
    expect(at('--host')).toBe('127.0.0.1')
    expect(at('--ctx-size')).toBe('4096')
    expect(at('--reasoning')).toBe('off')
    expect(args).toContain('--log-disable')
    // a whole model: no adapter to load or switch
    expect(args).not.toContain('--lora')
    expect(args).not.toContain('--lora-scaled')
  })

  it('finds the server in the app; the model is no longer part of it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'saenggibu-ai-'))
    expect(aiFiles(dir, 'darwin')).toBeNull()
    const ai = join(dir, 'local-ai')
    mkdirSync(ai)
    writeFileSync(join(ai, 'llama-server'), '')
    expect(aiFiles(dir, 'darwin')).toEqual({ dir: ai, executable: join(ai, 'llama-server') })
    expect(aiFiles(dir, 'win32')).toBeNull()
  })

  it('downloads V7 B at its measured size and SHA256 from the app repository', () => {
    expect(MODEL).toMatchObject({
      bytes: 2_076_675_040,
      sha256: 'd31c913928eea57ca2d1bfb2a0a158dcb48ef2b4c6bae6dede91cdd7457d0fdf',
    })
    expect(MODEL.url).toMatch(
      /^https:\/\/github\.com\/ARTHONG1\/ttokttak-saenggibu\/releases\/download\//,
    )
  })

  it('asks at the settings the model was measured with', () => {
    expect(requestBody('지시', '요청')).toMatchObject({
      temperature: 0,
      max_tokens: 1024,
      stream: false,
      messages: [
        { role: 'system', content: '지시' },
        { role: 'user', content: '요청' },
      ],
    })
  })

  it('tells a writing request how far the download is', () => {
    expect(notReadyMessage({ state: 'downloading', received: 37, total: 100, rate: 0 })).toContain(
      '37%',
    )
    expect(notReadyMessage({ state: 'download-failed', message: 'x' })).toContain('다시 받기')
  })
})

describe('the first launch', () => {
  const failing = (fetchImpl: () => Promise<Response>) =>
    new ModelStore(
      mkdtempSync(join(tmpdir(), 'saenggibu-model-')),
      { ...MODEL, bytes: 10, url: 'http://127.0.0.1:9/model' },
      fetchImpl,
      { freeBytes: async () => Number.MAX_SAFE_INTEGER },
    )

  it('tries a dropped connection again, offers [다시 받기], and keeps trying by itself', async () => {
    let tries = 0
    const store = failing(async () => {
      tries++
      throw new TypeError('fetch failed')
    })
    const ai = new LocalAi(tmpdir(), { store }, [0, 0], 30)
    await ai.prepare()
    expect(tries).toBe(3)
    expect(ai.current()).toMatchObject({ state: 'download-failed' })
    await expect(ai.ensure()).rejects.toThrow(/다시 받기/)
    // the lid opened, the Wi-Fi came back: the next round starts without a click
    await new Promise((r) => setTimeout(r, 200))
    expect(tries).toBeGreaterThan(3)
    ai.stop()
    const stopped = tries
    await new Promise((r) => setTimeout(r, 200))
    expect(tries).toBe(stopped)
  })

  it('does not retry a release file that is not there', async () => {
    let tries = 0
    const store = failing(async () => {
      tries++
      return new Response(null, { status: 404 })
    })
    const ai = new LocalAi(tmpdir(), { store }, [0, 0])
    await ai.prepare()
    expect(tries).toBe(1)
    expect(ai.current()).toMatchObject({
      state: 'download-failed',
      message: expect.stringMatching(/404/),
    })
  })
})

describe('one writing turn', () => {
  const bytes = (s: string) => Buffer.byteLength(s, 'utf8')
  it('goes as it is when it fits', () => {
    expect(plainTurn('지시', '관찰 기록')).toEqual({ ok: true, system: '지시', text: '관찰 기록' })
  })
  it('clips a long request to what fits beside the instructions', () => {
    const system = '가'.repeat(500)
    const out = plainTurn(system, '나'.repeat(5000))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.system).toBe(system)
    expect(bytes(out.system) + bytes(out.text)).toBeLessThanOrEqual(MAX_TURN_BYTES)
    expect(out.text.length).toBeGreaterThan(1000)
  })
  it('refuses instructions longer than its limit', () => {
    expect(plainTurn('가'.repeat(MAX_SYSTEM_BYTES), '')).toMatchObject({ ok: false })
  })
})
