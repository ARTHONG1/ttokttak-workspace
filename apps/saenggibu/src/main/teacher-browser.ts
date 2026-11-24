/**
 * The teacher's own Chrome or Edge, already logged in to 업무포털, NEIS and K-에듀파인. When the
 * teacher allows remote debugging once (Chrome: chrome://inspect/#remote-debugging), the browser
 * writes DevToolsActivePort, its port and path, into its user folder. The app connects there and
 * fills the tab the teacher already opened: no second certificate login in a separate window, which
 * no school tool asks for (workspace docs/나이스-에듀파인-연동-분석-2026-11-25.md). Without it the
 * app opens its own browser as before. Closing what this returns only disconnects: the teacher's
 * browser and tabs stay. 똑딱작업실 keeps the same file
 * (apps/shell/src/main/teacher-browser.ts).
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright-core'

/** contexts of the teacher's browser: a new tab is opened there, their tabs are left alone */
export const TEACHER_CONTEXTS = new WeakSet<BrowserContext>()

/** the user folders of Chrome, then Edge */
export function teacherBrowserFolders(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string[] {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return [
      join(local, 'Google', 'Chrome', 'User Data'),
      join(local, 'Microsoft', 'Edge', 'User Data'),
    ]
  }
  if (platform === 'darwin') {
    const support = join(home, 'Library', 'Application Support')
    return [join(support, 'Google', 'Chrome'), join(support, 'Microsoft Edge')]
  }
  return [join(home, '.config', 'google-chrome'), join(home, '.config', 'microsoft-edge')]
}

/** the debugging address in a DevToolsActivePort file ("9222\n/devtools/browser/<id>"), or null */
export function debuggingAddress(file: string): string | null {
  const [port, path] = file.split(/\r?\n/)
  return /^\d{2,5}$/.test(port ?? '') && /^\/devtools\/browser\/[\w-]+$/.test(path ?? '')
    ? 'ws://127.0.0.1:' + port + path
    : null
}

/**
 * The teacher's browser, or null when none allows remote debugging. A file left from an earlier
 * run points to a closed port and is passed over.
 */
export async function connectTeacherBrowser(
  folders: readonly string[] = teacherBrowserFolders(),
): Promise<BrowserContext | null> {
  const { chromium } = await import('playwright-core')
  for (const folder of folders) {
    let address: string | null
    try {
      address = debuggingAddress(readFileSync(join(folder, 'DevToolsActivePort'), 'utf8'))
    } catch {
      continue
    }
    if (!address) continue
    try {
      // Chrome may ask the teacher to allow the connection: there is time to answer
      const browser = await chromium.connectOverCDP(address, { timeout: 60_000 })
      const context = browser.contexts()[0]
      if (!context) {
        await browser.close()
        continue
      }
      TEACHER_CONTEXTS.add(context)
      // closing the teacher's browser would close their work: disconnect only
      return Object.assign(context, { close: () => browser.close() })
    } catch {
      continue
    }
  }
  return null
}
