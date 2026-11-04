import { describe, expect, it } from 'vitest'
import { EXTENSION_ID, NATIVE_HOST_NAME } from '@genoffice/ttokttak-extension/ids'
import {
  nativeHostManifest,
  registerNativeHost,
  unregisterNativeHost,
  type RegisterEnv,
} from '../src/edufine-register'

function fakeEnv(platform: NodeJS.Platform, cliDir: string, home: string) {
  const runs: string[][] = []
  const writes = new Map<string, string>()
  const dirs: string[] = []
  const removed: string[] = []
  const env: RegisterEnv = {
    platform,
    cliDir,
    home,
    run: (cmd, args) => void runs.push([cmd, ...args]),
    write: (p, t) => void writes.set(p, t),
    mkdir: (p) => void dirs.push(p),
    remove: (p) => void removed.push(p),
  }
  return { env, runs, writes, dirs, removed }
}

describe('native messaging registration', () => {
  it('describes the host for the fixed extension only', () => {
    expect(nativeHostManifest('/x/edufine-host')).toEqual({
      name: NATIVE_HOST_NAME,
      description: '똑딱작업실 프로그램 ↔ 똑딱작업실 확장',
      path: '/x/edufine-host',
      type: 'stdio',
      allowed_origins: ['chrome-extension://' + EXTENSION_ID + '/'],
    })
  })

  it('writes the manifest next to the CLI and points Chrome and Edge at it on Windows', () => {
    const cliDir = 'C:\\Users\\t\\AppData\\Local\\Programs\\HangulAIWorkbench\\resources\\cli'
    const f = fakeEnv('win32', cliDir, 'C:\\Users\\t')
    const res = registerNativeHost(f.env)
    const manifestPath = cliDir + '\\kr.ttokttak.edufine.json'
    expect(JSON.parse(f.writes.get(manifestPath)!).path).toBe(cliDir + '\\edufine-host.cmd')
    expect(f.runs).toEqual([
      [
        'reg',
        'add',
        'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\kr.ttokttak.edufine',
        '/ve',
        '/t',
        'REG_SZ',
        '/d',
        manifestPath,
        '/f',
      ],
      [
        'reg',
        'add',
        'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\kr.ttokttak.edufine',
        '/ve',
        '/t',
        'REG_SZ',
        '/d',
        manifestPath,
        '/f',
      ],
    ])
    expect(res.manifests).toEqual([manifestPath])
  })

  it('puts the manifest in the Chrome, Edge and Chromium folders on macOS', () => {
    const f = fakeEnv(
      'darwin',
      '/Applications/HangulAIWorkbench.app/Contents/Resources/cli',
      '/Users/t',
    )
    registerNativeHost(f.env)
    const chrome =
      '/Users/t/Library/Application Support/Google/Chrome/NativeMessagingHosts/kr.ttokttak.edufine.json'
    expect(JSON.parse(f.writes.get(chrome)!).path).toBe(
      '/Applications/HangulAIWorkbench.app/Contents/Resources/cli/edufine-host',
    )
    expect([...f.writes.keys()]).toHaveLength(3)
    expect(f.runs).toEqual([])
  })

  it('removes what it registered', () => {
    const w = fakeEnv('win32', 'C:\\cli', 'C:\\Users\\t')
    unregisterNativeHost(w.env)
    expect(w.runs.map((r) => r.slice(0, 2).concat(r[r.length - 1]))).toEqual([
      ['reg', 'delete', '/f'],
      ['reg', 'delete', '/f'],
    ])
    expect(w.removed).toEqual(['C:\\cli\\kr.ttokttak.edufine.json'])
    const m = fakeEnv('darwin', '/cli', '/Users/t')
    unregisterNativeHost(m.env)
    expect(m.removed).toHaveLength(3)
  })
})
