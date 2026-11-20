import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { LocalAiModels } from '../src/main/local-ai-model-store'

/**
 * The built-in AI server with a stand-in llama-server (a small Node script that records how
 * it was started and answers /health): one server with the base and all three adapters,
 * each request turning on its feature's adapter.
 */
const dir = mkdtempSync(join(tmpdir(), 'ddak-runtime-'))
const log = join(dir, 'starts.jsonl')
const server = join(dir, 'llama-server')
let runtime: typeof import('../src/main/local-ai-runtime')
let ready = true

beforeAll(async () => {
  writeFileSync(
    server,
    [
      '#!/usr/bin/env node',
      "const http = require('node:http'), fs = require('node:fs')",
      'const a = process.argv.slice(2), at = (f) => a[a.indexOf(f) + 1]',
      'fs.appendFileSync(process.env.FAKE_LLAMA_LOG, JSON.stringify({ pid: process.pid, cwd: process.cwd(), model: at("--model"), lora: a.includes("--lora-scaled") ? at("--lora-scaled") : null }) + "\\n")',
      'http.createServer((q, s) => s.end("{}")).listen(Number(at("--port")), "127.0.0.1")',
    ].join('\n'),
  )
  chmodSync(server, 0o755)
  process.env.GENOFFICE_LOCAL_AI_RUNTIME = server
  process.env.FAKE_LLAMA_LOG = log
  delete process.env.GENOFFICE_LOCAL_AI_MODEL
  vi.resetModules()
  runtime = await import('../src/main/local-ai-runtime')
  const models = {
    pathsFor: () =>
      ready
        ? {
            model: join(dir, 'base.gguf'),
            adapters: ['document', 'pumui', 'school_record'].map((name) => ({
              name,
              path: join(dir, 'adapters', name + '.gguf'),
            })),
          }
        : null,
    current: () => ({ state: 'downloading', ready: [], received: 1, total: 4, rate: 0 }),
    stop: () => undefined,
  }
  writeFileSync(join(dir, 'base.gguf'), 'x')
  runtime.useLocalAiModels(models as unknown as LocalAiModels)
})
afterAll(() => runtime.stopLocalAiRuntime())

const starts = () => {
  try {
    return readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { pid: number; cwd: string; model: string; lora: string | null })
  } catch {
    return []
  }
}

describe('the built-in AI server', () => {
  it('tells a request how far the download is while the files are not in, and starts nothing', async () => {
    ready = false
    await expect(runtime.acquireLocalAi('school_record')).rejects.toThrow(/받는 중이에요 \(25%\)/)
    expect(starts()).toHaveLength(0)
    ready = true
  })

  it('runs documents, 품의 and 생기부 on one server, each with its own adapter on', async () => {
    const [doc, pumui, school] = await Promise.all([
      runtime.acquireLocalAi(),
      runtime.acquireLocalAi('pumui'),
      runtime.acquireLocalAi('school_record'),
    ])
    expect(
      new Set([doc.endpoint.baseUrl, pumui.endpoint.baseUrl, school.endpoint.baseUrl]).size,
    ).toBe(1)
    expect(starts()).toHaveLength(1)
    // by file name, from the models folder (a user folder's name may have Korean letters)
    expect(starts()[0]).toMatchObject({
      model: 'base.gguf',
      lora: 'adapters/document.gguf:1,adapters/pumui.gguf:0,adapters/school_record.gguf:0',
    })
    expect(doc.lora).toEqual([
      { id: 0, scale: 1 },
      { id: 1, scale: 0 },
      { id: 2, scale: 0 },
    ])
    expect(pumui.lora).toEqual([
      { id: 0, scale: 0 },
      { id: 1, scale: 1 },
      { id: 2, scale: 0 },
    ])
    expect(school.lora).toEqual([
      { id: 0, scale: 0 },
      { id: 1, scale: 0 },
      { id: 2, scale: 1 },
    ])
    for (const held of [doc, pumui, school]) held.release()
    // a later request uses the same server
    const again = await runtime.acquireLocalAi('school_record')
    expect(starts()).toHaveLength(1)
    again.release()
  })
})
