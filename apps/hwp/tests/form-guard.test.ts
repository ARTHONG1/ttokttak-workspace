import { describe, expect, it, vi } from 'vitest'
import type { AgentFormShape } from '../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import { analyzeForm, formContext, shapeChange } from '../src/renderer/ai/form-guard'

const SHAPE: AgentFormShape = {
  pages: 2,
  paragraphs: [12],
  objects: 3,
  partial: false,
  tables: [
    {
      rows: 3,
      cols: 4,
      cells: 12,
      paragraphs: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      box: { page: 0, x: 137.2, y: 178.7, width: 566.9, height: 80.1 },
    },
  ],
}

describe('the form analysis made when a document opens', () => {
  it('counts the pages, tables, fields and the empty answer cells', async () => {
    const bridge = {
      formShape: vi.fn(async () => SHAPE),
      listTables: vi.fn(async () => ({
        count: 1,
        partial: false,
        tables: [{ table: 1, rows: 3, cols: 4, near: '참가 신청서', preview: ['성명'] }],
      })),
      readTable: vi.fn(async () => ({
        ok: true as const,
        table: 1,
        rows: 3,
        cols: 4,
        cells: [
          { row: 1, col: 1, text: '성명' },
          { row: 1, col: 2, text: '' },
          { row: 1, col: 3, text: '  ' },
          { row: 2, col: 1, text: '', object: true as const },
          { row: 2, col: 2, text: '', fields: [1] },
        ],
      })),
      listFields: vi.fn(async () => [{ field: 1, name: '연락처', guide: '', value: '' }]),
    } as unknown as AgentBridge
    const profile = await analyzeForm(bridge)
    expect(profile).toMatchObject({ pages: 2, tableCount: 1, fields: 1, emptyCells: 2 })
    expect(profile.tables[0]).toMatchObject({ table: 1, rows: 3, cols: 4, emptyCells: 2 })
    expect(profile.tables[0]!.near).toBe('참가 신청서')
  })
})

describe('what the form lock compares', () => {
  it('finds no change when the form is the same', () => {
    expect(shapeChange(SHAPE, structuredClone(SHAPE))).toBeNull()
  })

  it('names a table that grew taller', () => {
    const after = structuredClone(SHAPE)
    after.tables[0]!.box!.height = 120
    expect(shapeChange(SHAPE, after)).toMatch(/table 1/)
  })

  it('names a page that was added, a paragraph, and an object', () => {
    expect(shapeChange(SHAPE, { ...SHAPE, pages: 3 })).toMatch(/page/)
    expect(shapeChange(SHAPE, { ...SHAPE, paragraphs: [13] })).toMatch(/paragraph/)
    expect(shapeChange(SHAPE, { ...SHAPE, objects: 2 })).toMatch(/object/)
  })

  it('names a new paragraph inside a cell and a moved table', () => {
    const inCell = structuredClone(SHAPE)
    inCell.tables[0]!.paragraphs[1] = 2
    expect(shapeChange(SHAPE, inCell)).toMatch(/table 1/)
    const moved = structuredClone(SHAPE)
    moved.tables[0]!.box!.y = 200
    expect(shapeChange(SHAPE, moved)).toMatch(/table 1/)
  })
})

describe('the form context of every AI request', () => {
  const profile = {
    pages: 2,
    tableCount: 1,
    emptyCells: 2,
    fields: 1,
    tables: [{ table: 1, rows: 3, cols: 4, emptyCells: 2, near: '참가 신청서' }],
  }

  it('asks to keep the form by default', () => {
    const text = formContext(profile, 'keep')
    expect(text).toMatch(/2 page/)
    expect(text).toMatch(/table 1: 3 rows × 4 columns/)
    expect(text).toMatch(/Keep this form/)
  })

  it('says only text may change while the lock is on', () => {
    const text = formContext(profile, 'lock')
    expect(text).toMatch(/양식 유지/)
    expect(text).toMatch(/Only text may change/)
  })

  it('still states the rules when the analysis is not there', () => {
    expect(formContext(null, 'lock')).toMatch(/Only text may change/)
  })
})
