/**
 * The built-in, offline llama.cpp backend for all editor AI streams. The server program ships
 * in the installer (resources/local-ai); 똑딱AI's model files are downloaded once into the
 * user's folder (local-ai-model-store.ts). No account or user-supplied executable is involved.
 * The server listens only on 127.0.0.1, with a per-process bearer secret.
 *
 * One server runs (local-ai-model-files.ts): 똑딱AI's base with all three adapters loaded
 * (documents, 품의, 생기부). Each request turns on only its feature's adapter (localAiLoraFor),
 * so documents, 품의 and 생기부 share the server without a restart. A request holds the server
 * until it ends (acquireLocalAi).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { availableParallelism } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { LOCAL_AI_RUNS, localAiRunFor, type LocalAiRun } from './local-ai-model-files'
import { notReadyMessage, type LocalAiModels } from './local-ai-model-store'

export const LOCAL_AI_MODEL = 'qwen3.5-2b-local'
export type LocalAiEndpoint = { baseUrl: string; apiKey: string; model: string }

/** the base run's adapters (LoRA), in the order llama-server numbers them */
export const LOCAL_AI_ADAPTERS = LOCAL_AI_RUNS.main.adapters
type Adapter = { name: string; path: string }
type LocalAiFiles = {
  executable: string
  model: string
  /** the run's adapters, in LOCAL_AI_RUNS order; empty for a standalone model */
  adapters: Adapter[]
}

/** the base run's adapters in a folder: all of them, or none (a single merged model) */
export function adapterFiles(dir: string): Adapter[] {
  const found = LOCAL_AI_ADAPTERS.map((name) => ({ name, path: join(dir, name + '.gguf') }))
  return found.every((a) => existsSync(a.path)) ? found : []
}

/** llama-server: in the installer outside ASAR, or a developer's (GENOFFICE_LOCAL_AI_RUNTIME) */
export function localAiExecutable(): string | null {
  const runtime =
    process.env.GENOFFICE_LOCAL_AI_RUNTIME ||
    join(
      process.resourcesPath ?? '',
      'local-ai',
      process.platform === 'win32' ? 'llama-server.exe' : 'llama-server',
    )
  return existsSync(runtime) ? runtime : null
}

let models: LocalAiModels | null = null

/** the downloaded model files this process uses (set once at launch on an installed app) */
export function useLocalAiModels(next: LocalAiModels | null): void {
  models = next
}

/**
 * A developer's fixed model (GENOFFICE_LOCAL_AI_MODEL, with the adapters beside it in
 * adapters/ or GENOFFICE_LOCAL_AI_ADAPTERS), instead of the downloaded files.
 */
function developerFiles(): { model: string; adapters: Adapter[] } | null {
  const model = process.env.GENOFFICE_LOCAL_AI_MODEL
  if (!model) return null
  return {
    model,
    adapters: adapterFiles(
      process.env.GENOFFICE_LOCAL_AI_ADAPTERS || join(dirname(model), 'adapters'),
    ),
  }
}

export function localAiFiles(run: LocalAiRun = 'main'): LocalAiFiles | null {
  const executable = localAiExecutable()
  if (!executable) return null
  const files = developerFiles() ?? models?.pathsFor(run) ?? null
  return files && existsSync(files.model) ? { executable, ...files } : null
}

/**
 * This installation runs the built-in AI: its server is in the app, and the model files are
 * here or being downloaded. Requests made before the download ends are told how far it is.
 */
export function localAiAvailable(): boolean {
  return localAiExecutable() !== null && (models !== null || !!process.env.GENOFFICE_LOCAL_AI_MODEL)
}

let current: {
  process: ChildProcess
  endpoint: LocalAiEndpoint
  run: LocalAiRun
  adapters: string[]
} | null = null
let starting: { run: LocalAiRun; promise: Promise<LocalAiEndpoint> } | null = null
let startingChild: ChildProcess | null = null
let shuttingDown = false
/** requests holding the server's run, and that run */
let holders = 0
let heldRun: LocalAiRun | null = null
const waiting: (() => void)[] = []

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
export function adapterArgs(adapters: Adapter[], cwd: string): string[] {
  if (adapters.length === 0) return []
  return [
    '--lora-scaled',
    adapters.map((a, i) => relative(cwd, a.path) + ':' + (i === 0 ? 1 : 0)).join(','),
  ]
}

/**
 * The per-request adapter choice for a feature, for the running server: only that feature's
 * adapter on, every loaded adapter named (the model project's rule: a request never relies on
 * what an earlier one left on). A feature without its own adapter gets the document adapter.
 * Null only when no adapters are loaded (a developer's single merged model).
 */
export function localAiLoraFor(
  feature: string | undefined,
  loaded: readonly string[] = current?.adapters ?? [],
): { id: number; scale: number }[] | null {
  if (loaded.length === 0) return null
  const at = Math.max(0, feature ? loaded.indexOf(feature) : 0)
  return loaded.map((_, id) => ({ id, scale: id === at ? 1 : 0 }))
}

function missingMessage(): string {
  return models
    ? notReadyMessage(models.current())
    : '똑딱AI(내장 AI) 파일을 찾지 못했습니다. 앱을 다시 설치해 주세요.'
}

async function start(run: LocalAiRun): Promise<LocalAiEndpoint> {
  if (shuttingDown) throw new Error('The local AI runtime is shutting down')
  const files = localAiFiles(run)
  if (!files) throw new Error(missingMessage())
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
  // the server runs in the model's folder and is given the file by its name: the folder is
  // in the user's profile, whose name may have Korean letters the server could not open
  const cwd = dirname(files.model)
  const args = [
    '--model',
    basename(files.model),
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
          current = { process: child, endpoint, run, adapters: files.adapters.map((a) => a.name) }
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

function alive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

/** the server for a run: running, being started, or started now (the other run's stops) */
function ensureRun(run: LocalAiRun): Promise<LocalAiEndpoint> {
  if (shuttingDown) return Promise.reject(new Error('The local AI runtime is shutting down'))
  if (current && current.run === run && alive(current.process))
    return Promise.resolve(current.endpoint)
  if (starting?.run === run) return starting.promise
  if (starting) return starting.promise.catch(() => undefined).then(() => ensureRun(run))
  // a run whose files are not in yet stops nothing: the other run's server stays up
  if (!localAiFiles(run)) return Promise.reject(new Error(missingMessage()))
  // no request holds the other run here (acquireLocalAi waits for them), so it can go
  if (current) {
    current.process.kill()
    current = null
  }
  const promise = start(run).finally(() => {
    if (starting?.promise === promise) starting = null
  })
  starting = { run, promise }
  return promise
}

/**
 * A request's hold on the server for its feature's run, with the adapters to turn on for it.
 * release() when the request ends: a request for the other run waits until then.
 */
export async function acquireLocalAi(feature?: string): Promise<{
  endpoint: LocalAiEndpoint
  lora: { id: number; scale: number }[] | null
  release: () => void
}> {
  const run = localAiRunFor(feature)
  while (holders > 0 && heldRun !== run) await new Promise<void>((r) => waiting.push(r))
  heldRun = run
  holders++
  let released = false
  const release = () => {
    if (released) return
    released = true
    holders--
    if (holders > 0) return
    heldRun = null
    for (const wake of waiting.splice(0)) wake()
  }
  try {
    const endpoint = await ensureRun(run)
    return { endpoint, lora: localAiLoraFor(feature, current?.adapters ?? []), release }
  } catch (err) {
    release()
    throw err
  }
}

export function stopLocalAiRuntime(): void {
  shuttingDown = true
  models?.stop()
  startingChild?.kill()
  current?.process.kill()
  current = null
}
