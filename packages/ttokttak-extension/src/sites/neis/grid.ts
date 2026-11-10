/**
 * The NEIS student grid as its page shows it: one row per student, the row the teacher
 * clicked marked as selected, and the cell at the right end holding the text. A cell is
 * edited the way a teacher does it by hand: F2 opens its editor, Enter keeps what was
 * typed, Tab moves on to the next student's row. These names and keys are the ones the
 * author's own 「ACE → 나이스 자동 입력」 extension has used on NEIS. Nothing here saves
 * anything.
 */

export const SELECTED_ROW = '.cl-grid-row.cl-selected'
export const ROW_CELL = 'div[role="gridcell"]'
export const CELL_EDITOR = 'textarea.cl-text'

export type Wait = (ms: number) => Promise<void>

/** the selected student's row (the first part of it when the grid draws a row in parts) */
export const selectedRow = (doc: Document): HTMLElement | null =>
  doc.querySelector<HTMLElement>(SELECTED_ROW)

export const rowCells = (row: Element): HTMLElement[] =>
  Array.from(row.querySelectorAll<HTMLElement>(ROW_CELL))

/** the cell the text goes into: the last one of the row */
export const textCell = (row: Element): HTMLElement | null => rowCells(row).at(-1) ?? null

const squash = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, '')

/**
 * Every cell of the selected student, the text cell left out: a grid with fixed columns
 * draws one student's row in two parts, and the name can be in the other one.
 */
function otherCells(doc: Document): string[] {
  const row = selectedRow(doc)
  const text = row ? textCell(row) : null
  return Array.from(doc.querySelectorAll<HTMLElement>(SELECTED_ROW + ' ' + ROW_CELL))
    .filter((cell) => cell !== text)
    .map((cell) => squash(cell.textContent))
}

/** true when the selected student's row shows this name outside the text cell; no name always fits */
export function selectedRowHasName(doc: Document, name: string): boolean {
  const want = squash(name)
  return !want || otherCells(doc).some((cell) => cell.includes(want))
}

/** what tells the selected student's row from another's */
export function selectionMark(doc: Document): string {
  const row = selectedRow(doc)
  if (!row) return ''
  const text = textCell(row)
  return [
    row.getAttribute('aria-rowindex') ?? '',
    row.getAttribute('data-rowindex') ?? '',
    ...otherCells(doc),
    squash(text?.textContent),
  ].join('|')
}

function key(target: Element, type: 'keydown' | 'keyup', name: string, keyCode: number): void {
  target.dispatchEvent(
    new KeyboardEvent(type, { key: name, code: name, keyCode, bubbles: true } as KeyboardEventInit),
  )
}

function press(target: Element, name: string, keyCode: number): void {
  key(target, 'keydown', name, keyCode)
  key(target, 'keyup', name, keyCode)
}

async function waitEditor(doc: Document, wait: Wait): Promise<HTMLTextAreaElement | null> {
  for (let i = 0; i < 40; i++) {
    const editor =
      doc.querySelector<HTMLTextAreaElement>(CELL_EDITOR) ??
      doc.querySelector<HTMLTextAreaElement>(SELECTED_ROW + ' textarea')
    if (editor) return editor
    await wait(50)
  }
  return null
}

/** F2 on the cell, then the editor NEIS puts there (null when none comes within two seconds) */
export async function openEditor(
  doc: Document,
  cell: HTMLElement,
  wait: Wait,
): Promise<HTMLTextAreaElement | null> {
  cell.focus()
  await wait(80)
  press(cell, 'F2', 113)
  return waitEditor(doc, wait)
}

/** close the open editor with Enter; with a value, that value is what the cell keeps */
export async function closeEditor(
  editor: HTMLTextAreaElement,
  value: string | null,
  wait: Wait,
): Promise<void> {
  if (value !== null) {
    editor.value = value
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await wait(80)
  key(editor, 'keydown', 'Enter', 13)
  await wait(150)
  editor.dispatchEvent(new Event('blur', { bubbles: true }))
}

/**
 * Tab from where the page's focus is after an edit (the cell just edited when the focus
 * is nowhere, or in the 똑딱 panel). Resolves true once another student's row is selected.
 */
export async function nextRow(
  doc: Document,
  cell: HTMLElement,
  wait: Wait,
  /** the 똑딱 panel's own element, never a place to send the key */
  panelHost?: Element | null,
): Promise<boolean> {
  const row = selectedRow(doc)
  const before = selectionMark(doc)
  const active = doc.activeElement
  const usable =
    active && active !== doc.body && active !== doc.documentElement && active !== panelHost
  press(usable ? active : cell, 'Tab', 9)
  await wait(120)
  for (let i = 0; i < 8; i++) {
    await wait(i === 0 ? 350 : 200)
    const now = selectedRow(doc)
    if (now && (now !== row || selectionMark(doc) !== before)) return true
  }
  return false
}

/** true on a NEIS work page (the open-data site of the same name is another service) */
export function isNeisHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'open.neis.go.kr') return false
  return host === 'neis.go.kr' || host.endsWith('.neis.go.kr')
}

/** the browser tests' stand-in page says so itself */
export const FAKE_NEIS_MARK = 'data-ttok-fake-neis'

/**
 * The shape of the grid for a report when filling does not work: counts and class names
 * only, never a name or a text.
 */
export function gridSurvey(doc: Document): Record<string, unknown> {
  const row = selectedRow(doc)
  const cells = row ? rowCells(row) : []
  const last = cells.at(-1)
  const active = doc.activeElement
  return {
    host: doc.location?.hostname ?? '',
    grids: doc.querySelectorAll('.cl-grid').length,
    rows: doc.querySelectorAll('.cl-grid-row').length,
    selectedRows: doc.querySelectorAll(SELECTED_ROW).length,
    selectedRowClass: row?.className ?? null,
    selectedRowCells: cells.length,
    cellClasses: cells.map((c) => c.className),
    cellTextLengths: cells.map((c) => (c.textContent ?? '').length),
    lastCellTabIndex: last ? last.tabIndex : null,
    editors: doc.querySelectorAll(CELL_EDITOR).length,
    textareas: doc.querySelectorAll('textarea').length,
    frames: doc.querySelectorAll('iframe').length,
    active: active ? active.tagName + '.' + String(active.className) : null,
  }
}
