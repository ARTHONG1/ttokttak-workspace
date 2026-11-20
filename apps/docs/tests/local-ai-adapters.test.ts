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
 * 똑딱AI (sixth generation): one Q8_0 base and one adapter per feature in one server; a
 * request turns on its feature's adapter only (documents by default, 품의, 생기부).
 */
describe('똑딱AI: one base, an adapter per feature', () => {
  it('downloads the registered files at their measured sizes and SHA256', () => {
    expect(LOCAL_AI_MODEL_FILES.map((f) => [f.id, f.bytes, f.sha256.slice(0, 8)])).toEqual([
      ['base', 2_012_012_800, '1b04acba'],
      ['document', 2_723_072, '76fac998'],
      ['pumui', 22_434_368, '7f430487'],
      ['school_record', 149_294_368, 'c4b61189'],
    ])
    for (const f of LOCAL_AI_MODEL_FILES) {
      expect(f.url).toMatch(
        /^https:\/\/github\.com\/ARTHONG1\/ttokttak-workspace\/releases\/download\/model-\d{8}(-\d+)?\/[\w.-]+\.gguf$/,
      )
      // a release file must stay under GitHub's 2 GiB limit
      expect(f.bytes).toBeLessThan(2 ** 31)
    }
  })

  it('sends every feature to the one server with all three adapters', () => {
    expect(localAiRunFor('school_record')).toBe('main')
    expect(localAiRunFor('pumui')).toBe('main')
    expect(localAiRunFor(undefined)).toBe('main')
    expect(Object.keys(LOCAL_AI_RUNS)).toEqual(['main'])
    expect(localAiRunFiles('main')).toEqual(['base', 'document', 'pumui', 'school_record'])
  })

  it("finds a developer's adapters only when all of them are there", () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddak-adapters-'))
    expect(adapterFiles(dir)).toEqual([])
    writeFileSync(join(dir, 'document.gguf'), 'x')
    writeFileSync(join(dir, 'pumui.gguf'), 'x')
    expect(adapterFiles(dir)).toEqual([])
    writeFileSync(join(dir, 'school_record.gguf'), 'x')
    expect(adapterFiles(dir).map((a) => a.name)).toEqual(['document', 'pumui', 'school_record'])
  })

  it('loads them relative to the server folder, the document adapter on and the rest off', () => {
    const cwd = '/models'
    const adapters = ['document', 'pumui', 'school_record'].map((name) => ({
      name,
      path: cwd + '/adapters/' + name + '.gguf',
    }))
    expect(adapterArgs(adapters, cwd)).toEqual([
      '--lora-scaled',
      'adapters/document.gguf:1,adapters/pumui.gguf:0,adapters/school_record.gguf:0',
    ])
    expect(adapterArgs([], cwd)).toEqual([])
  })

  it("turns on only the asking feature's adapter and names every adapter in each request", () => {
    const loaded = ['document', 'pumui', 'school_record']
    expect(localAiLoraFor('pumui', loaded)).toEqual([
      { id: 0, scale: 0 },
      { id: 1, scale: 1 },
      { id: 2, scale: 0 },
    ])
    expect(localAiLoraFor('school_record', loaded)).toEqual([
      { id: 0, scale: 0 },
      { id: 1, scale: 0 },
      { id: 2, scale: 1 },
    ])
    const document = [
      { id: 0, scale: 1 },
      { id: 1, scale: 0 },
      { id: 2, scale: 0 },
    ]
    expect(localAiLoraFor('document', loaded)).toEqual(document)
    expect(localAiLoraFor(undefined, loaded)).toEqual(document)
    expect(localAiLoraFor('hwpx', loaded)).toEqual(document)
    // a developer's single merged model has no adapters to name
    expect(localAiLoraFor('pumui', [])).toBeNull()
  })
})
