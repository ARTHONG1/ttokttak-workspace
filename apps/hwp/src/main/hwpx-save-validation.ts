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
    // A lost master page, body section or embedded asset must stop the save.
    for (const name of Object.keys(original.files)) {
      if (!/^(?:Contents\/(?:masterpage|section)\d+\.xml|BinData\/[^/]+)$/i.test(name)) {
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
  }

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
