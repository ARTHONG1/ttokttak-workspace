import { hwpxSectionsOf, rewriteHwpxSections } from './tab-widths'

/**
 * Namespace prefixes the engine copies from the opened HWPX without declaring them, bound
 * to the prefix the part declares for the same namespace.
 *
 * rhwp 0.8.7 splices a numbering's `paraHead` elements verbatim from the source header
 * ("원본 HWPX paraHead 영역이 있으면 그대로 splice"), so a file written by a tool that names
 * the head namespace `ns0` (Python's ElementTree does) comes back with `<ns0:paraHead>`
 * inside a header that declares that namespace only as `hh`. Hancom refuses the file as
 * damaged (2026-10-30: 16 of 114 local documents). The source file says which namespace
 * `ns0` meant; the output declares the same namespace under its own prefix, so the
 * element is renamed to that prefix and nothing else changes.
 *
 * Only a prefix whose namespace the source declared and the output declares under another
 * name is renamed. Any other undeclared prefix is left for the pre-write check to refuse.
 * Never throws; a file it cannot read comes back as it was.
 */
export function bindCopiedPrefixes(
  file: Uint8Array,
  sourceNamespaces: ReadonlyMap<string, string> | undefined,
): { bytes: Uint8Array; renamed: number } {
  try {
    if (!sourceNamespaces || sourceNamespaces.size === 0) return { bytes: file, renamed: 0 }
    const read = hwpxSectionsOf(file, XML_PART)
    if (!read) return { bytes: file, renamed: 0 }
    const changed = new Map<string, string>()
    let renamed = 0
    for (const part of read.sections) {
      const declared = declarationsOf(part.xml)
      const prefixOf = new Map([...declared].map(([prefix, uri]) => [uri, prefix]))
      let xml = part.xml
      for (const prefix of usedPrefixesOf(xml)) {
        if (declared.has(prefix) || prefix === 'xml' || prefix === 'xmlns') continue
        const uri = sourceNamespaces.get(prefix)
        const target = uri ? prefixOf.get(uri) : undefined
        if (!target) continue
        const before = xml
        xml = renamePrefix(xml, prefix, target)
        if (xml !== before) renamed++
      }
      if (xml !== part.xml) changed.set(part.name, xml)
    }
    if (changed.size === 0) return { bytes: file, renamed: 0 }
    const bytes = rewriteHwpxSections(read, changed)
    return bytes ? { bytes, renamed } : { bytes: file, renamed: 0 }
  } catch {
    return { bytes: file, renamed: 0 }
  }
}

/**
 * The namespace each prefix names in an opened HWPX's XML parts, kept when the view reads
 * the file so the save can bind what the engine copies from it. Null when there is none.
 */
export function hwpxNamespacesOf(file: Uint8Array): Map<string, string> | null {
  try {
    const read = hwpxSectionsOf(file, XML_PART)
    if (!read) return null
    const out = new Map<string, string>()
    for (const part of read.sections) {
      for (const [prefix, uri] of declarationsOf(part.xml)) {
        if (!out.has(prefix)) out.set(prefix, uri)
      }
    }
    return out.size > 0 ? out : null
  } catch {
    return null
  }
}

const XML_PART = /^(?:Contents\/[^/]+\.(?:xml|hpf)|settings\.xml|version\.xml|META-INF\/[^/]+\.(?:xml|rdf))$/

function declarationsOf(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of xml.matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=\s*(["'])(.*?)\2/g)) {
    if (!out.has(m[1]!)) out.set(m[1]!, m[3]!)
  }
  return out
}

function usedPrefixesOf(xml: string): Set<string> {
  const out = new Set<string>()
  for (const m of xml.matchAll(/<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g)) out.add(m[1]!)
  for (const m of xml.matchAll(/\s([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g)) out.add(m[1]!)
  return out
}

/** The prefix renamed in element names and attribute names, never in text or values. */
function renamePrefix(xml: string, from: string, to: string): string {
  const name = from.replace(/[.]/g, '\\.')
  return xml.replace(/<[^>]*>/g, (tag) => {
    if (tag.startsWith('<?') || tag.startsWith('<!')) return tag
    return tag
      .replace(new RegExp('^<(/?)' + name + ':'), '<$1' + to + ':')
      .replace(new RegExp('(\\s)' + name + ':([A-Za-z_][\\w.-]*\\s*=)', 'g'), '$1' + to + ':$2')
  })
}

