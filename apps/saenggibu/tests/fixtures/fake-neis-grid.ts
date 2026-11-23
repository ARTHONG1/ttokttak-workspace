/**
 * A stand-in for the NEIS student grid, for the unit tests (jsdom) and the browser test
 * page. It behaves the way the fill relies on: a click selects a row, F2 on the selected
 * row's last cell opens a textarea editor holding the cell's text, Enter keeps it, and Tab
 * from the last cell selects the next row. Keys that land outside the grid do nothing.
 */
export interface FakeRow {
  name: string
  text?: string
}

export interface FakeNeis {
  grid: HTMLElement
  /** select a row as a teacher's click does (0 first) */
  select(index: number): void
  texts(): string[]
  selected(): number
  /** how many times an editor was opened */
  edits(): number
}

export interface FakeNeisOptions {
  /** The editable column as labelled on this screen. */
  heading?: string
  /** The editor closes, but the grid rejects the change. */
  discard?: boolean
  /** Enter leaves the editor open. The grid commits on blur. */
  blurCommit?: boolean
  /** Tab does not leave this row (0 first) */
  stuckAt?: number
  /** F2 opens no editor on this row */
  noEditorAt?: number
}

export function mountFakeNeis(
  doc: Document,
  rows: readonly FakeRow[],
  options: FakeNeisOptions = {},
): FakeNeis {
  const texts = rows.map((r) => r.text ?? '')
  let selected = -1
  let edits = 0
  const el = (tag: string, cls: string): HTMLElement => {
    const node = doc.createElement(tag)
    node.className = cls
    return node
  }
  const grid = el('div', 'cl-grid')
  grid.setAttribute('role', 'grid')
  const header = el('div', 'cl-grid-header')
  for (const label of ['번호', '성명', options.heading ?? '세부능력 및 특기사항']) {
    const column = el('div', 'cl-grid-cell')
    column.setAttribute('role', 'columnheader')
    column.textContent = label
    header.append(column)
  }
  grid.append(header)
  const rowEls = rows.map((row, i) => {
    const rowEl = el('div', 'cl-grid-row')
    rowEl.setAttribute('aria-rowindex', String(i + 1))
    for (const value of [String(i + 1), row.name, texts[i]]) {
      const cell = el('div', 'cl-grid-cell')
      cell.setAttribute('role', 'gridcell')
      cell.tabIndex = -1
      cell.textContent = value
      rowEl.append(cell)
    }
    rowEl.addEventListener('click', () => select(i))
    grid.append(rowEl)
    return rowEl
  })
  const cellsOf = (i: number): HTMLElement[] =>
    Array.from(rowEls[i].querySelectorAll<HTMLElement>('[role="gridcell"]'))

  function select(index: number): void {
    selected = index
    rowEls.forEach((r, i) => r.classList.toggle('cl-selected', i === index))
    cellsOf(index)[0].focus()
  }

  grid.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent
    const target = e.target as HTMLElement
    if (selected < 0) return
    const cells = cellsOf(selected)
    const last = cells[cells.length - 1]
    if (e.key === 'F2') {
      if (target !== last || selected === options.noEditorAt) return
      edits += 1
      const editor = doc.createElement('textarea')
      editor.className = 'cl-text'
      editor.value = texts[selected]
      if (options.blurCommit) {
        const index = selected
        editor.addEventListener(
          'blur',
          () => {
            texts[index] = editor.value
            editor.remove()
            last.textContent = texts[index]
          },
          { once: true },
        )
      }
      last.textContent = ''
      last.append(editor)
      editor.focus()
      return
    }
    if (e.key === 'Enter' && target.tagName === 'TEXTAREA') {
      if (options.blurCommit) return
      if (!options.discard) texts[selected] = (target as HTMLTextAreaElement).value
      target.remove()
      last.textContent = texts[selected]
      last.focus()
      return
    }
    if (e.key === 'Tab') {
      const at = cells.findIndex((c) => c === target || c.contains(target))
      if (at < 0) return
      if (at < cells.length - 1) return cells[at + 1].focus()
      if (selected === options.stuckAt || selected >= rows.length - 1) return
      select(selected + 1)
    }
  })

  doc.body.append(grid)
  return { grid, select, texts: () => texts.slice(), selected: () => selected, edits: () => edits }
}
