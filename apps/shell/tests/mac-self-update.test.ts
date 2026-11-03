import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAC_SWAP_SCRIPT,
  downloadVerified,
  macInstallTarget,
  macReleaseAssetUrl,
  pickMacZip,
  prepareMacUpdate,
} from '../src/main/mac-self-update'
import type { FetchLike } from '../src/main/mac-self-update'

const RELEASES = 'https://github.com/ARTHONG1/ttokttak-workspace/releases'
const onMac = process.platform === 'darwin'

let work = ''
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'mac-self-update-'))
})
afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

function sha512(data: Buffer): string {
  return createHash('sha512').update(data).digest('base64')
}

/** a fetch that answers every request with these bytes, and records the URLs */
function serve(data: Buffer, status = 200): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = []
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name === 'content-length' ? String(data.length) : null) },
      body: new Blob([data]).stream(),
    }
  }
  return { fetchImpl, urls }
}

/** a minimal .app bundle carrying `version` */
function makeApp(dir: string, version: string, name = 'HangulAIWorkbench'): string {
  const app = join(dir, name + '.app')
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  writeFileSync(
    join(app, 'Contents', 'Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
      '<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>' +
      version +
      '</string></dict></plist>\n',
  )
  writeFileSync(join(app, 'Contents', 'MacOS', name), 'version ' + version)
  return app
}

function zipApp(app: string, zip: string): Buffer {
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, zip])
  return readFileSync(zip)
}

describe('macInstallTarget', () => {
  const exe = (bundle: string) => bundle + '/Contents/MacOS/HangulAIWorkbench'

  it('replaces an app installed in a folder this user can write', () => {
    expect(
      macInstallTarget(exe('/Users/me/Applications/HangulAIWorkbench.app'), () => true),
    ).toEqual({
      ok: true,
      bundle: '/Users/me/Applications/HangulAIWorkbench.app',
    })
  })

  it('leaves alone what it cannot replace in place', () => {
    expect(macInstallTarget('/usr/local/bin/node', () => true)).toMatchObject({
      reason: 'not-a-bundle',
    })
    expect(
      macInstallTarget(
        exe('/private/var/folders/x/AppTranslocation/ABC/d/HangulAIWorkbench.app'),
        () => true,
      ),
    ).toMatchObject({ reason: 'translocated' })
    expect(
      macInstallTarget(exe('/Volumes/HangulAIWorkbench 0.15.0/HangulAIWorkbench.app'), () => true),
    ).toMatchObject({
      reason: 'disk-image',
    })
    expect(macInstallTarget(exe('/Applications/HangulAIWorkbench.app'), () => false)).toMatchObject(
      {
        reason: 'not-writable',
      },
    )
  })
})

describe('pickMacZip and macReleaseAssetUrl', () => {
  const files = [
    { url: 'HangulAIWorkbench-0.15.0-arm64-mac.zip', sha512: 'a' },
    { url: 'HangulAIWorkbench-0.15.0-mac.zip', sha512: 'b' },
    { url: 'HangulAIWorkbench-0.15.0-arm64.dmg', sha512: 'c' },
  ]

  it('takes the zip built for this CPU', () => {
    expect(pickMacZip(files, 'arm64')?.sha512).toBe('a')
    expect(pickMacZip(files, 'x64')?.sha512).toBe('b')
    expect(pickMacZip([files[2]], 'arm64')).toBeNull()
    expect(pickMacZip(undefined, 'arm64')).toBeNull()
  })

  it("downloads only from the product's release assets", () => {
    expect(macReleaseAssetUrl(RELEASES, '0.15.0', files[0].url)).toBe(
      RELEASES + '/download/v0.15.0/HangulAIWorkbench-0.15.0-arm64-mac.zip',
    )
    expect(() => macReleaseAssetUrl(RELEASES, '0.15.0', 'https://attacker.example/x.zip')).toThrow()
    expect(() => macReleaseAssetUrl(RELEASES, '0.15.0', '../x.zip')).toThrow()
  })
})

describe('downloadVerified', () => {
  it('keeps a file whose sha512 matches the feed', async () => {
    const data = Buffer.from('the new app')
    const dest = join(work, 'a.zip')
    const seen: number[] = []
    await downloadVerified({
      url: 'u',
      sha512: sha512(data),
      dest,
      fetchImpl: serve(data).fetchImpl,
      onProgress: (p) => seen.push(p),
    })
    expect(readFileSync(dest)).toEqual(data)
  })

  it('removes a file whose sha512 does not match, and fails', async () => {
    const dest = join(work, 'a.zip')
    await expect(
      downloadVerified({
        url: 'u',
        sha512: sha512(Buffer.from('other')),
        dest,
        fetchImpl: serve(Buffer.from('tampered')).fetchImpl,
      }),
    ).rejects.toThrow(/sha512/)
    expect(existsSync(dest)).toBe(false)
  })

  it('fails on an HTTP error', async () => {
    await expect(
      downloadVerified({
        url: 'u',
        sha512: 'x',
        dest: join(work, 'a.zip'),
        fetchImpl: serve(Buffer.from(''), 404).fetchImpl,
      }),
    ).rejects.toThrow(/404/)
  })
})

describe.runIf(onMac)('prepareMacUpdate and the swap (macOS tools)', () => {
  it('stages the app from a zip that matches the feed', async () => {
    const zip = zipApp(makeApp(join(work, 'build'), '0.15.0'), join(work, 'release.zip'))
    const { fetchImpl, urls } = serve(zip)
    const staged = await prepareMacUpdate({
      version: '0.15.0',
      files: [{ url: 'HangulAIWorkbench-0.15.0-arm64-mac.zip', sha512: sha512(zip) }],
      arch: 'arm64',
      releasesUrl: RELEASES,
      workDir: join(work, 'mac-update'),
      fetchImpl,
    })
    expect(urls).toEqual([RELEASES + '/download/v0.15.0/HangulAIWorkbench-0.15.0-arm64-mac.zip'])
    expect(staged).toBe(join(work, 'mac-update', 'app', 'HangulAIWorkbench.app'))
    expect(readFileSync(join(staged, 'Contents', 'MacOS', 'HangulAIWorkbench'), 'utf8')).toBe(
      'version 0.15.0',
    )
    // the zip itself is not kept next to the staged app
    expect(existsSync(join(work, 'mac-update', 'HangulAIWorkbench-0.15.0-arm64-mac.zip'))).toBe(
      false,
    )
  })

  it('refuses an app whose version is not the one the feed announced', async () => {
    const zip = zipApp(makeApp(join(work, 'build'), '0.14.3'), join(work, 'release.zip'))
    await expect(
      prepareMacUpdate({
        version: '0.15.0',
        files: [{ url: 'HangulAIWorkbench-0.15.0-arm64-mac.zip', sha512: sha512(zip) }],
        arch: 'arm64',
        releasesUrl: RELEASES,
        workDir: join(work, 'mac-update'),
        fetchImpl: serve(zip).fetchImpl,
      }),
    ).rejects.toThrow(/0\.14\.3/)
  })

  it('tries the second network path when the first one fails', async () => {
    const zip = zipApp(makeApp(join(work, 'build'), '0.15.0'), join(work, 'release.zip'))
    const broken: FetchLike = async () => ({
      ok: false,
      status: 400,
      headers: { get: () => null },
      body: null,
    })
    const logged: string[] = []
    const staged = await prepareMacUpdate({
      version: '0.15.0',
      files: [{ url: 'HangulAIWorkbench-0.15.0-arm64-mac.zip', sha512: sha512(zip) }],
      arch: 'arm64',
      releasesUrl: RELEASES,
      workDir: join(work, 'mac-update'),
      fetchImpl: broken,
      fallbackFetch: serve(zip).fetchImpl,
      log: (m) => logged.push(m),
    })
    expect(existsSync(staged)).toBe(true)
    expect(logged.some((m) => m.includes('HTTP 400'))).toBe(true)
  })

  it('does not try again after the user cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    let fallbackCalls = 0
    await expect(
      prepareMacUpdate({
        version: '0.15.0',
        files: [{ url: 'HangulAIWorkbench-0.15.0-arm64-mac.zip', sha512: 'x' }],
        arch: 'arm64',
        releasesUrl: RELEASES,
        workDir: join(work, 'mac-update'),
        fetchImpl: async () => {
          throw new Error('aborted')
        },
        fallbackFetch: async (...args) => {
          fallbackCalls += 1
          return serve(Buffer.from('')).fetchImpl(...args)
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/)
    expect(fallbackCalls).toBe(0)
  })

  /** runs the swap script for an already-ended process and waits for it */
  function swap(staged: string, dest: string, stagingDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', [
        '-c',
        MAC_SWAP_SCRIPT,
        'mac-swap',
        '999999',
        staged,
        dest,
        '0',
        stagingDir,
      ])
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (out += d))
      child.on('error', reject)
      child.on('close', () => resolve(out))
    })
  }

  it('swaps the installed bundle for the staged one and cleans up', async () => {
    const apps = join(work, 'Applications')
    const dest = makeApp(apps, '0.14.3')
    const stagingDir = join(work, 'mac-update')
    const staged = makeApp(join(stagingDir, 'app'), '0.15.0')
    const out = await swap(staged, dest, stagingDir)
    expect(out).toContain('replaced')
    expect(readFileSync(join(dest, 'Contents', 'MacOS', 'HangulAIWorkbench'), 'utf8')).toBe(
      'version 0.15.0',
    )
    expect(existsSync(join(apps, '.HangulAIWorkbench.app.previous'))).toBe(false)
    expect(existsSync(stagingDir)).toBe(false)
  })

  it('keeps the installed app when there is nothing staged', async () => {
    const dest = makeApp(join(work, 'Applications'), '0.14.3')
    const out = await swap(join(work, 'missing.app'), dest, join(work, 'mac-update'))
    expect(out).toContain('staged app missing')
    expect(readFileSync(join(dest, 'Contents', 'MacOS', 'HangulAIWorkbench'), 'utf8')).toBe(
      'version 0.14.3',
    )
  })
})
