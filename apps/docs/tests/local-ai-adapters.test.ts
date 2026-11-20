import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LOCAL_AI_MODEL_FILES,
  LOCAL_AI_RUNS,
  localAiRunFiles,
  localAiRunFor,
} from '../src/main/local-ai-model-files'
import { adapterArgs, adapterFiles, localAiLoraFor } from '../src/main/local-ai-runtime'

/**
 * 똑딱AI: documents and 품의 run on the Qwen3.5-2B Q8_0 base with the document adapter on and
 * the 품의 adapter for 품의 requests; 생기부 runs on V7 B, a standalone model.
 */
describe('똑딱AI runs and adapters', () => {
  it('downloads the original files at their measured sizes and SHA256', () => {
    expect(LOCAL_AI_MODEL_FILES.map((f) => [f.id, f.bytes, f.sha256.slice(0, 8)])).toEqual([
      ['base', 2_012_012_800, '1b04acba'],
      ['document', 2_723_072, '76fac998'],
      ['pumui', 22_434_368, '7f430487'],
      ['school_record', 2_076_675_040, 'd31c9139'],
    ])
    for (const f of LOCAL_AI_MODEL_FILES) {
      expect(f.url).toMatch(
        /^https:\/\/github\.com\/ARTHONG1\/ttokttak-workspace\/releases\/download\/model-\d{8}\/[\w.-]+\.gguf$/,
      )
      // a release file must stay under GitHub's 2 GiB limit
      expect(f.bytes).toBeLessThan(2 ** 31)
    }
  })

  it('sends 생기부 to V7 B and everything else to the base', () => {
    expect(localAiRunFor('school_record')).toBe('school_record')
    expect(localAiRunFor('pumui')).toBe('main')
    expect(localAiRunFor(undefined)).toBe('main')
    expect(localAiRunFiles('main')).toEqual(['base', 'document', 'pumui'])
    expect(localAiRunFiles('school_record')).toEqual(['school_record'])
    expect(LOCAL_AI_RUNS.school_record.adapters).toEqual([])
  })

  it("finds a developer's adapters only when both are there", () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddak-adapters-'))
    expect(adapterFiles(dir)).toEqual([])
    writeFileSync(join(dir, 'document.gguf'), 'x')
    expect(adapterFiles(dir)).toEqual([])
    writeFileSync(join(dir, 'pumui.gguf'), 'x')
    expect(adapterFiles(dir).map((a) => a.name)).toEqual(['document', 'pumui'])
  })

  it('loads them relative to the server folder, the document adapter on and the 품의 one off', () => {
    const cwd = '/models'
    const adapters = [
      { name: 'document', path: cwd + '/adapters/document.gguf' },
      { name: 'pumui', path: cwd + '/adapters/pumui.gguf' },
    ]
    expect(adapterArgs(adapters, cwd)).toEqual([
      '--lora-scaled',
      'adapters/document.gguf:1,adapters/pumui.gguf:0',
    ])
    expect(adapterArgs([], cwd)).toEqual([])
  })

  it("turns on only the asking feature's adapter, and leaves the rest to the default", () => {
    const loaded = ['document', 'pumui']
    expect(localAiLoraFor('pumui', loaded)).toEqual([
      { id: 0, scale: 0 },
      { id: 1, scale: 1 },
    ])
    expect(localAiLoraFor('document', loaded)).toBeNull()
    expect(localAiLoraFor(undefined, loaded)).toBeNull()
    // V7 B is a standalone model: no adapters to choose
    expect(localAiLoraFor('school_record', [])).toBeNull()
  })
})
