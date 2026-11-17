/**
 * Bundled, offline llama.cpp backend for all editor AI streams.
 * No account, network download or user-supplied executable path is involved.
 * The server listens only on 127.0.0.1, with a per-process bearer secret.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { availableParallelism } from 'node:os'
import { dirname, join, relative } from 'node:path'

export const LOCAL_AI_MODEL = 'qwen3.5-2b-local'
export type LocalAiEndpoint = { baseUrl: string; apiKey: string; model: string }

/**
 * 똑딱AI's per-feature adapters (LoRA), in the order llama-server numbers them. The first is
 * on for every request (the document adapter: 한글 editing, 생기부 and the rest); a feature with
 * an adapter of its own turns that one on instead, for its own requests only.
 */
export const LOCAL_AI_ADAPTERS = ['document', 'pumui'] as const
export type LocalAiAdapter = (typeof LOCAL_AI_ADAPTERS)[number]
type LocalAiFiles = {
  executable: string
  model: string
  /** the adapters found next to the model, in LOCAL_AI_ADAPTERS order; empty for a merged model */
  adapters: { name: LocalAiAdapter; path: string }[]
}

/** the adapters of a bundle: all of them, or none (a single merged model, as before 5세대) */
export function adapterFiles(dir: string): LocalAiFiles['adapters'] {
  const found = LOCAL_AI_ADAPTERS.map((name) => ({ name, path: join(dir, name + '.gguf') }))
  return found.every((a) => existsSync(a.path)) ? found : []
}

// Environment paths are developer-only overrides. Installer resources sit outside ASAR.
export function localAiFiles(): LocalAiFiles | null {
  const runtime =
    process.env.GENOFFICE_LOCAL_AI_RUNTIME ||
    join(
      process.resourcesPath,
      'local-ai',
      process.platform === 'win32' ? 'llama-server.exe' : 'llama-server',
    )
  const model =
    process.env.GENOFFICE_LOCAL_AI_MODEL || join(process.resourcesPath, 'local-ai', 'model.gguf')
  const adapters = adapterFiles(
    process.env.GENOFFICE_LOCAL_AI_ADAPTERS || join(dirname(model), 'adapters'),
  )
  return existsSync(runtime) && existsSync(model) ? { executable: runtime, model, adapters } : null
}

export function localAiAvailable(): boolean {
  return localAiFiles() !== null
}

let current: {
  process: ChildProcess
  endpoint: LocalAiEndpoint
  adapters: LocalAiAdapter[]
} | null = null
let starting: Promise<LocalAiEndpoint> | null = null
let startingChild: ChildProcess | null = null
let shuttingDown = false

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

/**
 * The server arguments that load the adapters: all at once, the first at full strength and
 * the rest off. Paths are given relative to the folder the server runs in, because the
 * FNAME:SCALE form cannot carry a Windows drive letter or a comma.
 */
export function adapterArgs(adapters: LocalAiFiles['adapters'], cwd: string): string[] {
  if (adapters.length === 0) return []
  return [
    '--lora-scaled',
    adapters.map((a, i) => relative(cwd, a.path) + ':' + (i === 0 ? 1 : 0)).join(','),
  ]
}

/**
 * The per-request adapter choice for a feature, for the running server: only that feature's
 * adapter on. Null when the feature has none (the default, the document adapter, stays on)
 * or the model is a single merged file.
 */
export function localAiLoraFor(
  feature: string | undefined,
  loaded: readonly string[] = current?.adapters ?? [],
): { id: number; scale: number }[] | null {
  const at = feature ? loaded.indexOf(feature) : -1
  if (at <= 0) return null
  return loaded.map((_, id) => ({ id, scale: id === at ? 1 : 0 }))
}

async function start(): Promise<LocalAiEndpoint> {
  if (shuttingDown) throw new Error('The local AI runtime is shutting down')
  const files = localAiFiles()
  if (!files)
    throw new Error(
      '똑딱AI(내장 AI) 파일을 찾지 못했습니다. 앱에 로컬 모델과 실행 파일을 포함해야 합니다.',
    )
  const port = await availablePort()
  const apiKey = randomBytes(32).toString('hex')
  const endpoint = { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey, model: LOCAL_AI_MODEL }
  // CPU-friendly first baseline. GPU offload can be opted into and benchmarked per device.
  const envThreads = Number(process.env.GENOFFICE_LOCAL_AI_THREADS)
  const threads =
    Number.isInteger(envThreads) && envThreads >= 1 && envThreads <= 16
      ? envThreads
      : Math.min(4, Math.max(1, availableParallelism() - 1))
  const gpu = Number(process.env.GENOFFICE_LOCAL_AI_GPU_LAYERS ?? 0)
  const layers = Number.isInteger(gpu) && gpu >= 0 && gpu <= 99 ? gpu : 0
  const cwd = dirname(files.model)
  const args = [
    '--model',
    files.model,
    '--alias',
    LOCAL_AI_MODEL,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--api-key',
    apiKey,
    '--no-webui',
    '--log-disable',
    '--ctx-size',
    '4096',
    '--parallel',
    '1',
    '--threads',
    String(threads),
    '--n-gpu-layers',
    String(layers),
    '--reasoning',
    'off',
    '--jinja',
    ...adapterArgs(files.adapters, cwd),
  ]
  const child = spawn(files.executable, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  startingChild = child
  // Consume pipe output so an error doesn't fill the child process's buffers.
  // Logs are disabled to keep private document text out of the app's diagnostic log.
  child.stdout?.resume()
  child.stderr?.resume()
  let error: Error | null = null
  child.once('error', (e) => {
    error = e
  })
  try {
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      if (shuttingDown) throw new Error('The local AI runtime is shutting down')
      if (error) throw error
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `똑딱AI 실행 파일이 종료되었습니다 (${child.exitCode ?? child.signalCode}).`,
        )
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(1500),
        })
        if (response.ok) {
          if (shuttingDown) throw new Error('The local AI runtime is shutting down')
          current = { process: child, endpoint, adapters: files.adapters.map((a) => a.name) }
          child.once('exit', () => {
            if (current?.process === child) current = null
          })
          return endpoint
        }
      } catch {
        /* expected until the model is loaded */
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    throw new Error('똑딱AI가 90초 안에 시작되지 않았습니다. 모델과 메모리를 확인해 주세요.')
  } finally {
    startingChild = null
    if (current?.process !== child) child.kill()
  }
}

export function ensureLocalAiRuntime(): Promise<LocalAiEndpoint> {
  if (shuttingDown) return Promise.reject(new Error('The local AI runtime is shutting down'))
  if (current && current.process.exitCode === null && current.process.signalCode === null) {
    return Promise.resolve(current.endpoint)
  }
  if (!starting)
    starting = start().finally(() => {
      starting = null
    })
  return starting
}

export function stopLocalAiRuntime(): void {
  shuttingDown = true
  startingChild?.kill()
  current?.process.kill()
  current = null
}
