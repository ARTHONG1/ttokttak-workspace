/**
 * The engine's one-cell resize (rhwp patch 0016, Hangul's Shift+arrow). The engine
 * already had the native call; this guards the WASM surface and the saved grid.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

function table(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  doc.splitParagraph(0, 0, 0)
  doc.pasteHtml(
    0,
    1,
    0,
    '<table>' +
      '<tr><td>A1</td><td>B1</td><td>C1</td></tr>' +
      '<tr><td>A2</td><td>B2</td><td>C2</td></tr>' +
      '<tr><td>A3</td><td>B3</td><td>C3</td></tr>' +
      '</table>',
  )
  return doc
}

function firstRowWidths(doc: HwpDocument): number[] {
  return JSON.parse(doc.getTableCellBboxes(0, 1, 0))
    .filter((box: { row: number }) => box.row === 0)
    .map((box: { w: number }) => Math.round(box.w * 10) / 10)
}

describe('one cell resize (Shift+arrow)', () => {
  it('moves the same boundary again and keeps the grid after save', () => {
    const doc = table()
    // The pasted table's starting width comes from the engine; the resize is measured from it.
    const [start, middle, last] = firstRowWidths(doc)
    expect(middle).toBe(start)
    expect(last).toBe(start)

    expect(JSON.parse(doc.resizeTableCell(0, 1, 0, 0, 0, false, true))).toMatchObject({
      ok: true,
      moved: true,
    })
    const once = firstRowWidths(doc)
    const step = once[0] - start
    expect(step).toBeGreaterThan(3)
    expect(step).toBeLessThan(4.5)
    expect(once[1]).toBeCloseTo(start - step, 0)
    expect(once[2]).toBe(start)

    expect(JSON.parse(doc.resizeTableCell(0, 1, 0, 0, 0, false, true))).toMatchObject({
      ok: true,
      moved: true,
    })
    const twice = firstRowWidths(doc)
    expect(twice[0]).toBeCloseTo(start + 2 * step, 0)
    expect(twice[1]).toBeCloseTo(start - 2 * step, 0)
    expect(twice[2]).toBe(start)

    const dims = JSON.parse(doc.getTableDimensions(0, 1, 0))
    expect(dims).toMatchObject({ rowCount: 3, colCount: 4, cellCount: 9 })
    const first = JSON.parse(doc.getCellInfo(0, 1, 0, 0))
    expect(first).toMatchObject({ row: 0, col: 0, rowSpan: 1, colSpan: 2 })

    const saved = new HwpDocument(doc.exportHwp())
    expect(firstRowWidths(saved)).toEqual(twice)
    expect(JSON.parse(saved.getCellInfo(0, 1, 0, 0))).toMatchObject({ colSpan: 2 })
    expect(JSON.parse(saved.resizeTableCell(0, 1, 0, 0, 0, false, true))).toMatchObject({
      ok: true,
      moved: true,
    })

    const savedHwpx = new HwpDocument(doc.exportHwpx())
    expect(firstRowWidths(savedHwpx)).toEqual(twice)
    expect(JSON.parse(savedHwpx.getCellInfo(0, 1, 0, 0))).toMatchObject({ colSpan: 2 })
  })

  it('does nothing at the last column', () => {
    const doc = table()
    const before = firstRowWidths(doc)
    expect(JSON.parse(doc.resizeTableCell(0, 1, 0, 0, 2, false, true))).toMatchObject({
      ok: true,
      moved: false,
    })
    expect(firstRowWidths(doc)).toEqual(before)
  })
})
