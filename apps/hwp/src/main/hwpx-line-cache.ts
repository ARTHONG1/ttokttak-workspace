import { hwpxSectionsOf, rewriteHwpxSections } from './tab-widths'

/**
 * Line caches (`<hp:linesegarray>`) the save does not trust, taken out of a HWPX the engine
 * exported.
 *
 * Hancom reads each `<hp:lineseg textpos>` as "this line starts at that character" and
 * refuses the whole file as damaged when a start falls in the wrong place. After an edit,
 * rhwp 0.8.7 writes a wrong start for a paragraph that holds controls next to its text:
 * typing 7 characters at the front of a paragraph whose body is a table wrote
 * `textpos="7"` for the line that holds the table, which starts after the table and
 * page-number slots too (2026-10-30, footnote-01.hwp saved as .hwpx; Hancom Viewer:
 * "문서가 손상되었거나 변조되었을 가능성이 있습니다").
 *
 * A paragraph without the cache is valid HWPX: Hancom lays it out when it opens the file
 * (the engine itself leaves the cache out when it has none, rhwp #1380). So the cache is
 * dropped where its line starts cannot be checked here: a paragraph of more than one line
 * whose content holds anything besides text runs. One-line caches (start 0) and plain-text
 * paragraphs keep theirs, so most of a document keeps the layout the engine computed.
 * Never throws; a file it cannot read comes back as it was.
 */
export function dropUntrustedLineCaches(file: Uint8Array): { bytes: Uint8Array; dropped: number } {
  try {
    const read = hwpxSectionsOf(file)
    if (!read) return { bytes: file, dropped: 0 }
    const changed = new Map<string, string>()
    let dropped = 0
    for (const section of read.sections) {
      const result = dropInSection(section.xml)
      if (result.dropped > 0) {
        changed.set(section.name, result.xml)
        dropped += result.dropped
      }
    }
    if (dropped === 0) return { bytes: file, dropped: 0 }
    const bytes = rewriteHwpxSections(read, changed)
    return bytes ? { bytes, dropped } : { bytes: file, dropped: 0 }
  } catch {
    return { bytes: file, dropped: 0 }
  }
}

/** What a paragraph may hold for its line starts to count as plain text. */
const PLAIN = new Set(['run', 't', 'linesegarray', 'lineseg'])
const TAG = /<(\/?)([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
const LINE = /<(?:[A-Za-z_][\w.-]*:)?lineseg\b/g

function dropInSection(xml: string): { xml: string; dropped: number } {
  /** open paragraphs, innermost last: whether each holds more than text runs */
  const mixed: boolean[] = []
  const cuts: [number, number][] = []
  /** where the innermost paragraph's open line cache starts */
  let cacheAt = -1
  for (const match of xml.matchAll(TAG)) {
    const [whole, closing, , name, , selfClosing] = match
    if (whole.startsWith('<?') || whole.startsWith('<!')) continue
    if (name === 'p') {
      if (closing) mixed.pop()
      else if (!selfClosing) mixed.push(false)
      continue
    }
    if (mixed.length === 0) continue
    const at = match.index!
    if (name === 'linesegarray') {
      if (!closing && !selfClosing) cacheAt = at
      else if (closing && cacheAt >= 0) {
        const end = at + whole.length
        const lines = xml.slice(cacheAt, end).match(LINE)?.length ?? 0
        if (mixed[mixed.length - 1] && lines > 1) cuts.push([cacheAt, end])
        cacheAt = -1
      }
      continue
    }
    // a table, picture or other control inside makes this paragraph (and every one it
    // sits in) more than text; a nested cell paragraph is judged on its own
    if (!closing && !PLAIN.has(name!)) for (let i = 0; i < mixed.length; i++) mixed[i] = true
  }
  if (cuts.length === 0) return { xml, dropped: 0 }
  let out = ''
  let from = 0
  for (const [start, end] of cuts) {
    out += xml.slice(from, start)
    from = end
  }
  return { xml: out + xml.slice(from), dropped: cuts.length }
}

