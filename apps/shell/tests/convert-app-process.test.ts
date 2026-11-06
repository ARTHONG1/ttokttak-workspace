import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  appExportLaunch,
  exportInAppProcess,
  exportsInPlace,
} from '../src/main/document-convert/app-process-export'

/** a stand-in for the spawned app: prints \`stdout\`, then exits with \`code\` */
function fakeSpawn(stdout: string, code: number | null, opts: { hang?: boolean } = {}) {
  const calls: { command: string; args: string[]; env: NodeJS.ProcessEnv }[] = []
  const spawn = vi.fn((command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    calls.push({ command, args, env: options.env })
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough
      stderr: PassThrough
      kill: (signal?: string) => boolean
    }
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = vi.fn(() => {
      setTimeout(() => child.emit('close', null, 'SIGTERM'), 0)
      return true
    })
    if (!opts.hang) {
      setTimeout(() => {
        child.stdout.end(stdout)
        child.stderr.end()
        child.emit('close', code, null)
      }, 0)
    }
    return child
  })
  return { spawn, calls }
}

const LAUNCH = { command: '/Apps/HangulAIWorkbench', args: [] }

describe('appExportLaunch', () => {
  it('runs the packaged app binary as it is, and the dev Electron with the app folder', () => {
    expect(appExportLaunch('/Apps/HangulAIWorkbench', true, '/ignored')).toEqual(LAUNCH)
    expect(appExportLaunch('/dev/Electron', false, '/repo/apps/shell')).toEqual({
      command: '/dev/Electron',
      args: ['/repo/apps/shell'],
    })
  })
})

describe('exportsInPlace', () => {
  it('keeps Hangul and Word exports in the running app, the rest in a second process', () => {
    expect(['/t/a.hwp', '/t/a.HWPX', '/t/source.docx'].map(exportsInPlace)).toEqual([
      true,
      true,
      true,
    ])
    expect(['/t/a.xlsx', '/t/a.pptx', '/t/a.html', '/t/a.md'].map(exportsInPlace)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })
})

describe('exportInAppProcess', () => {
  it('asks the app for one dialog-free export and trusts its envelope', async () => {
    const { spawn, calls } = fakeSpawn('noise\n{"status":"ok","summary":"done"}\n', 0)
    await exportInAppProcess(LAUNCH, '/t/source.docx', '/t/work-1.pdf', 'pdf', {
      spawn: spawn as never,
      exists: () => true,
      env: { ELECTRON_RUN_AS_NODE: '1', LANG: 'ko_KR' },
    })
    expect(calls[0].command).toBe('/Apps/HangulAIWorkbench')
    expect(calls[0].args).toEqual([
      '--headless-export',
      '/t/source.docx',
      '--to',
      'pdf',
      '--out',
      '/t/work-1.pdf',
      '--json',
    ])
    // the child must start as the app, not as plain Node
    expect(calls[0].env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(calls[0].env.LANG).toBe('ko_KR')
  })

  it("fails with the app's reason when the export did not work", async () => {
    const { spawn } = fakeSpawn('{"status":"error","error":"input file not found"}\n', 2)
    await expect(
      exportInAppProcess(LAUNCH, '/t/a.docx', '/t/a.pdf', 'pdf', {
        spawn: spawn as never,
        exists: () => false,
      }),
    ).rejects.toThrow('input file not found')
  })

  it('does not take an ok without the file', async () => {
    const { spawn } = fakeSpawn('{"status":"ok"}\n', 0)
    await expect(
      exportInAppProcess(LAUNCH, '/t/a.docx', '/t/a.pdf', 'pdf', {
        spawn: spawn as never,
        exists: () => false,
      }),
    ).rejects.toThrow()
  })

  it('stops an export that takes too long', async () => {
    const { spawn } = fakeSpawn('', 0, { hang: true })
    await expect(
      exportInAppProcess(LAUNCH, '/t/a.xlsx', '/t/a.pdf', 'pdf', {
        spawn: spawn as never,
        exists: () => false,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/timed out/)
  })
})
