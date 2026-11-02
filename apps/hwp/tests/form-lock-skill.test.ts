import { describe, expect, it, vi } from 'vitest'
import type { AgentToolCall } from '@genoffice/agent-core'
import type { AgentFormShape } from '../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import type { FormMode } from '../src/renderer/ai/form-guard'
import { createHwpSkill, type HwpChange } from '../src/renderer/ai/hwp-skill'

const PLACE = { sec: 0, para: 4, offset: 0, length: 3 }

const shape = (overrides: Partial<AgentFormShape> = {}): AgentFormShape => ({
  pages: 1,
  paragraphs: [6],
  objects: 1,
  partial: false,
  formats: { char: [0, 5], para: [0, 1] },
  tables: [
    {
      rows: 2,
      cols: 2,
      cells: 4,
      paragraphs: [1, 1, 1, 1],
      box: { page: 0, x: 10, y: 20, width: 500, height: 40 },
    },
  ],
  ...overrides,
})

function setup(
  mode: FormMode,
  options: {
    shapes?: AgentFormShape[]
    texts?: string[]
    renumbered?: number
    whole?: boolean
    matched?: number
  } = {},
) {
  const shapes = options.shapes ?? [shape(), shape()]
  const texts = options.texts ?? ['신청서\n3월 2일', '신청서\n3월 9일']
  const bridge = {
    foreignChanges: vi.fn(async () => 7),
    formShape: vi.fn(async () => shapes.shift() ?? shape()),
    undo: vi.fn(async () => ({ ok: true, undone: 1 })),
    checkRoundTrip: vi.fn(async () =>
      options.whole === false ? { ok: false, reason: 'unreadable' } : { ok: true },
    ),
    matchListLook: vi.fn(async () => ({ ok: true as const, count: options.matched ?? 0 })),
    renumberAround: vi.fn(async () => ({
      ok: true as const,
      count: options.renumbered ?? 0,
      place: PLACE,
    })),
    replaceText: vi.fn(async () => ({ ok: true as const, count: 1, inTable: true, place: PLACE })),
    formatText: vi.fn(async () => ({ ok: true as const, count: 1 })),
    insertParagraphs: vi.fn(async () => ({
      ok: true as const,
      count: 1,
      inTable: false,
      place: PLACE,
    })),
    addTableLines: vi.fn(async () => ({
      ok: true as const,
      table: 1,
      rows: 3,
      cols: 2,
      first: 2,
      count: 1,
      place: PLACE,
    })),
    readTable: vi.fn(async () => ({
      ok: true as const,
      table: 1,
      rows: 3,
      cols: 2,
      cells: [
        { row: 1, col: 1, text: '구분' },
        { row: 1, col: 2, text: '내용' },
        { row: 2, col: 1, text: '1차' },
        { row: 3, col: 1, text: '합계' },
      ],
    })),
    fillCells: vi.fn(async () => ({ ok: true as const, table: 1, count: 1, place: PLACE })),
    readText: vi.fn(async () => texts.shift() ?? ''),
    listFields: vi.fn(async () => []),
    listTables: vi.fn(async () => ({ count: 1, partial: false, tables: [] })),
    listNotes: vi.fn(async () => ({ count: 0, elsewhere: 0, notes: [] })),
    listStyles: vi.fn(async () => ({ paragraph: [], character: [] })),
    listMemos: vi.fn(async () => ({ count: 0, memos: [] })),
  } as unknown as AgentBridge
  const changes: HwpChange[] = []
  const { skill, refreshContext } = createHwpSkill({
    bridge,
    label: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    onChange: (change) => changes.push(change),
    confirmMemoRemoval: async () => false,
    formMode: () => mode,
    formProfile: () => ({
      pages: 1,
      tableCount: 1,
      emptyCells: 2,
      fields: 0,
      lists: [{ marker: '1.', count: 3 }],
      tables: [{ table: 1, rows: 2, cols: 2, emptyCells: 2, near: '신청서' }],
    }),
  })
  const call = (name: string, input: Record<string, unknown>) =>
    skill.executeTool({ id: '1', name, input } satisfies AgentToolCall)
  return { bridge, changes, call, skill, refreshContext }
}

describe('서식 고정 (the formatting lock)', () => {
  it('refuses a formatting tool without touching the document', async () => {
    const { bridge, call, changes } = setup('lock')
    const result = await call('format_text', { find: '신청서', bold: true })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/서식 고정/)
    expect(bridge.formatText).not.toHaveBeenCalled()
    expect(changes).toHaveLength(0)
  })

  it('keeps a text change that left the formatting as it was, even when the table grew', async () => {
    const grown = shape()
    grown.tables[0]!.box!.height = 90
    const { bridge, call, changes } = setup('lock', { shapes: [shape(), grown] })
    const result = await call('replace_text', { find: '3월 2일', replace: '3월 9일' })
    expect(result.isError).toBeFalsy()
    expect(bridge.undo).not.toHaveBeenCalled()
    expect(changes).toHaveLength(1)
  })

  it('takes back a change that brought in formatting the document did not have', async () => {
    const { bridge, call, changes } = setup('lock', {
      shapes: [shape(), shape({ formats: { char: [0, 5, 9], para: [0, 1] } })],
    })
    const result = await call('replace_text', { find: '3월 2일', replace: '3월 9일' })
    expect(bridge.undo).toHaveBeenCalledWith(1, 7)
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/formatting/)
    expect(changes).toHaveLength(0)
  })

  it('takes back a change that altered text it did not report', async () => {
    const { bridge, call, changes } = setup('lock', {
      texts: ['신청서\n3월 2일\n준비물', '신청서\n3월 9일\n준비물 없음'],
    })
    const result = await call('replace_text', { find: '3월 2일', replace: '3월 9일' })
    expect(bridge.undo).toHaveBeenCalledWith(1, 7)
    expect(result.output).toMatch(/준비물 없음/)
    expect(changes).toHaveLength(0)
  })

  it('lets a paragraph be added, matches its look and renumbers the list in the same run', async () => {
    const { bridge, call, changes } = setup('lock', {
      texts: ['1. 목적\n2. 안전', '1. 목적\n2. 새 항목\n3. 안전'],
      renumbered: 1,
      matched: 1,
    })
    const result = await call('insert_paragraphs', {
      anchor: '목적',
      where: 'after',
      paragraphs: ['2. 새 항목'],
    })
    expect(result.isError).toBeFalsy()
    expect(bridge.matchListLook).toHaveBeenCalledWith({ sec: 0, para: 4, count: 1 })
    expect(bridge.renumberAround).toHaveBeenCalledWith({ sec: 0, para: 4 })
    expect(changes).toHaveLength(3)
    expect(changes[1]!.to).toMatch(/formMatchedLook/)
    expect(changes[2]!.to).toMatch(/formRenumbered/)
  })

  it('lets table rows be added, and shows the table after it', async () => {
    const { call } = setup('lock')
    const result = await call('add_to_table', { table: 1, what: 'rows', at: 2, where: 'after' })
    expect(result.isError).toBeFalsy()
    expect(result.output).toMatch(/1차/)
    expect(result.output).toMatch(/합계/)
  })

  it('takes back a row added to a document that no longer survives a save', async () => {
    const { bridge, call, changes } = setup('lock', { whole: false })
    const result = await call('add_to_table', { table: 1, what: 'rows', at: 2, where: 'after' })
    expect(bridge.undo).toHaveBeenCalledWith(1, 7)
    expect(result.isError).toBe(true)
    expect(changes).toHaveLength(0)
  })

  it("fills cells in the cell's own look", async () => {
    const { bridge, call } = setup('lock')
    await call('fill_cells', { table: 1, cells: [{ row: 1, col: 2, text: '홍길동' }] })
    expect(bridge.fillCells).toHaveBeenCalledWith(1, [{ row: 1, col: 2, text: '홍길동' }], false, {
      keepLook: true,
    })
  })

  it('tells the model the form and what the lock allows with every request', async () => {
    const { skill, refreshContext } = setup('lock')
    await refreshContext()
    const context = skill.buildContext?.() ?? ''
    expect(context).toMatch(/table 1: 2 rows × 2 columns/)
    expect(context).toMatch(/서식 고정/)
  })
})

describe('the default form keeping (서식 고정 off)', () => {
  it('lets a formatting tool run, without comparing the form or renumbering', async () => {
    const { bridge, call } = setup('keep')
    const result = await call('format_text', { find: '신청서', bold: true })
    expect(result.isError).toBeFalsy()
    expect(bridge.formatText).toHaveBeenCalled()
    expect(bridge.formShape).not.toHaveBeenCalled()
    await call('insert_paragraphs', { anchor: '목적', where: 'after', paragraphs: ['새 문단'] })
    expect(bridge.renumberAround).not.toHaveBeenCalled()
  })

  it('asks the model to keep the form', async () => {
    const { skill, refreshContext } = setup('keep')
    await refreshContext()
    expect(skill.buildContext?.() ?? '').toMatch(/Keep this form/)
  })
})
