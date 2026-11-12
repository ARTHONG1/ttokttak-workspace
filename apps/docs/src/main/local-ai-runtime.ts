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
import { join } from 'node:path'

export const LOCAL_AI_MODEL = 'qwen3.5-2b-local'
export type LocalAiEndpoint = { baseUrl: string; apiKey: string; model: string }
type LocalAiFiles = { executable: string; model: string }

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
  return existsSync(runtime) && existsSync(model) ? { executable: runtime, model } : null
}

export function localAiAvailable(): boolean {
  return localAiFiles() !== null
}

let current: { process: ChildProcess; endpoint: LocalAiEndpoint } | null = null
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
  ]
  const child = spawn(files.executable, args, {
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
          current = { process: child, endpoint }
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
