// The automatic path needs a confirmed entry column and never overwrites another text.
import {
  commitProtectedEditor,
  nextRow,
  openEditor,
  rowCells,
  SELECTED_ROW,
  textCell,
  type Wait,
} from '../../sites/neis/grid'
import { NEIS_BYTE_LIMIT, neisBytes, type RecordMode, type RecordStudent } from './package'

const GRID = '.cl-grid, [role="grid"]'
const HEADER = '.cl-grid-header-cell, [role="columnheader"]'
const compact = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, '')
const columnNames: Record<RecordMode, RegExp> = {
  subject: /^(세특|세부능력및특기사항)$/,
  behavior: /^행동특성(및|과)?종합의견$/,
  activity:
    /^(창의적체험활동(별)?특기사항|(?:자율(?:·자치)?|자치|동아리|진로|봉사)활동특기사항|특기사항\((?:자율(?:·자치)?|자치|동아리|진로|봉사)활동\))$/,
}

function visible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false
    const style = node.ownerDocument.defaultView?.getComputedStyle(node)
    if (style?.display === 'none' || style?.visibility === 'hidden') return false
    if (node === node.ownerDocument.body) break
  }
  return true
}

function modeColumn(grid: Element, mode: RecordMode): { header: Element; count: number } | null {
  const headers = Array.from(grid.querySelectorAll(HEADER)).filter(
    (header) => header.closest(GRID) === grid && visible(header),
  )
  const label = compact(grid.getAttribute('aria-label'))
  const matches = headers.filter((header) => {
    const title = compact(header.textContent)
    return columnNames[mode].test(title) || (title === '특기사항' && columnNames[mode].test(label))
  })
  if (matches.length !== 1) return null
  const header = matches[0]
  return columnIndex(header) || header === headers.at(-1) ? { header, count: headers.length } : null
}

const columnIndex = (el: Element) =>
  el.getAttribute('aria-colindex') ?? el.getAttribute('data-colindex')
type Target = { grid: Element; row: HTMLElement; cell: HTMLElement; identity: string }
type Probe = { state: 'absent' | 'waiting' | 'blocked' } | { state: 'ready'; target: Target }

export function probeRecord(doc: Document, mode: RecordMode, name: string): Probe {
  const grids = Array.from(doc.querySelectorAll(GRID)).flatMap((grid) => {
    const column = modeColumn(grid, mode)
    return column ? [{ grid, ...column }] : []
  })
  if (!grids.length) return { state: 'absent' }
  if (grids.length > 1) return { state: 'blocked' }
  const { grid, header, count } = grids[0]
  const rows = Array.from(doc.querySelectorAll<HTMLElement>(SELECTED_ROW)).filter(visible)
  if (!rows.length) return { state: 'waiting' }
  if (rows.some((row) => row.closest(GRID) !== grid)) return { state: 'blocked' }
  const rowIndex = (row: HTMLElement) =>
    row.getAttribute('aria-rowindex') ?? row.getAttribute('data-rowindex')
  const index = rowIndex(rows[0])
  if (rows.length > 1 && (!index || rows.some((row) => rowIndex(row) !== index))) {
    return { state: 'blocked' }
  }
  const row = rows[0]
  const cell = textCell(row)
  if (!cell || cell.getAttribute('aria-readonly') === 'true') return { state: 'waiting' }
  const headerIndex = columnIndex(header)
  if (headerIndex ? headerIndex !== columnIndex(cell) : count !== rowCells(row).length)
    return { state: 'waiting' }
  const names = rows
    .flatMap(rowCells)
    .filter((other) => other !== cell)
    .map((other) => compact(other.textContent))
  if (!name || !names.includes(compact(name))) return { state: 'waiting' }
  return { state: 'ready', target: { grid, row, cell, identity: JSON.stringify([index, names]) } }
}

type Outcome = { ok: true; written: number } | { ok: false; written: number; reason: string }

export async function fillProtectedGrid(
  doc: Document,
  mode: RecordMode,
  first: Target,
  students: readonly RecordStudent[],
  active: () => boolean,
  wait: Wait,
): Promise<Outcome> {
  let written = 0
  const stop = (index: number, reason: string): Outcome => ({
    ok: false,
    written,
    reason:
      reason +
      ' ' +
      written +
      '명 입력을 확인했어요. ' +
      (index + 1) +
      '번째 학생 줄부터 화면을 확인해 주세요.',
  })
  const names = students.map((student) => compact(student.name))
  if (names.some((name) => !name) || new Set(names).size !== names.length)
    return stop(0, '학생 이름을 각각 확인할 수 없어 자동 입력을 멈췄어요.')
  for (const [index, student] of students.entries()) {
    if (!active()) return stop(index, '자동 입력을 중단했어요.')
    const selection = probeRecord(doc, mode, student.name)
    if (selection.state !== 'ready' || selection.target.grid !== first.grid) {
      return stop(index, '입력할 학생 줄과 입력 열을 확인하지 못했어요.')
    }
    const target = selection.target
    const same = (expected: Target, actual: Target): boolean =>
      expected.cell === actual.cell &&
      expected.row === actual.row &&
      expected.identity === actual.identity
    const stillSelected = (): boolean => {
      if (!active()) return false
      const current = probeRecord(doc, mode, student.name)
      return current.state === 'ready' && same(target, current.target)
    }
    if (index === 0 && !same(first, target)) return stop(index, '입력할 학생 줄이 바뀌었어요.')
    if (student.text) {
      const cellValue = () => (target.cell.textContent ?? '').trim()
      const existing = cellValue()
      if (target.cell.querySelector('textarea') || (existing && existing !== student.text))
        return stop(index, '칸에 기존 글이나 편집 중인 글이 있어요.')
      if (neisBytes(student.text) > NEIS_BYTE_LIMIT)
        return stop(index, '글이 바이트 제한을 넘어요.')
      if (existing !== student.text) {
        const editor = await openEditor(doc, target.cell, wait, stillSelected)
        if (!editor || !stillSelected() || editor.value.trim())
          return stop(index, '비어 있는 입력 칸을 확인하지 못했어요.')
        if (
          !commitProtectedEditor(
            editor,
            student.text,
            () => stillSelected() && target.cell.contains(editor),
          )
        )
          return stop(index, '입력할 칸이나 내용이 바뀌었어요.')
        for (let i = 0; i < 10 && stillSelected(); i++) {
          if (!target.cell.querySelector('textarea') && cellValue() === student.text) break
          await wait(50)
        }
        if (
          !stillSelected() ||
          target.cell.querySelector('textarea') ||
          cellValue() !== student.text
        )
          return stop(index, '입력값을 나이스 표에서 다시 확인하지 못했어요.')
      }
      written++
    }
    if (index < students.length - 1) {
      if (!stillSelected()) return stop(index + 1, '자동 입력을 중단했어요.')
      target.cell.focus()
      if (!stillSelected() || !(await nextRow(doc, target.cell, wait)))
        return stop(index + 1, '다음 학생 줄로 이동하지 못했어요.')
    }
  }
  return { ok: true, written }
}
