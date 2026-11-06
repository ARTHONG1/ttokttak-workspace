import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * A dialog-free export run by a second copy of this app in its --headless-export mode (Dock
 * hidden, no window, one export, exit), the way the genoffice command runs it. The running
 * app's editors open what they export and share state with its tabs; a separate process
 * keeps 똑딱서명 and 문서 변환 apart from all of that. The desktop only: the web edition's
 * session process is Node, with no app binary to start.
 */

export interface AppLaunch {
  command: string
  args: string[]
}

export type AppExportFormat = 'pdf' | 'docx' | 'html' | 'md'

/**
 * The exports the running app does well in place (checked end to end in the app): Hangul
 * and Word documents, about twice as fast as starting the app again. The spreadsheet's
 * hidden window stalls next to a running app, so the others go to a second process.
 */
export function exportsInPlace(input: string): boolean {
  return /\.(hwp|hwpx|docx)$/i.test(input)
}

/** how to start this app again: the packaged binary as it is, dev Electron with the app */
export function appExportLaunch(execPath: string, isPackaged: boolean, appPath: string): AppLaunch {
  return isPackaged ? { command: execPath, args: [] } : { command: execPath, args: [appPath] }
}

export interface AppProcessOptions {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  /** test seams */
  spawn?: typeof nodeSpawn
  exists?: (path: string) => boolean
}

interface Envelope {
  status?: string
  summary?: string
  error?: string
}

/** the app prints one JSON line last; anything before it is log noise */
function lastEnvelope(stdout: string): Envelope | null {
  const lines = stdout.trim().split('\n').reverse()
  for (const line of lines) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    try {
      return JSON.parse(text) as Envelope
    } catch {
      // not the envelope
    }
  }
  return null
}

const DEFAULT_TIMEOUT_MS = 180_000

export async function exportInAppProcess(
  launch: AppLaunch,
  input: string,
  outPath: string,
  format: AppExportFormat,
  opts: AppProcessOptions = {},
): Promise<void> {
  const env = { ...(opts.env ?? process.env) }
  // the child has to start as the app, not as plain Node
  delete env.ELECTRON_RUN_AS_NODE
  const spawn = opts.spawn ?? nodeSpawn
  const exists = opts.exists ?? existsSync
  const child = spawn(
    launch.command,
    [...launch.args, '--headless-export', input, '--to', format, '--out', outPath, '--json'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdout += String(chunk)
  })
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderr = (stderr + String(chunk)).slice(-4000)
  })
  let timedOut = false
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    child.once('close', done)
    child.once('error', done)
  })
  const envelope = lastEnvelope(stdout)
  // the envelope comes after the file is written: a stumble while quitting does not count
  if (envelope?.status === 'ok' && exists(outPath)) return
  if (timedOut) throw new Error('the export timed out')
  const tail = stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ')
  throw new Error(envelope?.error ?? envelope?.summary ?? (tail || 'the export wrote no file'))
}
