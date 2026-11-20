import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { LocalAiRun } from '../src/main/local-ai-model-files'
import type { LocalAiModels } from '../src/main/local-ai-model-store'

/**
 * The server switch between 똑딱AI's runs, with a stand-in llama-server (a small Node script
 * that records how it was started and answers /health): a request holds its run, and a
 * request for the other run waits until it ends.
 */
const dir = mkdtempSync(join(tmpdir(), 'ddak-runtime-'))
const log = join(dir, 'starts.jsonl')
const server = join(dir, 'llama-server')
let runtime: typeof import('../src/main/local-ai-runtime')
const ready = new Set<LocalAiRun>(['main', 'school_record'])

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
    pathsFor: (run: LocalAiRun) =>
      !ready.has(run)
        ? null
        : run === 'main'
          ? {
              model: join(dir, 'base.gguf'),
              adapters: [
                { name: 'document', path: join(dir, 'adapters/document.gguf') },
                { name: 'pumui', path: join(dir, 'adapters/pumui.gguf') },
              ],
            }
          : { model: join(dir, 'school-record.gguf'), adapters: [] },
    current: () => ({ state: 'downloading', ready: [...ready], received: 1, total: 4, rate: 0 }),
    stop: () => undefined,
  }
  for (const f of ['base.gguf', 'school-record.gguf']) writeFileSync(join(dir, f), 'x')
  runtime.useLocalAiModels(models as unknown as LocalAiModels)
})
afterAll(() => runtime.stopLocalAiRuntime())

const starts = () =>
  readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { pid: number; cwd: string; model: string; lora: string | null })
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('the built-in AI server', () => {
  it('runs documents and 품의 on the base, by file name in its folder, with both adapters', async () => {
    const [a, b] = await Promise.all([runtime.acquireLocalAi('pumui'), runtime.acquireLocalAi()])
    expect(a.endpoint).toEqual(b.endpoint)
    expect(a.lora).toEqual([
      { id: 0, scale: 0 },
      { id: 1, scale: 1 },
    ])
    expect(b.lora).toBeNull()
    expect(starts()).toHaveLength(1)
    expect(starts()[0]).toMatchObject({
      model: 'base.gguf',
      lora: 'adapters/document.gguf:1,adapters/pumui.gguf:0',
    })
    expect(starts()[0].cwd.endsWith(dir.split('/').pop()!)).toBe(true)
    a.release()
    b.release()
  })

  it('switches to V7 B for 생기부 only once the requests on the base have ended', async () => {
    const doc = await runtime.acquireLocalAi()
    let switched = false
    const school = runtime.acquireLocalAi('school_record').then((held) => {
      switched = true
      return held
    })
    await new Promise((r) => setTimeout(r, 300))
    expect(switched).toBe(false)
    const basePid = starts().at(-1)!.pid
    doc.release()
    const held = await school
    expect(held.lora).toBeNull()
    expect(starts().at(-1)).toMatchObject({ model: 'school-record.gguf', lora: null })
    await new Promise((r) => setTimeout(r, 300))
    expect(alive(basePid)).toBe(false)
    held.release()
  })

  it('tells a request how far the download is when its run is not ready, and holds nothing', async () => {
    const running = starts().at(-1)!
    expect(running.model).toBe('school-record.gguf')
    ready.delete('main')
    await expect(runtime.acquireLocalAi('pumui')).rejects.toThrow(/받는 중이에요 \(25%\)/)
    // the 생기부 server kept running
    expect(alive(running.pid)).toBe(true)
    ready.add('main')
    // nothing was left held: the other run is not kept waiting
    const held = await runtime.acquireLocalAi('school_record')
    expect(starts().at(-1)!.pid).toBe(running.pid)
    held.release()
  })
})
