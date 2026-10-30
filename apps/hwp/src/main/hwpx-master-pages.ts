import { hwpxSectionsOf, rewriteHwpxSections } from './tab-widths'

const MASTER_PAGE = /^Contents\/masterpage\d+\.xml$/

/**
 * The master pages of an opened HWPX, kept when the view reads the file. Null when it has
 * none.
 */
export function hwpxMasterPagesOf(file: Uint8Array): Map<string, string> | null {
  try {
    const read = hwpxSectionsOf(file, MASTER_PAGE)
    if (!read || read.sections.length === 0) return null
    return new Map(read.sections.map((part) => [part.name, part.xml]))
  } catch {
    return null
  }
}

/**
 * The opened file's master pages put back where the engine rewrote one without changing
 * what it holds.
 *
 * rhwp 0.8.7 writes every master page again on save: it renumbers its paragraph and table
 * ids and drops empty text runs (`<hp:t/>`), even when nobody touched the master page. The
 * pre-write check keeps master pages byte for byte (a rewrite has not been proven safe in
 * Hancom), so any edit of a document with a master page could not be saved (2026-10-30).
 * When the two differ only in those ids and empty runs, every reference in them (styles,
 * borders, pictures) is the same, so the original bytes are as valid against the saved
 * header as the engine's. Any other difference is left for the pre-write check to refuse.
 * Never throws; a file it cannot read comes back as it was.
 */
export function restoreUnchangedMasterPages(
  file: Uint8Array,
  originals: ReadonlyMap<string, string> | undefined,
): { bytes: Uint8Array; restored: number } {
  try {
    if (!originals || originals.size === 0) return { bytes: file, restored: 0 }
    const read = hwpxSectionsOf(file, MASTER_PAGE)
    if (!read) return { bytes: file, restored: 0 }
    const changed = new Map<string, string>()
    for (const part of read.sections) {
      const original = originals.get(part.name)
      if (original === undefined || original === part.xml) continue
      if (sameContent(original, part.xml)) changed.set(part.name, original)
    }
    if (changed.size === 0) return { bytes: file, restored: 0 }
    const bytes = rewriteHwpxSections(read, changed)
    return bytes ? { bytes, restored: changed.size } : { bytes: file, restored: 0 }
  } catch {
    return { bytes: file, restored: 0 }
  }
}

/** Equal once paragraph and table ids and empty text runs are left out. */
function sameContent(a: string, b: string): boolean {
  return normalized(a) === normalized(b)
}

function normalized(xml: string): string {
  return xml
    .replace(/(<(?:[\w.-]+:)?(?:p|tbl)\s[^>]*?\bid\s*=\s*")\d+(")/g, '$1$2')
    .replace(/<(?:[\w.-]+:)?t\s*\/>/g, '')
}

