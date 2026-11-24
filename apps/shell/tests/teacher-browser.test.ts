import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findDirectBrowser } from '../src/main/direct-transfer'
import {
  TEACHER_CONTEXTS,
  connectTeacherBrowser,
  debuggingAddress,
  teacherBrowserFolders,
} from '../src/main/teacher-browser'

describe("the teacher's own browser", () => {
  it('reads the debugging address Chrome writes, and nothing else', () => {
    expect(debuggingAddress('9222\n/devtools/browser/0c1d-2e3f\n')).toBe(
      'ws://127.0.0.1:9222/devtools/browser/0c1d-2e3f',
    )
    expect(debuggingAddress('9222\r\n/devtools/browser/abc')).toBe(
      'ws://127.0.0.1:9222/devtools/browser/abc',
    )
    expect(debuggingAddress('')).toBeNull()
    expect(debuggingAddress('port\n/devtools/browser/abc')).toBeNull()
    expect(debuggingAddress('9222\n/devtools/page/abc')).toBeNull()
  })

  it('looks in Chrome, then Edge', () => {
    expect(teacherBrowserFolders('win32', { LOCALAPPDATA: 'C:\\L' }, 'C:\\U')).toEqual([
      join('C:\\L', 'Google', 'Chrome', 'User Data'),
      join('C:\\L', 'Microsoft', 'Edge', 'User Data'),
    ])
    expect(teacherBrowserFolders('darwin', {}, '/Users/t')[0]).toBe(
      '/Users/t/Library/Application Support/Google/Chrome',
    )
  })

  it('passes over a file left from an earlier run', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'teacher-browser-'))
    writeFileSync(join(folder, 'DevToolsActivePort'), '1\n/devtools/browser/gone')
    expect(await connectTeacherBrowser([folder])).toBeNull()
  })

  const chrome = findDirectBrowser()
  it.skipIf(!chrome)(
    'connects to a browser that allows remote debugging, and closing only disconnects',
    async () => {
      const folder = mkdtempSync(join(tmpdir(), 'teacher-browser-'))
      const child = spawn(
        chrome!,
        [
          '--headless=new',
          '--remote-debugging-port=0',
          '--user-data-dir=' + folder,
          '--no-first-run',
          'about:blank',
        ],
        { stdio: 'ignore' },
      )
      try {
        for (let i = 0; i < 100 && !existsSync(join(folder, 'DevToolsActivePort')); i++)
          await new Promise((resolve) => setTimeout(resolve, 100))
        const context = await connectTeacherBrowser([folder])
        expect(context).not.toBeNull()
        expect(TEACHER_CONTEXTS.has(context!)).toBe(true)
        const page = await context!.newPage()
        await page.setContent('<p id="x">나이스</p>')
        await context!.close()
        // the browser and its tab are still there for the next send
        const again = await connectTeacherBrowser([folder])
        expect(again).not.toBeNull()
        expect(again!.pages().length).toBeGreaterThanOrEqual(2)
        await again!.close()
      } finally {
        child.kill()
      }
    },
    30_000,
  )
})
