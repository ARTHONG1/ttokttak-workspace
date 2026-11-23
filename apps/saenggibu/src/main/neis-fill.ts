import type { ElementHandle, Frame } from 'playwright-core'
import type { RecordMode, RecordPackage } from '../shared/record-package'

const HEADINGS: Record<RecordMode, string[]> = {
  subject: [
    '세부능력및특기사항',
    '교과별세부능력및특기사항',
    '과목별세부능력및특기사항',
    '개인별세부능력및특기사항',
  ],
  behavior: ['행동특성및종합의견'],
  activity: [
    '창의적체험활동특기사항',
    '자율활동특기사항',
    '자율자치활동특기사항',
    '동아리활동특기사항',
    '진로활동특기사항',
    '봉사활동특기사항',
  ],
}

type Selection = { kind: 'ready'; identity: string; name: string; text: string; editing: boolean }
type NotReady = { kind: 'no-screen' | 'selection' | 'multiple' | 'changed' }
type Grid = ElementHandle<HTMLElement>
interface GridQuery {
  headings: string[]
  grid?: HTMLElement
  editor?: HTMLTextAreaElement
  identity?: string
  action?: 'pin' | 'cell' | 'editor' | 'fill' | 'blur' | 'discard'
  text?: string
  deadline?: number
}

/** Runs in the frame. Readiness is read-only. Mutations revalidate the pinned grid and row. */
function neisGrid(query: GridQuery): Selection | NotReady | HTMLElement {
  const changed = { kind: 'changed' } as const
  const origin = window.origin === 'null' ? null : new URL(window.origin)
  if (
    origin?.protocol !== 'https:' ||
    origin.hostname === 'open.neis.go.kr' ||
    !(origin.hostname === 'neis.go.kr' || origin.hostname.endsWith('.neis.go.kr'))
  )
    return query.grid ? changed : { kind: 'no-screen' }
  if (query.deadline !== undefined && Date.now() >= query.deadline) return changed

  const visible = (el: Element): boolean =>
    el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible'
  const belongsTo = (el: Element, grid: Element): boolean => el.closest('.cl-grid') === grid
  const label = (el: Element): string =>
    (el.getAttribute('aria-label') || el.textContent || '').replace(/[\s·ㆍ]/g, '')
  const grids = Array.from(document.querySelectorAll<HTMLElement>('.cl-grid')).filter(visible)
  const candidates = grids.flatMap((grid) => {
    const headers = (selector: string) =>
      Array.from(grid.querySelectorAll(selector)).filter(
        (col) => belongsTo(col, grid) && visible(col),
      )
    const accessible = headers('[role="columnheader"]')
    const columns = accessible.length ? accessible : headers('.cl-grid-header .cl-grid-cell')
    const names = columns.filter((col) => ['성명', '이름', '학생명'].includes(label(col)))
    const entries = columns.filter((col) => query.headings.includes(label(col)))
    return names.length === 1 && entries.length === 1
      ? [{ grid, columns, nameColumn: names[0], textColumn: entries[0] }]
      : []
  })
  if (candidates.length === 0) return { kind: 'no-screen' }
  if (candidates.length > 1) return { kind: 'multiple' }
  const { grid, columns, nameColumn, textColumn } = candidates[0]
  if (query.grid && query.grid !== grid) return changed
  const rows = Array.from(grid.querySelectorAll<HTMLElement>('.cl-grid-row.cl-selected')).filter(
    (row) => belongsTo(row, grid) && visible(row),
  )
  if (!rows.length) return { kind: 'selection' }
  const rowIndex = (row: HTMLElement) =>
    row.getAttribute('aria-rowindex') ?? row.getAttribute('data-rowindex')
  if (
    rows.length > 2 ||
    (rows.length === 2 && (!rowIndex(rows[0]) || rowIndex(rows[0]) !== rowIndex(rows[1])))
  )
    return { kind: 'multiple' }

  // Frozen columns can split one selected student across panes. Use explicit column indexes
  // for split panes, and use DOM order only if a row contains all the identified headers.
  const rowCells = rows.map((row) =>
    Array.from(row.querySelectorAll<HTMLElement>('[role="gridcell"]')).filter(
      (cell) => belongsTo(cell, grid) && cell.closest('.cl-grid-row') === row,
    ),
  )
  const cells = rowCells.flat()
  const findCell = (column: Element): HTMLElement | undefined => {
    const at = columns.indexOf(column)
    const index = column.getAttribute('aria-colindex') ?? String(at + 1)
    const indexed = cells.filter((cell) => cell.getAttribute('aria-colindex') === index)
    if (indexed.length) return indexed.length === 1 ? indexed[0] : undefined
    if (
      rowCells.length === 1 &&
      rowCells[0].length === columns.length &&
      !cells.some((cell) => cell.hasAttribute('aria-colindex'))
    )
      return cells[at]
    return undefined
  }
  const nameCell = findCell(nameColumn)
  const cell = findCell(textColumn)
  const name = (nameCell?.textContent ?? '').replace(/\s+/g, '')
  if (!cell || !nameCell || !name || !visible(nameCell)) return { kind: 'selection' }
  const identity = JSON.stringify([
    rowIndex(rows[0]),
    label(textColumn),
    ...cells.filter((other) => other !== cell).map((other) => (other.textContent ?? '').trim()),
  ])
  if (query.identity !== undefined && query.identity !== identity) return changed

  const text = (cell.textContent ?? '').trim()
  const editors = Array.from(grid.querySelectorAll('textarea')).filter(visible)
  const editor =
    editors.length === 1 &&
    cell.contains(editors[0]) &&
    !editors[0].disabled &&
    !editors[0].readOnly
      ? editors[0]
      : null
  if (query.action === 'pin') return editors.length ? changed : grid
  if (query.action === 'cell') return editors.length ? changed : cell
  if (query.action === 'editor')
    return editor &&
      document.activeElement === editor &&
      (query.text === undefined || editor.value === query.text)
      ? editor
      : changed
  if (query.editor && query.editor !== editor) return changed
  const update = (editor: HTMLTextAreaElement, value: string) => {
    editor.value = value
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }
  if (query.action === 'fill') {
    if (
      !editor ||
      document.activeElement !== editor ||
      editor.value ||
      text ||
      query.text === undefined
    )
      return changed
    update(editor, query.text)
    if (editor.value !== query.text) return changed
    editor.setSelectionRange(editor.value.length, editor.value.length)
  }
  if (query.action === 'blur' || query.action === 'discard') {
    // A textarea that leaves Enter to the browser may append one line break.
    // Only touch the same editor while it still contains this request's draft.
    if (
      !editor ||
      query.text === undefined ||
      (editor.value !== query.text && editor.value !== query.text + '\n')
    )
      return changed
    if (query.action === 'discard') {
      update(editor, '')
    } else {
      if (document.activeElement !== editor) return changed
      if (editor.value !== query.text) update(editor, query.text)
      editor.blur()
    }
  } else if (query.editor && editor?.value !== query.text) {
    return changed
  }
  return { kind: 'ready', identity, name, text, editing: editors.length > 0 }
}

export async function probeNeis(frame: Frame, mode: RecordMode): Promise<Selection | NotReady> {
  const state = await frame.evaluate(neisGrid, { headings: HEADINGS[mode] })
  return state as Selection | NotReady
}

export async function pinNeis(
  frame: Frame,
  mode: RecordMode,
  identity: string,
): Promise<Grid | null> {
  const handle = await frame.evaluateHandle(neisGrid, {
    headings: HEADINGS[mode],
    identity,
    action: 'pin' as const,
  })
  const grid = handle.asElement() as Grid | null
  if (!grid) await handle.dispose()
  return grid
}

export async function fillNeis(
  frame: Frame,
  grid: Grid,
  initial: Selection,
  pkg: RecordPackage,
  options: { signal: AbortSignal; deadline: number; onVerifying: () => void },
): Promise<
  { ok: true; written: number; next: number; startedFrom?: number } | { ok: false; reason: string }
> {
  const { signal, deadline } = options
  const active = () => {
    signal.throwIfAborted()
    if (Date.now() >= deadline) throw new Error('neis-timeout')
  }
  const args = { headings: HEADINGS[pkg.mode], grid, deadline }
  type Query = Omit<GridQuery, 'grid' | 'headings' | 'deadline' | 'editor'> & {
    editor?: ElementHandle<HTMLTextAreaElement>
  }
  const inspect = async (query: Query = {}) => {
    active()
    const state = await frame.evaluate(neisGrid, { ...args, ...query })
    active()
    return state as Selection | NotReady
  }
  const target = (query: Query) => frame.evaluateHandle(neisGrid, { ...args, ...query })
  const press = async (
    action: 'cell' | 'editor',
    identity: string,
    key: string,
    text?: string,
  ): Promise<boolean> => {
    active()
    const handle = await target({ action, identity, text })
    try {
      active()
      const element = handle.asElement() as ElementHandle<HTMLElement> | null
      if (!element) return false
      await element.press(key, { timeout: 1_000 })
      active()
      return true
    } finally {
      await handle.dispose()
    }
  }
  const poll = async (ms: number, read: () => Promise<boolean>): Promise<boolean> => {
    const until = Date.now() + ms
    do {
      if (await read()) return true
      await new Promise((resolve) => setTimeout(resolve, 40))
    } while (Date.now() < until)
    return false
  }
  const write = async (identity: string, text: string): Promise<string | null> => {
    if (!(await press('cell', identity, 'F2'))) return '입력할 학생 선택이 바뀌었어요.'
    const readRow = async () => {
      const state = await inspect({ identity })
      if (state.kind !== 'ready') throw new Error('neis-selection-changed')
      return state
    }
    if (!(await poll(2_000, async () => (await readRow()).editing)))
      return '나이스 입력 칸을 열지 못했어요.'
    const handle = await target({ action: 'editor', identity })
    const editor = handle.asElement() as ElementHandle<HTMLTextAreaElement> | null
    let filled = false
    let verified = false
    try {
      if (!editor) return '선택한 학생의 편집기를 확인하지 못했어요.'
      filled = true // The page may have placed the draft before its reply is interrupted.
      const entered = await inspect({ action: 'fill', identity, text, editor })
      if (entered.kind !== 'ready') {
        filled = false
        return '입력 칸이 바뀌었거나 편집기에 다른 글이 있어요. 나이스 화면을 확인해 주세요.'
      }
      if (
        (await inspect({ identity, text, editor })).kind !== 'ready' ||
        !(await editor.evaluate((area) => document.activeElement === area))
      )
        return '입력할 학생 선택이 바뀌었어요.'
      active()
      await editor.press('Enter', { timeout: 1_000 })
      active()
      options.onVerifying()
      const closed = await poll(400, async () => !(await readRow()).editing)
      if (!closed) await inspect({ action: 'blur', identity, text, editor })
      verified = await poll(2_000, async () => {
        const state = await readRow()
        return !state.editing && state.text === text
      })
      return verified ? null : '입력값을 나이스 표에서 다시 확인하지 못했어요.'
    } finally {
      if (editor && filled && !verified) {
        await frame
          .evaluate(neisGrid, {
            ...args,
            deadline: undefined,
            action: 'discard' as const,
            identity,
            text,
            editor,
          })
          .catch(() => undefined)
      }
      await handle.dispose().catch(() => undefined)
    }
  }

  let written = 0
  const matches = (name: string, selection: Selection) =>
    Boolean(name) && name.replace(/\s+/g, '') === selection.name
  const startIndex = pkg.students.findIndex((student) => matches(student.name, initial))
  let index = Math.max(0, startIndex)
  const fail = (reason: string, resumeAt = index) => ({
    ok: false as const,
    reason:
      `${reason} ${written}명 입력 확인.` +
      (resumeAt < pkg.students.length
        ? ` 이어서 보내려면 ${resumeAt + 1}번째 학생(${pkg.students[resumeAt].name}) 줄을 선택해 주세요.`
        : ' 나이스 화면에 들어간 내용을 확인해 주세요.'),
  })
  const changed = () => fail('입력 화면이나 학생 선택이 바뀌었어요. 내용을 확인해 주세요.')

  try {
    if (startIndex < 0) return fail('보낼 학생의 이름과 선택된 나이스 줄이 달라요.')
    let expected = initial.identity
    for (; index < pkg.students.length; index++) {
      const student = pkg.students[index]
      const state = await inspect({ identity: expected })
      if (state.kind !== 'ready' || state.editing) return changed()
      if (!matches(student.name, state))
        return fail(`${index + 1}번째 학생(${student.name})의 이름과 선택된 나이스 줄이 달라요.`)
      const { identity, text } = state
      if (student.text) {
        if (text && text !== student.text)
          return fail(
            `${index + 1}번째 학생(${student.name}) 칸에 다른 글이 있어요. 기존 글을 확인해 주세요.`,
          )
        if (!text) {
          const error = await write(identity, student.text)
          if (error) return fail(error)
        } else {
          options.onVerifying()
        }
        active()
        written++
      }
      if (index + 1 < pkg.students.length) {
        const advance = () =>
          poll(300, async () => {
            const next = await inspect()
            if (next.kind !== 'ready' || next.editing || next.identity === identity) return false
            expected = next.identity
            return true
          })
        if (!(await press('cell', identity, 'Tab'))) return changed()
        let moved = await advance()
        if (!moved && (!student.text || text === student.text)) {
          // Some grids start Tab navigation only after the current editor has opened and closed.
          if (!(await press('cell', identity, 'F2'))) return changed()
          if (
            await poll(250, async () => {
              const state = await inspect({ identity })
              return state.kind === 'ready' && state.editing
            })
          )
            await press('editor', identity, 'Enter', text)
          await poll(500, async () => {
            const state = await inspect({ identity })
            return state.kind === 'ready' && !state.editing
          })
          if (!(await press('cell', identity, 'Tab'))) return changed()
          moved = await advance()
        }
        if (!moved) return fail('다음 나이스 줄로 이동하지 못했어요.', index + 1)
      }
    }
    return {
      ok: true,
      written,
      next: pkg.students.length,
      ...(startIndex > 0 ? { startedFrom: startIndex } : {}),
    }
  } catch {
    if (signal.aborted) return fail(String(signal.reason))
    if (Date.now() >= deadline) return fail('나이스 전송 시간이 지났어요.')
    return changed()
  }
}
