/**
 * Registers the edufine-host native messaging host with Chrome and Edge for this user:
 * a manifest naming the launcher next to the CLI and allowing only the 똑딱작업실 extension
 * extension, plus (on Windows) the HKCU registry value that points at it. No admin
 * rights. The Windows installer runs it once (ttokttak edufine-register) and the app
 * repeats it at start, which covers a browser installed later; uninstall removes it.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { EXTENSION_ID, NATIVE_HOST_NAME } from '@genoffice/ttokttak-extension/ids'

export interface RegisterEnv {
  platform: NodeJS.Platform
  /** the folder holding genoffice.cjs and the edufine-host launchers */
  cliDir: string
  home: string
  run(command: string, args: string[]): void
  write(path: string, text: string): void
  mkdir(path: string): void
  remove(path: string): void
}

/** this machine, this user; cliDir is where genoffice.cjs and the launchers are */
export function realRegisterEnv(cliDir: string): RegisterEnv {
  return {
    platform: process.platform,
    cliDir,
    home: homedir(),
    run: (command, args) =>
      void execFileSync(command, args, { stdio: 'ignore', windowsHide: true }),
    write: (path, text) => writeFileSync(path, text + '\n'),
    mkdir: (path) => void mkdirSync(path, { recursive: true }),
    remove: (path) => rmSync(path, { force: true }),
  }
}

export function nativeHostManifest(hostPath: string) {
  return {
    name: NATIVE_HOST_NAME,
    description: '똑딱작업실 프로그램 ↔ 똑딱작업실 확장',
    path: hostPath,
    type: 'stdio',
    allowed_origins: ['chrome-extension://' + EXTENSION_ID + '/'],
  }
}

const WIN_KEYS = [
  'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\' + NATIVE_HOST_NAME,
  'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\' + NATIVE_HOST_NAME,
]

function browserDirs(platform: NodeJS.Platform, home: string): string[] {
  if (platform === 'darwin') {
    const base = posix.join(home, 'Library/Application Support')
    return ['Google/Chrome', 'Microsoft Edge', 'Chromium'].map((b) =>
      posix.join(base, b, 'NativeMessagingHosts'),
    )
  }
  return ['google-chrome', 'microsoft-edge', 'chromium'].map((b) =>
    posix.join(home, '.config', b, 'NativeMessagingHosts'),
  )
}

export function registerNativeHost(env: RegisterEnv): {
  manifests: string[]
  registryKeys: string[]
} {
  if (env.platform === 'win32') {
    const manifest = win32.join(env.cliDir, NATIVE_HOST_NAME + '.json')
    env.write(
      manifest,
      JSON.stringify(nativeHostManifest(win32.join(env.cliDir, 'edufine-host.cmd')), null, 2),
    )
    for (const key of WIN_KEYS)
      env.run('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifest, '/f'])
    return { manifests: [manifest], registryKeys: WIN_KEYS }
  }
  const text = JSON.stringify(nativeHostManifest(posix.join(env.cliDir, 'edufine-host')), null, 2)
  const manifests = browserDirs(env.platform, env.home).map((dir) => {
    env.mkdir(dir)
    const file = posix.join(dir, NATIVE_HOST_NAME + '.json')
    env.write(file, text)
    return file
  })
  return { manifests, registryKeys: [] }
}

export function unregisterNativeHost(env: RegisterEnv): void {
  if (env.platform === 'win32') {
    for (const key of WIN_KEYS) env.run('reg', ['delete', key, '/f'])
    env.remove(win32.join(env.cliDir, NATIVE_HOST_NAME + '.json'))
    return
  }
  for (const dir of browserDirs(env.platform, env.home))
    env.remove(posix.join(dir, NATIVE_HOST_NAME + '.json'))
}
