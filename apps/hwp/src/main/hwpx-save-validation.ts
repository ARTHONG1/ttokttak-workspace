import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { XMLValidator } from 'fast-xml-parser'

const REQUIRED_PARTS = [
  'mimetype',
  'version.xml',
  'Contents/content.hpf',
  'Contents/header.xml',
  'Contents/section0.xml',
  'META-INF/container.xml',
]

/** Validate exported HWPX in memory, before touching the user's file or backup. */
export async function validateHwpxBeforeOverwrite(
  bytes: Uint8Array,
  openedFile: Uint8Array | null = null,
): Promise<string | null> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  } catch (error) {
    return `hwp: HWPX save blocked: invalid ZIP or CRC checksum (${String(error)})`
  }

  for (const part of REQUIRED_PARTS) {
    if (!zip.file(part)) return `hwp: HWPX save blocked: missing required ${part}`
  }

  if (openedFile) {
    let original: JSZip
    try {
      original = await JSZip.loadAsync(openedFile, { checkCRC32: true })
    } catch (error) {
      return `hwp: HWPX save blocked: cannot verify opened ZIP (${String(error)})`
    }
    // The editor cannot reliably re-create these document structures yet.
    // A lost master page or body section must stop the save. Embedded files are
    // compared by content below: the engine renames them (image1.png, ...).
    for (const name of Object.keys(original.files)) {
      if (!/^Contents\/(?:masterpage|section)\d+\.xml$/i.test(name)) {
        continue
      }
      if (!zip.file(name)) return `hwp: HWPX save blocked: preserved part missing ${name}`
      // The editor may reserialize a master page while changing its paragraph
      // IDs or dropping empty runs. Until an independent Hancom round-trip
      // proves that rewrite safe, preserve the original master page exactly.
      if (/^Contents\/masterpage\d+\.xml$/i.test(name)) {
        const before = await original.file(name)!.async('nodebuffer')
        const after = await zip.file(name)!.async('nodebuffer')
        if (!before.equals(after)) {
          return `hwp: HWPX save blocked: original master page changed (${name})`
        }
      }
    }
    const lostAsset = await lostEmbeddedFile(original, zip)
    if (lostAsset) return `hwp: HWPX save blocked: preserved part missing ${lostAsset}`
  }

  const dangling = await danglingBinaryRef(zip)
  if (dangling) return `hwp: HWPX save blocked: picture refers to missing ${dangling}`

  const mimetype = await zip.file('mimetype')!.async('string')
  if (mimetype.trim() !== 'application/hwp+zip') {
    return 'hwp: HWPX save blocked: invalid mimetype'
  }

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.(?:xml|hpf|rdf|rels)$/i.test(name)) continue
    try {
      const xml = await entry.async('string')
      const verdict = XMLValidator.validate(xml)
      if (verdict !== true) {
        return `hwp: HWPX save blocked: malformed XML in ${name} (${verdict.err?.msg ?? 'invalid XML'})`
      }
      const unbound = unboundPrefixOf(xml)
      if (unbound) return `hwp: HWPX save blocked: undeclared XML prefix ${unbound}: in ${name}`
    } catch (error) {
      return `hwp: HWPX save blocked: unreadable XML in ${name} (${String(error)})`
    }
  }
  return null
}

/**
 * A namespace prefix the XML uses without declaring it. The validator above does not check
 * namespaces, and Hancom refuses such a file as damaged: rhwp 0.8.7 copies numbering heads
 * from a source HWPX with their original prefix (`ns0:paraHead`) into a header that never
 * declares `ns0` (2026-10-30, header-picture-and-text.hwpx).
 */
function unboundPrefixOf(xml: string): string | null {
  const declared = new Set(['xml', 'xmlns'])
  for (const m of xml.matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=/g)) declared.add(m[1]!)
  for (const m of xml.matchAll(/<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g)) {
    if (!declared.has(m[1]!)) return m[1]!
  }
  for (const m of xml.matchAll(/\s([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g)) {
    if (!declared.has(m[1]!)) return m[1]!
  }
  return null
}


const BIN_DATA = /^BinData\/[^/]+$/i

/**
 * An embedded file of the opened HWPX whose bytes are nowhere in the saved one, by name.
 * rhwp 0.8.7 writes every embedded file again under its own name (`image1.png`), so a
 * name check refused documents whose pictures were all there (2026-10-30: 9 local
 * documents could not be saved at all).
 */
async function lostEmbeddedFile(original: JSZip, saved: JSZip): Promise<string | null> {
  const savedHashes = new Map<string, number>()
  for (const [name, entry] of Object.entries(saved.files)) {
    if (entry.dir || !BIN_DATA.test(name)) continue
    const key = createHash('sha256').update(await entry.async('nodebuffer')).digest('hex')
    savedHashes.set(key, (savedHashes.get(key) ?? 0) + 1)
  }
  for (const [name, entry] of Object.entries(original.files)) {
    if (entry.dir || !BIN_DATA.test(name)) continue
    const key = createHash('sha256').update(await entry.async('nodebuffer')).digest('hex')
    if (!savedHashes.has(key)) return name
  }
  return null
}

/**
 * A `binaryItemIDRef` in the saved sections whose manifest item or file is missing: Hancom
 * refuses such a file. The id is looked up in `Contents/content.hpf`.
 */
async function danglingBinaryRef(zip: JSZip): Promise<string | null> {
  const manifest = await zip.file('Contents/content.hpf')?.async('string')
  if (manifest === undefined) return null
  const hrefOf = new Map<string, string>()
  for (const m of manifest.matchAll(/<(?:[\w.-]+:)?item\b[^>]*>/g)) {
    const id = /\sid\s*=\s*"([^"]*)"/.exec(m[0])?.[1]
    const href = /\shref\s*=\s*"([^"]*)"/.exec(m[0])?.[1]
    if (id && href) hrefOf.set(id, href)
  }
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/^Contents\/(?:section|masterpage|header)\d*\.xml$/i.test(name)) continue
    const xml = await entry.async('string')
    for (const m of xml.matchAll(/binaryItemIDRef\s*=\s*"([^"]+)"/g)) {
      const href = hrefOf.get(m[1]!)
      if (!href || !zip.file(href)) return m[1]!
    }
  }
  return null
}

