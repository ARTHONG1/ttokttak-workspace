/**
 * 서식 고정 (the form lock) against the real rhwp engine: the format ids the lock compares,
 * and the numbering it puts right after an item was added or removed. The editor's history
 * is modelled by snapshots, as in agent-plugin-engine.test.ts.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

function open(lines: string[]) {
  let doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  const history: Uint8Array[] = []
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      const before = doc.exportHwp()
      try {
        const result = fn({ doc: () => doc, deferPagination: () => {} } as never)
        history.push(before)
        return result
      } catch (thrown) {
        doc = new HwpDocument(before)
        throw thrown
      }
    },
    events: { on: () => {} },
    automation: {
      execute: (command: string) => {
        if (command !== 'edit:undo') return null
        const before = history.pop()
        if (!before) return { ok: false }
        doc = new HwpDocument(before)
        return { ok: true }
      },
    },
  } as unknown as AgentPluginHost
  const plugin = agentPlugin.activate(host)
  const lineOf = (k: number) => {
    const length = doc.getParagraphLength(0, k)
    return length ? doc.getTextRange(0, k, 0, length) : ''
  }
  return {
    plugin,
    doc: () => doc,
    steps: () => history.length,
    lines: () => Array.from({ length: doc.getParagraphCount(0) }, (_, k) => lineOf(k)),
    /** a paragraph put in the way the AI's insert puts one: Enter after paragraph k */
    insertAfter: (k: number, text: string) => {
      doc.splitParagraph(0, k, doc.getParagraphLength(0, k))
      doc.insertText(0, k + 1, 0, text)
    },
    remove: (k: number) => {
      doc.deleteRange(0, k - 1, doc.getParagraphLength(0, k - 1), k, doc.getParagraphLength(0, k))
    },
    charAt: (k: number) =>
      (
        JSON.parse(doc.getCharShapeRuns(0, k, 0, doc.getParagraphLength(0, k))) as {
          charShapeId: number
        }[]
      )[0]!.charShapeId,
  }
}

describe('the format ids the form lock compares', () => {
  it('lists the character and paragraph shapes the document uses', () => {
    const { plugin } = open(['제목', '본문입니다.'])
    const { formats } = plugin.formShape()
    expect(formats.char.length).toBeGreaterThan(0)
    expect(formats.para.length).toBeGreaterThan(0)
  })

  it('shows a new character shape once text is made bold', () => {
    const { plugin } = open(['제목', '본문입니다.'])
    const before = plugin.formShape().formats.char
    plugin.formatText('본문', null, false, { bold: true })
    const after = plugin.formShape().formats.char
    expect(after.some((id) => !before.includes(id))).toBe(true)
  })

  it('shows no new shape for a paragraph added like the one before it', () => {
    const editor = open(['1. 목적', '- 내용입니다.'])
    const before = editor.plugin.formShape().formats
    editor.plugin.insertParagraphs('내용입니다', null, 'after', ['- 둘째 내용입니다.'])
    const after = editor.plugin.formShape().formats
    expect(after.char.every((id) => before.char.includes(id))).toBe(true)
    expect(after.para.every((id) => before.para.includes(id))).toBe(true)
  })
})

describe('the numbering the form lock puts right', () => {
  it('numbers on after an item put in the middle', () => {
    const editor = open(['1. 운영 목적', '- 내용', '2. 일정', '- 내용', '3. 안전'])
    editor.insertAfter(3, '3. 새 항목')
    const result = editor.plugin.renumberAround({ sec: 0, para: 4 })
    expect(result).toMatchObject({ ok: true, count: 1 })
    expect(editor.lines()).toEqual([
      '1. 운영 목적',
      '- 내용',
      '2. 일정',
      '- 내용',
      '3. 새 항목',
      '4. 안전',
    ])
    // one step of the editor's history, so it is taken back with the change
    expect(editor.steps()).toBe(1)
  })

  it('closes the gap an item left behind', () => {
    const editor = open(['1) 첫째', '2) 둘째', '3) 셋째', '4) 넷째'])
    editor.remove(1)
    const result = editor.plugin.renumberAround({ sec: 0, para: 1 })
    expect(result).toMatchObject({ ok: true, count: 2 })
    expect(editor.lines()).toEqual(['1) 첫째', '2) 셋째', '3) 넷째'])
  })

  it('numbers Korean letters and circled numbers in their own order', () => {
    const editor = open(['가. 첫째', '나. 둘째', '① 하나', '② 둘'])
    editor.insertAfter(0, '가. 새 항목')
    editor.plugin.renumberAround({ sec: 0, para: 1 })
    expect(editor.lines().slice(0, 3)).toEqual(['가. 첫째', '나. 새 항목', '다. 둘째'])
    expect(editor.lines().slice(3)).toEqual(['① 하나', '② 둘'])
  })

  it('leaves another kind of list alone, and stops at it', () => {
    const editor = open(['1. 목적', '1) 가', '2) 나', '2. 일정', '1) 다', '3. 안전'])
    editor.insertAfter(4, '3. 새 항목')
    editor.plugin.renumberAround({ sec: 0, para: 5 })
    expect(editor.lines()).toEqual([
      '1. 목적',
      '1) 가',
      '2) 나',
      '2. 일정',
      '1) 다',
      '3. 새 항목',
      '4. 안전',
    ])
  })

  it('keeps the look of the number it rewrites', () => {
    const editor = open(['1. 첫째', '2. 둘째'])
    const look = editor.charAt(1)
    editor.insertAfter(0, '2. 새 항목')
    editor.plugin.renumberAround({ sec: 0, para: 1 })
    expect(editor.lines()[2]).toBe('3. 둘째')
    expect(editor.charAt(2)).toBe(look)
  })

  it('changes nothing, and adds no step, when the numbers are already in order', () => {
    const editor = open(['1. 첫째', '2. 둘째'])
    expect(editor.plugin.renumberAround({ sec: 0, para: 1 })).toMatchObject({ ok: true, count: 0 })
    expect(editor.steps()).toBe(0)
  })
})

describe('content growing along the form', () => {
  it('adds table rows and columns without new formatting', () => {
    const editor = open(['신청서', ''])
    editor
      .doc()
      .pasteHtml(
        0,
        1,
        0,
        '<table><tr><td>구분</td><td>내용</td></tr><tr><td>1차</td><td>견학</td></tr></table>',
      )
    const before = editor.plugin.formShape().formats
    expect(editor.plugin.addTableLines(1, 'rows', 2, 'after', 1)).toMatchObject({ ok: true })
    expect(editor.plugin.addTableLines(1, 'columns', 2, 'after', 1)).toMatchObject({ ok: true })
    const after = editor.plugin.formShape().formats
    expect(after.char.every((id) => before.char.includes(id))).toBe(true)
    expect(after.para.every((id) => before.para.includes(id))).toBe(true)
  })

  it('finds the document whole after a save and a reopen', () => {
    const editor = open(['1. 첫째', '2. 둘째', ''])
    editor.doc().pasteHtml(0, 2, 0, '<table><tr><td>가</td><td>나</td></tr></table>')
    expect(editor.plugin.checkRoundTrip()).toEqual({ ok: true })
  })
})
