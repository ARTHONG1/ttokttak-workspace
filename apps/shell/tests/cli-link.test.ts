import { readFileSync, statSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getVersion: () => '0.0.0' } }))

import {
  isDevelopmentCopy,
  isEphemeralInstall,
  launcherFilePath,
  writeLauncherFile,
} from '../src/main/cli-link'

describe('genoffice launcher file', () => {
  it('lives in the genoffice auth directory, overridable like auth.json', () => {
    expect(launcherFilePath({})).toBe(join(process.env.HOME ?? '', '.ttokttak', 'launcher'))
    // the upstream app keeps its own record in ~/.genoffice: never ours to write
    expect(launcherFilePath({})).not.toContain('.genoffice')
    expect(launcherFilePath({ GENOFFICE_AUTH_DIR: '/tmp/x' })).toBe(join('/tmp/x', 'launcher'))
  })

  it('writes one line, creates the directory, and only rewrites on change', () => {
    const dir = mkdtempSync(join(tmpdir(), 'genoffice-launcher-'))
    const file = join(dir, 'nested', 'launcher')
    expect(writeLauncherFile(file, '/Applications/GenOffice.app/Contents/Resources/cli')).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('/Applications/GenOffice.app/Contents/Resources/cli\n')
    const before = statSync(file).mtimeMs
    expect(writeLauncherFile(file, '/Applications/GenOffice.app/Contents/Resources/cli')).toBe(
      false,
    )
    expect(statSync(file).mtimeMs).toBe(before)
    expect(writeLauncherFile(file, 'C:\\Programs\\HangulAIWorkbench\\resources\\cli')).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('C:\\Programs\\HangulAIWorkbench\\resources\\cli\n')
  })

  it('treats dmg and AppImage mounts as temporary', () => {
    expect(isEphemeralInstall('/Volumes/GenOffice/GenOffice.app/Contents/Resources', {})).toBe(true)
    expect(isEphemeralInstall('/tmp/.mount_GenOfxyz/resources', {})).toBe(true)
    expect(isEphemeralInstall('/opt/GenOffice/resources', { APPIMAGE: '/home/u/G.AppImage' })).toBe(
      true,
    )
    expect(isEphemeralInstall('/Applications/GenOffice.app/Contents/Resources', {})).toBe(false)
  })

  /**
   * Launching a packaged build straight from electron-builder's output folder
   * (or a copy in a temp folder, or an e2e run with its own profile) used to
   * point the user's ttokttak command and ~/.ttokttak/launcher at that build:
   * the next rebuild then changed or removed the command every agent uses.
   */
  it('leaves the command alone for build outputs, temp copies and test profiles', () => {
    const res = (app: string) => app + '/Contents/Resources'
    for (const path of [
      res('/Users/u/work/program/apps/shell/release/mac-arm64/HangulAIWorkbench.app'),
      res('/Users/u/work/program/apps/shell/release/mac/HangulAIWorkbench.app'),
      res('/Users/u/work/program/apps/shell/release/mac-universal/HangulAIWorkbench.app'),
      'C:\\work\\program\\apps\\shell\\release\\win-unpacked\\resources',
      '/home/u/program/apps/shell/release/linux-unpacked/resources',
      res('/private/tmp/check-0152/HangulAIWorkbench.app'),
      res('/tmp/probe/HangulAIWorkbench.app'),
      res('/private/var/folders/x1/abc/T/AppTranslocation/HangulAIWorkbench.app'),
      'C:\\Users\\u\\AppData\\Local\\Temp\\probe\\resources',
    ])
      expect(isDevelopmentCopy(path, {}), path).toBe(true)
    expect(
      isDevelopmentCopy(res('/Applications/HangulAIWorkbench.app'), {
        GENOFFICE_USER_DATA: '/tmp/e2e-profile',
      }),
    ).toBe(true)
  })

  it('links real installs wherever the user keeps the app', () => {
    for (const path of [
      '/Applications/HangulAIWorkbench.app/Contents/Resources',
      '/Users/u/Applications/HangulAIWorkbench.app/Contents/Resources',
      '/Users/u/Desktop/HangulAIWorkbench.app/Contents/Resources',
      '/Users/u/Downloads/release/HangulAIWorkbench.app/Contents/Resources',
      'C:\\Users\\u\\AppData\\Local\\Programs\\HangulAIWorkbench\\resources',
      '/opt/HangulAIWorkbench/resources',
    ])
      expect(isDevelopmentCopy(path, {}), path).toBe(false)
  })
})
