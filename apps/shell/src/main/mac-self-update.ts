import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, closeSync, constants, createWriteStream, openSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

/**
 * Self-update for the macOS app, which is signed ad hoc only
 * (docs/tracking/decisions/0031-unsigned-mac-beta.md). Squirrel.Mac, the
 * updater electron-updater drives on macOS, refuses to install into an app
 * without a Developer ID, so the Mac build updates the way
 * scripts/install/install-mac.sh installs: it downloads the release's zip for
 * this CPU, checks it against the sha512 in latest-mac.yml, unpacks it next to
 * the update record, and once the app has quit a detached shell script swaps
 * the .app bundle and reopens it. A swap that fails puts the old bundle back.
 *
 * No Electron here: updater.ts passes in fetch, so every step is testable.
 */

const execFileP = promisify(execFile)

/** one entry of latest-mac.yml's `files` list */
export interface MacFeedFile {
  url: string
  sha512: string
  size?: number
}

export type MacInstallTarget =
  | { ok: true; bundle: string }
  | { ok: false; reason: 'not-a-bundle' | 'translocated' | 'disk-image' | 'not-writable' }

function writable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The .app bundle the running executable belongs to, and whether this user can
 * replace it. An app started from the dmg or from Gatekeeper's randomized
 * read-only copy (App Translocation) cannot be replaced in place.
 */
export function macInstallTarget(
  execPath: string,
  canWrite: (path: string) => boolean = writable,
): MacInstallTarget {
  const macos = dirname(execPath)
  const contents = dirname(macos)
  const bundle = dirname(contents)
  if (
    basename(macos) !== 'MacOS' ||
    basename(contents) !== 'Contents' ||
    !bundle.endsWith('.app')
  ) {
    return { ok: false, reason: 'not-a-bundle' }
  }
  if (bundle.includes('/AppTranslocation/')) return { ok: false, reason: 'translocated' }
  if (/^\/Volumes\/[^/]+\/[^/]+\.app$/.test(bundle)) return { ok: false, reason: 'disk-image' }
  if (!canWrite(dirname(bundle)) || !canWrite(bundle)) return { ok: false, reason: 'not-writable' }
  return { ok: true, bundle }
}

/**
 * The zip for this CPU from the feed's file list. electron-builder names the
 * Apple Silicon zip <name>-<v>-arm64-mac.zip and the Intel one <name>-<v>-mac.zip.
 * An app running under Rosetta reports x64 and keeps the Intel build.
 */
export function pickMacZip(
  files: readonly MacFeedFile[] | undefined,
  arch: string,
): MacFeedFile | null {
  const zips = (files ?? []).filter((f) => typeof f.url === 'string' && /\.zip$/i.test(f.url))
  const isArm = (f: MacFeedFile) => /arm64/i.test(f.url)
  return (arch === 'arm64' ? zips.find(isArm) : zips.find((f) => !isArm(f))) ?? null
}

/**
 * Where a feed file is downloaded from: the release assets of the product
 * repository, tagged v<version>. Only a bare file name from the feed is
 * accepted, so a feed entry cannot point the download anywhere else.
 */
export function macReleaseAssetUrl(releasesUrl: string, version: string, fileName: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName)) {
    throw new Error('unexpected file name in the update feed: ' + fileName)
  }
  return releasesUrl + '/download/v' + version.replace(/^v/, '') + '/' + fileName
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  body: ReadableStream<Uint8Array> | null
}>

export interface MacDownloadOptions {
  url: string
  /** base64 sha512 from latest-mac.yml */
  sha512: string
  size?: number
  dest: string
  fetchImpl: FetchLike
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  /** no byte for this long ends the download; production 60 s */
  stallMs?: number
}

/** Downloads `url` to `dest` and checks its sha512; a mismatch removes the file and throws. */
export async function downloadVerified(opts: MacDownloadOptions): Promise<void> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  opts.signal?.addEventListener('abort', abort, { once: true })
  const stallMs = opts.stallMs ?? 60_000
  let stall = setTimeout(abort, stallMs)
  try {
    const res = await opts.fetchImpl(opts.url, { signal: controller.signal })
    if (!res.ok || !res.body) throw new Error('download failed: HTTP ' + res.status)
    const total = Number(res.headers.get('content-length')) || opts.size || 0
    const hash = createHash('sha512')
    let received = 0
    let lastReport = 0
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        clearTimeout(stall)
        stall = setTimeout(abort, stallMs)
        hash.update(chunk)
        received += chunk.length
        const now = Date.now()
        if (total > 0 && now - lastReport >= 250) {
          lastReport = now
          opts.onProgress?.(Math.min(99, (received / total) * 100))
        }
        done(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>),
      meter,
      createWriteStream(opts.dest),
      { signal: controller.signal },
    )
    const digest = hash.digest('base64')
    if (digest !== opts.sha512) {
      throw new Error('the downloaded file does not match the sha512 in the update feed')
    }
  } catch (err) {
    await rm(opts.dest, { force: true })
    if (opts.signal?.aborted) throw new Error('download cancelled', { cause: err })
    if (controller.signal.aborted) throw new Error('download stalled', { cause: err })
    throw err
  } finally {
    clearTimeout(stall)
    opts.signal?.removeEventListener('abort', abort)
  }
}

/**
 * Unpacks the downloaded zip into `dir` and returns the .app inside it, after
 * checking that the bundle carries the version the feed announced.
 */
export async function unpackMacUpdate(zip: string, dir: string, version: string): Promise<string> {
  await execFileP('/usr/bin/ditto', ['-x', '-k', zip, dir])
  const apps = (await readdir(dir)).filter((name) => name.endsWith('.app'))
  if (apps.length !== 1) throw new Error('the update zip does not hold exactly one app')
  const app = join(dir, apps[0])
  const { stdout } = await execFileP('/usr/bin/plutil', [
    '-extract',
    'CFBundleShortVersionString',
    'raw',
    '-o',
    '-',
    join(app, 'Contents', 'Info.plist'),
  ])
  if (stdout.trim() !== version.replace(/^v/, '')) {
    throw new Error('the unpacked app is version ' + stdout.trim() + ', expected ' + version)
  }
  // downloads made by the app carry no quarantine flag; clear it anyway so the
  // swapped-in app opens without a Gatekeeper prompt (install-mac.sh does the same)
  await execFileP('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', app]).catch(() => undefined)
  return app
}

export interface PrepareMacUpdateOptions {
  version: string
  files: readonly MacFeedFile[] | undefined
  arch: string
  releasesUrl: string
  /** staging folder; emptied first, so only the latest download is kept */
  workDir: string
  fetchImpl: FetchLike
  /**
   * A second network path tried once when the first download fails for any
   * reason but a cancel. Electron's net.fetch (system proxy settings) can
   * stall or answer HTTP 400 / ERR_HTTP2_PROTOCOL_ERROR on a GitHub asset
   * redirect where Node's own fetch gets the file (0.15.2 rehearsal).
   */
  fallbackFetch?: FetchLike
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  log?: (message: string) => void
}

/** Download, check and unpack: returns the staged .app, ready to be swapped in at quit. */
export async function prepareMacUpdate(opts: PrepareMacUpdateOptions): Promise<string> {
  const file = pickMacZip(opts.files, opts.arch)
  if (!file) throw new Error('the update feed has no ' + opts.arch + ' zip for macOS')
  const url = macReleaseAssetUrl(opts.releasesUrl, opts.version, file.url)
  await rm(opts.workDir, { recursive: true, force: true })
  await mkdir(opts.workDir, { recursive: true })
  const zip = join(opts.workDir, file.url)
  opts.log?.('downloading ' + url)
  const download = (fetchImpl: FetchLike) =>
    downloadVerified({
      url,
      sha512: file.sha512,
      size: file.size,
      dest: zip,
      fetchImpl,
      onProgress: opts.onProgress,
      signal: opts.signal,
    })
  try {
    await download(opts.fetchImpl)
  } catch (err) {
    if (opts.signal?.aborted || !opts.fallbackFetch) throw err
    opts.log?.('first download failed (' + ((err as Error)?.message ?? err) + '); trying again')
    await download(opts.fallbackFetch)
  }
  opts.log?.('sha512 matches; unpacking')
  const app = await unpackMacUpdate(zip, join(opts.workDir, 'app'), opts.version)
  await rm(zip, { force: true })
  opts.log?.('staged ' + app)
  return app
}

/**
 * Runs after the app has quit: waits for its process to end, moves the
 * installed bundle aside (a hidden sibling, same folder, so no permission
 * differs from the install itself), moves the staged bundle in, and on any
 * failure puts the old bundle back. Arguments: pid, staged app, installed app,
 * 1 to reopen afterwards, staging folder to remove.
 */
export const MAC_SWAP_SCRIPT = String.raw`pid="$1"; new="$2"; dest="$3"; relaunch="$4"; work="$5"
say() { printf '%s [mac-swap] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
reopen() { if [ "$relaunch" = 1 ]; then open "$dest"; fi; }
n=0
while kill -0 "$pid" 2>/dev/null; do
  n=$((n + 1))
  if [ "$n" -gt 300 ]; then say "the app did not quit within 60 s; nothing replaced"; exit 1; fi
  sleep 0.2
done
if [ ! -d "$new" ]; then say "staged app missing: $new"; reopen; exit 1; fi
old="$(dirname "$dest")/.$(basename "$dest").previous"
rm -rf "$old"
if ! mv "$dest" "$old"; then say "could not move $dest aside; nothing replaced"; reopen; exit 1; fi
if mv "$new" "$dest"; then
  say "replaced $dest"
  rm -rf "$old"
else
  say "could not move the new app in place; restoring the previous one"
  rm -rf "$dest"
  mv "$old" "$dest"
fi
xattr -dr com.apple.quarantine "$dest" 2>/dev/null
rm -rf "$work"
reopen
`

export interface MacSwapOptions {
  pid: number
  staged: string
  bundle: string
  relaunch: boolean
  workDir: string
  /** script output is appended here (the update record) */
  logFile: string
}

/** Starts the swap script detached, so it outlives the app it replaces. */
export function startMacSwap(opts: MacSwapOptions): boolean {
  let out: number | 'ignore' = 'ignore'
  try {
    out = openSync(opts.logFile, 'a')
  } catch {
    /* the swap does not depend on the record */
  }
  try {
    const child = spawn(
      '/bin/sh',
      [
        '-c',
        MAC_SWAP_SCRIPT,
        'mac-swap',
        String(opts.pid),
        opts.staged,
        opts.bundle,
        opts.relaunch ? '1' : '0',
        opts.workDir,
      ],
      { detached: true, stdio: ['ignore', out, out] },
    )
    child.unref()
    return true
  } catch {
    return false
  } finally {
    if (typeof out === 'number') closeSync(out)
  }
}
