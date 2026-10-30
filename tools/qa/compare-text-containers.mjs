import { readFile } from 'node:fs/promises'
import { compareArchives } from './archive-structure.mjs'

const DOCX_ELEMENTS = [
  'tbl',
  'tr',
  'tc',
  'drawing',
  'pict',
  'ins',
  'del',
  'commentRangeStart',
  'footnoteReference',
  'endnoteReference',
  'sectPr',
  'headerReference',
  'footerReference',
]
const HWPX_ELEMENTS = [
  'tbl',
  'footNote',
  'endNote',
  'memo',
  'trackChange',
  'secPr',
  'header',
  'footer',
  'masterPage',
  'pic',
  'shapeObject',
  'drawingObject',
  'container',
  'table',
]

export async function compareTextDocuments({ before, after, format, allowedChanges = [] }) {
  if (format === 'docx') {
    return compareArchives({
      before,
      after,
      allowedChanges,
      protectedTags: DOCX_ELEMENTS,
      protectedParts: /^word\/(?:header|footer|footnotes|endnotes|comments|settings|numbering)/i,
    })
  }
  if (format === 'hwpx') {
    return compareArchives({
      before,
      after,
      allowedChanges,
      protectedTags: HWPX_ELEMENTS,
      protectedParts: /(?:master|header|footer|memo|track|history)/i,
    })
  }
  if (format === 'hwp') {
    // OLE Compound File: without a trustworthy round-trip parser, bytes can be
    // checked for basic validity but no preservation guarantee is issued.
    try {
      const [a, b] = await Promise.all([readFile(before), readFile(after)])
      const magic = Buffer.from('d0cf11e0a1b11ae1', 'hex')
      const ok = [a, b].every((file) => file.length >= 512 && file.subarray(0, 8).equals(magic))
      return {
        unexpectedRemovals: [],
        unreadable: !ok,
        details: {
          validation: 'LIMITED: CFB signature only; rhwp + Hancom reopen still required',
          beforeBytes: a.length,
          afterBytes: b.length,
        },
      }
    } catch (error) {
      return { unexpectedRemovals: [], unreadable: true, details: { error: String(error) } }
    }
  }
  throw new Error(`Unsupported text format: ${format}`)
}
