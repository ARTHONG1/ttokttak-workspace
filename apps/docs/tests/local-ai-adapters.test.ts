import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adapterArgs, adapterFiles, localAiLoraFor } from '../src/main/local-ai-runtime'

/**
 * 똑딱AI 5세대: one Q6_K base and per-feature adapters. The server loads them all with the
 * document adapter on; 품의서 생성 and 생기부 turn on their own adapter for their requests only.
 */
describe('똑딱AI adapters', () => {
  it('finds the bundle adapters only when all of them are there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddak-adapters-'))
    expect(adapterFiles(dir)).toEqual([])
    writeFileSync(join(dir, 'document.gguf'), 'x')
    expect(adapterFiles(dir)).toEqual([])
    writeFileSync(join(dir, 'pumui.gguf'), 'x')
    expect(adapterFiles(dir)).toEqual([])
    writeFileSync(join(dir, 'school_record.gguf'), 'x')
    expect(adapterFiles(dir).map((a) => a.name)).toEqual(['document', 'pumui', 'school_record'])
  })

  it('loads them relative to the server folder, the document adapter on and the rest off', () => {
    const cwd = '/app/Resources/local-ai'
    const adapters = [
      { name: 'document' as const, path: cwd + '/adapters/document.gguf' },
      { name: 'pumui' as const, path: cwd + '/adapters/pumui.gguf' },
      { name: 'school_record' as const, path: cwd + '/adapters/school_record.gguf' },
    ]
    expect(adapterArgs(adapters, cwd)).toEqual([
      '--lora-scaled',
      'adapters/document.gguf:1,adapters/pumui.gguf:0,adapters/school_record.gguf:0',
    ])
    expect(adapterArgs([], cwd)).toEqual([])
  })

  it("turns on only the asking feature's adapter, and leaves the rest to the default", () => {
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
    expect(localAiLoraFor('record', loaded)).toBeNull()
    expect(localAiLoraFor('document', loaded)).toBeNull()
    expect(localAiLoraFor(undefined, loaded)).toBeNull()
    // a single merged model (before 5세대) has no adapters to choose
    expect(localAiLoraFor('pumui', [])).toBeNull()
  })
})
