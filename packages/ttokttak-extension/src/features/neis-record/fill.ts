/**
 * Types one class's texts into the NEIS grid, student by student from the selected row
 * down. It stops rather than guess: when no row is selected, when the row is another
 * student's, when the editor does not open, or when the grid does not move on to the next
 * row. What it reports says where to pick up again.
 */
import {
  closeEditor,
  nextRow,
  openEditor,
  selectedRow,
  selectedRowHasName,
  textCell,
  type Wait,
} from '../../sites/neis/grid'
import type { RecordStudent } from './package'

export interface FillOptions {
  /** fill a row only when it shows the student's name (a student without a name always fits) */
  checkNames: boolean
  /** a cell that already holds a text: write after it, or instead of it */
  whenFilled: 'append' | 'replace'
  /** the student to start with (0 first), on the selected row */
  from: number
}

export type StopReason = 'no-row' | 'name' | 'no-editor' | 'stuck' | 'stopped'

export interface FillResult {
  /** rows a text went into */
  written: number
  /** rows passed over because the student has no text */
  passed: number
  /** the student to go on with; students.length when all are done */
  next: number
  stop: { reason: StopReason; message: string } | null
}

export interface FillHooks {
  wait: Wait
  /** before each student */
  progress?(index: number, student: RecordStudent): void
  shouldStop?(): boolean
  /** the 똑딱 panel's own element on the page */
  panelHost?: Element | null
}

const who = (index: number, student: RecordStudent): string =>
  index + 1 + '번째 학생' + (student.name ? '(' + student.name + ')' : '')

export async function fillGrid(
  doc: Document,
  students: readonly RecordStudent[],
  options: FillOptions,
  hooks: FillHooks,
): Promise<FillResult> {
  let written = 0
  let passed = 0
  const stopAt = (index: number, reason: StopReason, message: string): FillResult => ({
    written,
    passed,
    next: index,
    stop: { reason, message },
  })
  for (let i = options.from; i < students.length; i++) {
    const student = students[i]
    if (hooks.shouldStop?.()) return stopAt(i, 'stopped', who(i, student) + ' 앞에서 멈췄어요.')
    hooks.progress?.(i, student)
    const row = selectedRow(doc)
    if (!row) return stopAt(i, 'no-row', '나이스 표에서 선택된 학생 줄을 찾지 못했어요.')
    if (options.checkNames && !selectedRowHasName(doc, student.name)) {
      return stopAt(
        i,
        'name',
        '선택된 줄이 ' +
          who(i, student) +
          '의 줄이 아니에요. 다른 학생의 칸에 넣지 않으려고 멈췄어요.',
      )
    }
    const cell = textCell(row)
    if (!cell) return stopAt(i, 'no-editor', '선택된 줄에서 글을 넣을 칸을 찾지 못했어요.')
    // a student without a text goes through the same keys with the cell left as it is, so
    // the grid moves on to the next row the same way
    const editor = await openEditor(doc, cell, hooks.wait)
    if (!editor) {
      return stopAt(i, 'no-editor', who(i, student) + '의 칸이 입력 상태로 열리지 않았어요.')
    }
    if (student.text) {
      const existing = editor.value.trim()
      await closeEditor(
        editor,
        options.whenFilled === 'append' && existing ? existing + ' ' + student.text : student.text,
        hooks.wait,
      )
      written += 1
    } else {
      await closeEditor(editor, null, hooks.wait)
      passed += 1
    }
    if (i < students.length - 1 && !(await nextRow(doc, cell, hooks.wait, hooks.panelHost))) {
      return stopAt(
        i + 1,
        'stuck',
        who(i, student) + '까지 넣었는데, 표가 다음 학생 줄로 넘어가지 않았어요.',
      )
    }
  }
  return { written, passed, next: students.length, stop: null }
}
