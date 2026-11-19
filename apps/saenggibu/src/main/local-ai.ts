/**
 * The built-in 똑딱AI: llama.cpp's llama-server on 127.0.0.1 with a per-run key and the
 * 똑딱AI 생기부 V7 B model (school-record-v7-b), a whole Q8_0 model with no adapter: the file
 * the model project measured on its 80 생기부 dev prompts, and every request goes at
 * temperature 0 as there.
 * Nothing leaves this computer; the server's logs are off so no student text is written out.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'
import type { AiState } from '../shared/api'
import { MAX_ANSWER_TOKENS, plainTurn } from './ai-turn'

export const AI_MODEL = 'ttokttak-saenggibu'
/** inside the AI folder, as the server (started there) sees it */
export const MODEL_FILE = 'model.gguf'

export interface AiFiles {
  dir: string
  executable: string
}

/** the bundled AI folder (Resources/local-ai), or SAENGGIBU_AI_DIR for a development run */
export function aiFiles(resourcesPath: string, platform = process.platform): AiFiles | null {
  const dir = process.env.SAENGGIBU_AI_DIR || join(resourcesPath, 'local-ai')
  const executable = join(dir, platform === 'win32' ? 'llama-server.exe' : 'llama-server')
  const all = [executable, join(dir, MODEL_FILE)]
  return all.every((p) => existsSync(p)) ? { dir, executable } : null
}

/**
 * The server's arguments. The model goes by its path relative to the AI folder, where the
 * server runs: a Windows profile folder with Korean letters stays out of it.
 */
export function serverArgs(port: number, apiKey: string, threads: number): string[] {
  return [
    '--model',
    MODEL_FILE,
    '--alias',
    AI_MODEL,
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
    '0',
    '--reasoning',
    'off',
    '--jinja',
  ]
}

/** the request body of one 생기부 turn: the model's measured settings */
export function requestBody(system: string, text: string): Record<string, unknown> {
  return {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
    temperature: 0,
    max_tokens: MAX_ANSWER_TOKENS,
    stream: false,
  }
}

function freePort(): Promise<number> {
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

type Endpoint = { url: string; key: string }

export class LocalAi {
  private state: AiState = { state: 'off' }
  private child: ChildProcess | null = null
  private endpoint: Endpoint | null = null
  private starting: Promise<Endpoint> | null = null
  private stopping = false
  private readonly listeners = new Set<(state: AiState) => void>()
  private readonly running = new Map<string, AbortController>()

  constructor(private readonly resourcesPath: string) {}

  current(): AiState {
    return this.state
  }

  onState(listener: (state: AiState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(state: AiState): void {
    this.state = state
    for (const l of this.listeners) l(state)
  }

  /** start the server (once); the first answer waits for it */
  ensure(): Promise<Endpoint> {
    if (this.endpoint && this.child && this.child.exitCode === null) {
      return Promise.resolve(this.endpoint)
    }
    this.starting ??= this.start().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async start(): Promise<Endpoint> {
    if (this.stopping) throw new Error('똑딱생기부를 닫는 중이에요.')
    const files = aiFiles(this.resourcesPath)
    if (!files) {
      this.set({ state: 'missing' })
      throw new Error('똑딱AI 파일을 찾지 못했어요. 똑딱생기부를 다시 설치해 주세요.')
    }
    this.set({ state: 'starting' })
    const port = await freePort()
    const key = randomBytes(32).toString('hex')
    const threads = Math.min(4, Math.max(1, availableParallelism() - 1))
    const child = spawn(files.executable, serverArgs(port, key, threads), {
      cwd: files.dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout?.resume()
    child.stderr?.resume()
    let error: Error | null = null
    child.once('error', (e) => {
      error = e
    })
    const endpoint = { url: `http://127.0.0.1:${port}`, key }
    const deadline = Date.now() + 120_000
    try {
      while (Date.now() < deadline) {
        if (this.stopping) throw new Error('똑딱생기부를 닫는 중이에요.')
        if (error) throw error
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error(
            '똑딱AI 실행 파일이 멈췄어요 (' + (child.exitCode ?? child.signalCode) + ').',
          )
        try {
          const res = await fetch(endpoint.url + '/health', {
            headers: { Authorization: 'Bearer ' + key },
            signal: AbortSignal.timeout(1500),
          })
          if (res.ok) {
            this.child = child
            this.endpoint = endpoint
            child.once('exit', () => {
              if (this.child === child) {
                this.child = null
                this.endpoint = null
                if (!this.stopping) this.set({ state: 'off' })
              }
            })
            this.set({ state: 'ready' })
            return endpoint
          }
        } catch {
          /* expected until the model is loaded */
        }
        await new Promise((r) => setTimeout(r, 400))
      }
      throw new Error('똑딱AI가 2분 안에 준비되지 않았어요. 메모리를 확인해 주세요.')
    } catch (err) {
      child.kill()
      const message = err instanceof Error ? err.message : String(err)
      this.set({ state: 'failed', message })
      throw err
    }
  }

  /** one answer: the page's instructions and request, at the model's measured settings */
  async ask(requestId: string, system: string, text: string): Promise<string> {
    const turn = plainTurn(system, text)
    if (!turn.ok) throw new Error(turn.error)
    const endpoint = await this.ensure()
    const controller = new AbortController()
    this.running.set(requestId, controller)
    try {
      const res = await fetch(endpoint.url + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + endpoint.key },
        body: JSON.stringify(requestBody(turn.system, turn.text)),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('똑딱AI가 답하지 못했어요 (' + res.status + '). 다시 해 주세요.')
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return json.choices?.[0]?.message?.content ?? ''
    } catch (err) {
      if (controller.signal.aborted) throw new Error('멈췄어요.', { cause: err })
      throw err
    } finally {
      this.running.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    this.running.get(requestId)?.abort()
  }

  stop(): void {
    this.stopping = true
    for (const c of this.running.values()) c.abort()
    this.child?.kill()
    this.child = null
    this.endpoint = null
  }
}
