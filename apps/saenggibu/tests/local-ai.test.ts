import { describe, expect, it } from 'vitest'
import { MAX_SYSTEM_BYTES, MAX_TURN_BYTES, plainTurn } from '../src/main/ai-turn'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODEL_FILE, aiFiles, requestBody, serverArgs } from '../src/main/local-ai'

describe('the built-in 똑딱AI', () => {
  it('runs the 생기부 V7 B model alone, by a path inside its own folder', () => {
    const args = serverArgs(4321, 'k', 3)
    const at = (flag: string) => args[args.indexOf(flag) + 1]
    expect(at('--model')).toBe(MODEL_FILE)
    expect(MODEL_FILE).toBe('model.gguf')
    expect(at('--host')).toBe('127.0.0.1')
    expect(at('--ctx-size')).toBe('4096')
    expect(at('--reasoning')).toBe('off')
    expect(args).toContain('--log-disable')
    // a whole model: no adapter to load or switch
    expect(args).not.toContain('--lora')
    expect(args).not.toContain('--lora-scaled')
  })

  it('finds the AI folder from the executable and the model alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'saenggibu-ai-'))
    expect(aiFiles(dir, 'darwin')).toBeNull()
    const ai = join(dir, 'local-ai')
    mkdirSync(ai)
    writeFileSync(join(ai, 'llama-server'), '')
    expect(aiFiles(dir, 'darwin')).toBeNull()
    writeFileSync(join(ai, MODEL_FILE), '')
    expect(aiFiles(dir, 'darwin')).toEqual({ dir: ai, executable: join(ai, 'llama-server') })
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
