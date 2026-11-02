import { describe, expect, it, vi } from 'vitest'
import type { AgentToolCall } from '@genoffice/agent-core'
import type { AgentFormShape } from '../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import type { FormMode } from '../src/renderer/ai/form-guard'
import { createHwpSkill, type HwpChange } from '../src/renderer/ai/hwp-skill'

const PLACE = { sec: 0, para: 1, offset: 0, length: 3 }

const shape = (height: number): AgentFormShape => ({
  pages: 1,
  paragraphs: [3],
  objects: 1,
  partial: false,
  tables: [
    {
      rows: 2,
      cols: 2,
      cells: 4,
      paragraphs: [1, 1, 1, 1],
      box: { page: 0, x: 10, y: 20, width: 500, height },
    },
  ],
})

function setup(mode: FormMode, heights: number[] = [40, 40]) {
  const shapes = heights.map(shape)
  const bridge = {
    foreignChanges: vi.fn(async () => 7),
    formShape: vi.fn(async () => shapes.shift() ?? shape(40)),
    undo: vi.fn(async () => ({ ok: true, undone: 1 })),
    replaceText: vi.fn(async () => ({ ok: true as const, count: 1, inTable: true, place: PLACE })),
    formatText: vi.fn(async () => ({ ok: true as const, count: 1 })),
    fillCells: vi.fn(async () => ({ ok: true as const, table: 1, count: 1, place: PLACE })),
    readText: vi.fn(async () => '신청서'),
    listFields: vi.fn(async () => []),
    listTables: vi.fn(async () => ({ count: 1, partial: false, tables: [] })),
    listNotes: vi.fn(async () => ({ count: 0, elsewhere: 0, notes: [] })),
    listStyles: vi.fn(async () => ({ paragraph: [], character: [] })),
    listMemos: vi.fn(async () => ({ count: 0, memos: [] })),
  } as unknown as AgentBridge
  const changes: HwpChange[] = []
  const { skill, refreshContext } = createHwpSkill({
    bridge,
    label: (key) => key,
    onChange: (change) => changes.push(change),
    confirmMemoRemoval: async () => false,
    formMode: () => mode,
    formProfile: () => ({
      pages: 1,
      tableCount: 1,
      emptyCells: 2,
      fields: 0,
      tables: [{ table: 1, rows: 2, cols: 2, emptyCells: 2, near: '신청서' }],
    }),
  })
  const call = (name: string, input: Record<string, unknown>) =>
    skill.executeTool({ id: '1', name, input } satisfies AgentToolCall)
  return { bridge, changes, call, skill, refreshContext }
}

describe('양식 유지 (the form lock)', () => {
  it('refuses a formatting tool without touching the document', async () => {
    const { bridge, call, changes } = setup('lock')
    const result = await call('format_text', { find: '신청서', bold: true })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/양식 유지/)
    expect(bridge.formatText).not.toHaveBeenCalled()
    expect(changes).toHaveLength(0)
  })

  it('takes back a text change that made a table taller', async () => {
    const { bridge, call, changes } = setup('lock', [40, 90])
    const result = await call('replace_text', { find: '홍길동', replace: '홍길동 외 3명' })
    expect(bridge.undo).toHaveBeenCalledWith(1, 7)
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/table 1/)
    expect(changes).toHaveLength(0)
  })

  it('keeps a text change that leaves the form as it was', async () => {
    const { bridge, call, changes } = setup('lock', [40, 40])
    const result = await call('replace_text', { find: '3월 2일', replace: '3월 9일' })
    expect(result.isError).toBeFalsy()
    expect(bridge.undo).not.toHaveBeenCalled()
    expect(changes).toHaveLength(1)
  })

  it("fills cells in the cell's own look", async () => {
    const { bridge, call } = setup('lock')
    await call('fill_cells', { table: 1, cells: [{ row: 1, col: 2, text: '홍길동' }] })
    expect(bridge.fillCells).toHaveBeenCalledWith(1, [{ row: 1, col: 2, text: '홍길동' }], false, {
      keepLook: true,
    })
  })

  it('tells the model the form and the lock with every request', async () => {
    const { skill, refreshContext } = setup('lock')
    await refreshContext()
    const context = skill.buildContext?.() ?? ''
    expect(context).toMatch(/table 1: 2 rows × 2 columns/)
    expect(context).toMatch(/Only text may change/)
  })
})

describe('the default form keeping (양식 유지 off)', () => {
  it('lets a formatting tool run, without comparing the form', async () => {
    const { bridge, call } = setup('keep')
    const result = await call('format_text', { find: '신청서', bold: true })
    expect(result.isError).toBeFalsy()
    expect(bridge.formatText).toHaveBeenCalled()
    expect(bridge.formShape).not.toHaveBeenCalled()
  })

  it('asks the model to keep the form', async () => {
    const { skill, refreshContext } = setup('keep')
    await refreshContext()
    expect(skill.buildContext?.() ?? '').toMatch(/Keep this form/)
  })
})
