import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPACT_SAMPLING,
  MAX_SYSTEM_BYTES,
  MAX_TURN_BYTES,
  TOO_LONG,
  askFailure,
  pickTurn,
  plainTurn,
} from '../src/main/ai-turn'
import { LocalAi, aiFiles, notReadyMessage, requestBody, serverArgs } from '../src/main/local-ai'
import { ModelStore } from '../src/main/model-store'
import { MODEL_BYTES, MODEL_FILES, RECORD_FORMAT } from '../src/shared/model'
import { COMPACT_SYSTEM } from '../src/renderer/src/record/record-core'

describe('the built-in 똑딱AI', () => {
  it('runs the base with the 생기부 adapter on, by paths inside the model folder', () => {
    const args = serverArgs(
      4321,
      'k',
      3,
      { slots: 1, gpuLayers: 0 },
      'base.gguf',
      'adapters/school_record.gguf',
    )
    const at = (flag: string) => args[args.indexOf(flag) + 1]
    expect(at('--model')).toBe('base.gguf')
    expect(at('--lora')).toBe('adapters/school_record.gguf')
    expect(at('--host')).toBe('127.0.0.1')
    expect(at('--ctx-size')).toBe('4096')
    expect(at('--n-gpu-layers')).toBe('0')
    expect(at('--reasoning')).toBe('off')
    expect(args).toContain('--log-disable')
    // four students at once on the GPU, each with a 4,096-token context of its own
    const gpu = serverArgs(4321, 'k', 3, { slots: 4, gpuLayers: 99 }, 'base.gguf')
    expect(gpu.slice(gpu.indexOf('--ctx-size'), gpu.indexOf('--ctx-size') + 4)).toEqual([
      '--ctx-size',
      '16384',
      '--parallel',
      '4',
    ])
    expect(gpu[gpu.indexOf('--n-gpu-layers') + 1]).toBe('99')
    // a development run on a single whole model file loads no adapter
    expect(serverArgs(1, 'k', 1, { slots: 1, gpuLayers: 0 }, 'other.gguf')).not.toContain('--lora')
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

  it('downloads the same base and 생기부 adapter as 똑딱작업실, from the shared model release', () => {
    expect(MODEL_FILES.map((f) => [f.file, f.bytes, f.sha256.slice(0, 16)])).toEqual([
      ['base.gguf', 2_012_012_800, '1b04acba82481755'],
      ['adapters/school_record.gguf', 149_294_368, 'c4b61189e93ca7ee'],
    ])
    expect(MODEL_BYTES).toBe(2_161_307_168)
    for (const f of MODEL_FILES)
      expect(f.url).toMatch(
        /^https:\/\/github\.com\/ARTHONG1\/ttokttak-workspace\/releases\/download\/model-20261120-2\//,
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
    // a rewording asked again after it came back word for word
    expect(requestBody('지시', '요청', { temperature: 0.7 })).toMatchObject({ temperature: 0.7 })
  })

  it("sends 똑딱AI's own request after its model answers, at the sampling it was measured with", () => {
    const body = requestBody('규칙', '요청', COMPACT_SAMPLING, undefined, [
      ['예시 요청', '예시 답'],
    ])
    expect(body).toMatchObject({ temperature: 0.3, top_k: 20, top_p: 0.9, dry_multiplier: 0.8 })
    expect(body.messages).toEqual([
      { role: 'system', content: '규칙' },
      { role: 'user', content: '예시 요청' },
      { role: 'assistant', content: '예시 답' },
      { role: 'user', content: '요청' },
    ])
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
      { ...MODEL_FILES[0], bytes: 10, url: 'http://127.0.0.1:9/model' },
      fetchImpl,
      { freeBytes: async () => Number.MAX_SAFE_INTEGER },
    )

  it('tries a dropped connection again, offers [다시 받기], and keeps trying by itself', async () => {
    let tries = 0
    const store = failing(async () => {
      tries++
      throw new TypeError('fetch failed')
    })
    const ai = new LocalAi(tmpdir(), { stores: [store] }, [0, 0], 30)
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
    const ai = new LocalAi(tmpdir(), { stores: [store] }, [0, 0])
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
    expect(plainTurn('지시', '관찰 기록')).toEqual({
      ok: true,
      system: '지시',
      text: '관찰 기록',
      examples: [],
    })
  })
  // clipping cut the observation's end and the closing instruction with nothing said
  it('refuses a request too long to fit beside the instructions, saying what to shorten', () => {
    const system = '가'.repeat(500)
    expect(plainTurn(system, '나'.repeat(5000))).toEqual({ ok: false, error: TOO_LONG })
    const fits = '나'.repeat(Math.floor((MAX_TURN_BYTES - bytes(system)) / 3))
    expect(plainTurn(system, fits)).toEqual({ ok: true, system, text: fits, examples: [] })
  })
  // a long note goes without the model answers rather than being refused for them
  it('takes the model answers that fit beside the request, and drops the rest', () => {
    const example = ['가'.repeat(400), '나'.repeat(400)] as const
    expect(plainTurn('규칙', '관찰', [example, example])).toMatchObject({
      ok: true,
      examples: [example, example],
    })
    const long = '다'.repeat(Math.floor((MAX_TURN_BYTES - 2000) / 3))
    expect(plainTurn('규칙', long, [example, example])).toMatchObject({ ok: true, examples: [] })
  })
  it('refuses instructions longer than its limit', () => {
    expect(plainTurn('가'.repeat(MAX_SYSTEM_BYTES), '')).toMatchObject({ ok: false })
  })
  // a whole-class run goes past a student whose notes are too long, and stops when the AI
  // itself fails (it stopped a class of 40 after five when two notes were too long)
  it("tells the page a request too long is that student's own, and an AI not ready is not", async () => {
    const ai = new LocalAi(tmpdir(), { file: join(tmpdir(), 'no-model.gguf') })
    expect(await ai.ask('a', '지시', '나'.repeat(5000)).catch(askFailure)).toEqual({
      ok: false,
      error: TOO_LONG,
      student: true,
    })
    const notReady = await ai.ask('b', '지시', '관찰 기록').catch(askFailure)
    expect(notReady).toMatchObject({ ok: false })
    expect(notReady).not.toHaveProperty('student')
  })
})
/**
 * 똑딱AI's short 생기부 format: the page sends a request in both forms and the main process picks
 * by what the pinned 생기부 adapter learned (shared/model.ts RECORD_FORMAT).
 */
describe('the form a 생기부 request goes in', () => {
  const request = {
    system: '긴 지시문',
    text: '요청',
    temperature: 0.7,
    compact: {
      system: COMPACT_SYSTEM,
      text: '[행동특성 및 종합의견] 분량: 3~4문장, 300자 안팎\n관찰:\n잘하는 점:\n- 성실함',
      examples: [['예시 요청', '예시 답']] as const,
    },
  }
  it('is the instructions and the request while the adapter learned those', () => {
    expect(pickTurn(request, 'instructions')).toEqual({
      system: '긴 지시문',
      text: '요청',
      examples: [],
      sampling: { temperature: 0.7 },
    })
  })
  it("is 똑딱AI's own request with its model answers, at the sampling it was measured with", () => {
    expect(pickTurn(request, 'compact')).toEqual({
      system: COMPACT_SYSTEM,
      text: request.compact.text,
      examples: request.compact.examples,
      sampling: COMPACT_SAMPLING,
    })
    const { compact: _compact, ...withoutShort } = request
    expect(pickTurn(withoutShort, 'compact')).toMatchObject({ system: '긴 지시문' })
  })
  // the mark goes with the adapter: a new adapter pinned without a thought for it fails here
  it("is 똑딱AI's own request for the adapter pinned today", () => {
    expect({ adapter: MODEL_FILES[1].sha256.slice(0, 16), format: RECORD_FORMAT }).toEqual({
      adapter: 'c4b61189e93ca7ee',
      format: 'compact',
    })
  })
})
