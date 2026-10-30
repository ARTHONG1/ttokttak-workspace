/**
 * After an edit the engine writes line caches (`<hp:lineseg>`) whose start positions can
 * point to the wrong character in a paragraph that holds controls (2026-10-30: typing at the
 * start of a first paragraph whose body is a table wrote `textpos="7"` for the line that holds
 * the table, and Hancom refused the file as damaged). The save drops those caches so Hancom
 * lays the paragraph out again when it opens the file.
 *
 * The document is built here: a first paragraph that holds the section and column
 * definitions, a page-number slot and a full-width inline table, which is the shape that
 * makes the engine write the wrong start.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import JSZip from 'jszip'
import { dropUntrustedLineCaches } from '../src/main/hwpx-line-cache'
import { validateHwpxBeforeOverwrite } from '../src/main/hwpx-save-validation'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')) })
})

async function section(bytes: Uint8Array): Promise<string> {
  return (await JSZip.loadAsync(bytes)).file('Contents/section0.xml')!.async('string')
}

/** The `textpos` values of the body paragraph that opens the section. */
function firstParagraphLines(xml: string): string[] {
  const start = xml.indexOf('<hp:p ')
  let depth = 0
  let end = start
  for (const m of xml.slice(start).matchAll(/<(\/?)hp:p[ >]/g)) {
    if (!m[1]) depth++
    else if (--depth === 0) {
      end = start + m.index!
      break
    }
  }
  const paragraph = xml.slice(start, end)
  const own = paragraph.slice(paragraph.lastIndexOf('</hp:tbl>'))
  return [...own.matchAll(/<hp:lineseg textpos="(\d+)"/g)].map((m) => m[1]!)
}

/** A first paragraph that holds only controls: page number and a full-width inline table. */
function tableFirstDocument(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  doc.setPageNumberPos(0, 0, 5, false)
  const table = JSON.parse(
    doc.createTableEx(
      JSON.stringify({ sectionIdx: 0, paraIdx: 0, charOffset: 0, rowCount: 1, colCount: 1, treatAsChar: true, colWidths: [47624] }),
    ),
  ) as { paraIdx: number; controlIdx: number }
  doc.insertTextInCell(0, table.paraIdx, table.controlIdx, 0, 0, 0, '시험용 보고서 제목')
  doc.insertParagraph(0, 1)
  doc.insertText(0, 1, 0, '줄 정보 시험을 위해 만든 본문입니다.')
  return doc
}

function editedExport(): Uint8Array {
  const doc = tableFirstDocument()
  doc.insertText(0, 0, 0, '[검토완료] ')
  return doc.exportHwpx()
}

describe('dropUntrustedLineCaches', () => {
  it('reproduces the engine writing a line start that does not match the text', async () => {
    expect(firstParagraphLines(await section(editedExport()))).toEqual(['0', '7'])
  })

  it('drops the line cache of a multi-line paragraph that holds controls', async () => {
    const result = dropUntrustedLineCaches(editedExport())
    expect(result.dropped).toBeGreaterThan(0)
    const xml = await section(result.bytes)
    expect(firstParagraphLines(xml)).toEqual([])
    expect(xml).toContain('[검토완료] ')
  })

  it('keeps a valid package that the engine reads back with the same pages', async () => {
    const exported = editedExport()
    const { bytes } = dropUntrustedLineCaches(exported)
    expect(await validateHwpxBeforeOverwrite(bytes)).toBeNull()
    expect(new HwpDocument(bytes).pageCount()).toBe(new HwpDocument(exported).pageCount())
    const zip = await JSZip.loadAsync(bytes)
    expect(Object.keys(zip.files)[0]).toBe('mimetype')
  })

  it('keeps the caches of single-line and plain-text paragraphs', async () => {
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    doc.insertText(0, 0, 0, '첫 문단')
    const exported = doc.exportHwpx()
    const result = dropUntrustedLineCaches(exported)
    expect(result.dropped).toBe(0)
    expect(result.bytes).toBe(exported)
  })

  it('returns a file it cannot read as it was', () => {
    const notZip = Uint8Array.from([1, 2, 3, 4])
    expect(dropUntrustedLineCaches(notZip)).toEqual({ bytes: notZip, dropped: 0 })
  })
})

