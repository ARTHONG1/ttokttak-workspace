import JSZip from 'jszip'
import { assertZipInflatesWithinLimits } from '@genoffice/zip-gate'

/**
 * A document package (Word, PowerPoint, HWPX) read into memory in its own entry order, edited
 * by name, and written back. Every package passes the app's zip bomb gate before it is opened.
 */

export interface ZipPackage {
  /** entry names in the order the file had them (folders left out) */
  order: string[]
  files: Map<string, Uint8Array>
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()

/**
 * The package in memory. A file a person picked passes the zip bomb gate first; one the app's
 * own engine has just written from a document already in memory (trusted) does not, because
 * the Hangul engine stores some pictures with bytes after their compressed stream, which the
 * gate rightly refuses in a file from outside.
 */
export async function readZip(
  bytes: Uint8Array,
  options: { trusted?: boolean } = {},
): Promise<ZipPackage> {
  if (!options.trusted) await assertZipInflatesWithinLimits(bytes)
  const zip = await JSZip.loadAsync(bytes)
  const order: string[] = []
  const files = new Map<string, Uint8Array>()
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    order.push(entry.name)
    files.set(entry.name, await entry.async('uint8array'))
  }
  return { order, files }
}

export function hasPart(pkg: ZipPackage, name: string): boolean {
  return pkg.files.has(name)
}

export function readText(pkg: ZipPackage, name: string): string | null {
  const bytes = pkg.files.get(name)
  return bytes ? decoder.decode(bytes) : null
}

export function writeText(pkg: ZipPackage, name: string, text: string): void {
  writeBytes(pkg, name, encoder.encode(text))
}

export function writeBytes(pkg: ZipPackage, name: string, bytes: Uint8Array): void {
  if (!pkg.files.has(name)) pkg.order.push(name)
  pkg.files.set(name, bytes)
}

export function removePart(pkg: ZipPackage, name: string): void {
  if (!pkg.files.delete(name)) return
  pkg.order = pkg.order.filter((n) => n !== name)
}

export function clonePackage(pkg: ZipPackage): ZipPackage {
  return { order: [...pkg.order], files: new Map(pkg.files) }
}

/**
 * The package as a zip. An HWPX keeps its 'mimetype' entry first and stored, as the format
 * asks; everything else is deflated.
 */
export async function writeZip(pkg: ZipPackage): Promise<Uint8Array> {
  const zip = new JSZip()
  const date = new Date(1980, 0, 1)
  const names = pkg.files.has('mimetype')
    ? ['mimetype', ...pkg.order.filter((n) => n !== 'mimetype')]
    : pkg.order
  for (const name of names) {
    const bytes = pkg.files.get(name)
    if (!bytes) continue
    zip.file(name, bytes, {
      date,
      compression: name === 'mimetype' ? 'STORE' : 'DEFLATE',
      compressionOptions: { level: 6 },
    })
  }
  return zip.generateAsync({ type: 'uint8array', platform: 'DOS' })
}
