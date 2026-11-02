import { describe, expect, it, vi } from 'vitest'
import type { AgentFormShape } from '../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import {
  analyzeForm,
  formContext,
  shapeChange,
  unexplainedLines,
} from '../src/renderer/ai/form-guard'

const SHAPE: AgentFormShape = {
  pages: 2,
  paragraphs: [12],
  objects: 3,
  partial: false,
  formats: { char: [0, 5, 6], para: [0, 1, 2] },
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
  it('counts the pages, tables, fields, empty answer cells and the lists in use', async () => {
    const bridge = {
      formShape: vi.fn(async () => SHAPE),
      readText: vi.fn(async () => '1. 운영 목적\n- 첫째\n- 둘째\n2. 일정\n3. 안전\n가. 출발'),
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
    expect(profile.lists).toEqual([
      { marker: '1.', count: 3 },
      { marker: '-', count: 2 },
      { marker: '가.', count: 1 },
    ])
  })
})

describe('what 서식 고정 compares', () => {
  it('finds no change when the form is the same', () => {
    expect(shapeChange(SHAPE, structuredClone(SHAPE))).toBeNull()
  })

  it('lets the content grow along the form: rows, columns, paragraphs, pages, taller tables', () => {
    const grown = structuredClone(SHAPE)
    grown.pages = 3
    grown.paragraphs = [14]
    grown.tables[0]!.rows = 4
    grown.tables[0]!.cols = 5
    grown.tables[0]!.cells = 20
    grown.tables[0]!.paragraphs = new Array(20).fill(1)
    grown.tables[0]!.box!.height = 120
    expect(shapeChange(SHAPE, grown)).toBeNull()
  })

  it('names formatting the document did not have', () => {
    expect(
      shapeChange(SHAPE, { ...SHAPE, formats: { char: [0, 5, 6, 9], para: [0, 1, 2] } }),
    ).toMatch(/formatting/)
    expect(
      shapeChange(SHAPE, { ...SHAPE, formats: { char: [0, 5, 6], para: [0, 1, 2, 7] } }),
    ).toMatch(/formatting/)
  })

  it('lets formatting go out of use (the text that had it was removed)', () => {
    expect(shapeChange(SHAPE, { ...SHAPE, formats: { char: [0, 6], para: [0, 1] } })).toBeNull()
  })

  it('names an object or a table that was added or removed', () => {
    expect(shapeChange(SHAPE, { ...SHAPE, objects: 2 })).toMatch(/object/)
    expect(shapeChange(SHAPE, { ...SHAPE, tables: [] })).toMatch(/table/)
  })
})

describe('text the change did not report', () => {
  const replace = (from: string, to: string) => ({ kind: 'replace' as const, from, to, count: 1 })

  it('finds nothing when only the reported text changed', () => {
    expect(
      unexplainedLines('제목\n3월 2일 출발', '제목\n3월 9일 출발', [replace('3월 2일', '3월 9일')]),
    ).toEqual([])
  })

  it('finds a line that changed with no change saying so', () => {
    expect(
      unexplainedLines('제목\n3월 2일 출발\n준비물', '제목\n3월 9일 출발\n준비물 없음', [
        replace('3월 2일', '3월 9일'),
      ]),
    ).toEqual(['준비물 없음'])
  })

  it('accepts added paragraphs and renumbered lines', () => {
    expect(
      unexplainedLines('1. 목적\n2. 안전', '1. 목적\n2. 새 항목\n3. 안전', [
        { kind: 'insert', from: '', to: '2. 새 항목', count: 1 },
        { kind: 'replace', from: '', to: '번호', count: 1 },
      ]),
    ).toEqual([])
  })

  it('accepts several paragraphs added in one call, as the change list joins them', () => {
    expect(
      unexplainedLines('1. 목적\n2. 일정', '1. 목적\n2. 사전 준비\n- 동의서를 받음.\n3. 일정', [
        { kind: 'insert', from: '', to: '2. 사전 준비 ⏎ - 동의서를 받음.', count: 2 },
        { kind: 'replace', from: '', to: '번호', count: 1 },
      ]),
    ).toEqual([])
  })

  it('accepts text the call asked for even when the change list cut it short', () => {
    const long = '가'.repeat(250)
    expect(
      unexplainedLines(
        '제목',
        `제목\n${long}`,
        [{ kind: 'insert', from: '', to: '가…', count: 1 }],
        [long],
      ),
    ).toEqual([])
  })
})

describe('the form context of every AI request', () => {
  const profile = {
    pages: 2,
    tableCount: 1,
    emptyCells: 2,
    fields: 1,
    lists: [{ marker: '1.', count: 3 }],
    tables: [{ table: 1, rows: 3, cols: 4, emptyCells: 2, near: '참가 신청서' }],
  }

  it('asks to keep the form by default', () => {
    const text = formContext(profile, 'keep')
    expect(text).toMatch(/2 page/)
    expect(text).toMatch(/table 1: 3 rows × 4 columns/)
    expect(text).toMatch(/"1\." \(3\)/)
    expect(text).toMatch(/Keep this form/)
  })

  it('says what 서식 고정 allows and refuses while it is on', () => {
    const text = formContext(profile, 'lock')
    expect(text).toMatch(/서식 고정/)
    expect(text).toMatch(/rows and columns/)
    expect(text).toMatch(/renumber/)
    expect(text).toMatch(/refused/)
  })

  it('still states the rules when the analysis is not there', () => {
    expect(formContext(null, 'lock')).toMatch(/서식 고정/)
  })
})
