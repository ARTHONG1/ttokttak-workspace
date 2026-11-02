import type { AgentFormShape } from '../../../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from './agent-bridge'
import type { HwpChange } from './hwp-skill'

/**
 * The form of an uploaded document and how the AI keeps it.
 *
 * Every document is analysed once when it opens (the pages, its tables and their empty
 * answer cells, the form fields, the lists and their numbering), and the AI is told that
 * form with every request. With the 서식 고정 switch off (`keep`) the AI is asked to change
 * only the text it was asked about. With it on (`lock`) the formatting is enforced while
 * the content may grow along the form: text, table rows and columns, paragraphs and list
 * items may be added or removed (a typed list is renumbered), but tools that change
 * formatting, styles, merged cells, whole tables or notes are refused, and a change after
 * which formatting shows up that the document did not use, or an object is gone, is taken
 * back.
 */
export type FormMode = 'keep' | 'lock'

export interface FormTable {
  /** as listTables numbers it */
  table: number
  rows: number
  cols: number
  /** cells with no text, no field and no object: where an answer goes */
  emptyCells: number
  /** the line the table follows, which usually says what it is */
  near: string
}

/** A list marker the document uses at the start of its lines, and how many lines have it. */
export interface FormList {
  /** the scheme as it looks: "1.", "가.", "①", "-" … */
  marker: string
  count: number
}

export interface FormProfile {
  pages: number
  tableCount: number
  emptyCells: number
  /** form fields (누름틀) */
  fields: number
  /** the first tables, at most `PROFILE_MAX_TABLES` */
  tables: FormTable[]
  /** the numbering and bullets in use, in the order they first appear */
  lists?: FormList[]
}

/** Tables read cell by cell when a document opens; the rest are only counted. */
const PROFILE_MAX_TABLES = 30
/** Tables named one by one in the context of a request. */
const CONTEXT_MAX_TABLES = 12

/** Tools that change the formatting itself: refused while 서식 고정 is on. */
export const FORM_LOCK_REFUSED: ReadonlySet<string> = new Set([
  'insert_table',
  'format_text',
  'format_paragraph',
  'format_selection',
  'create_style',
  'edit_style',
  'merge_cells',
  'split_cell',
  'format_cells',
  'delete_table',
  'insert_toc',
  'insert_note',
  'delete_note',
])

/** Tools that change content along the form: allowed while locked, each checked. */
export const FORM_LOCK_CHECKED: ReadonlySet<string> = new Set([
  'replace_text',
  'replace_all',
  'replace_selection',
  'fill_cells',
  'check_boxes',
  'fill_field',
  'edit_note',
  'refresh_toc',
  'insert_paragraphs',
  'delete_paragraph',
  'add_to_table',
  'remove_from_table',
])

/** Tools that add or remove list items: the typed numbering around them is put in order. */
export const FORM_LOCK_RENUMBERED: ReadonlySet<string> = new Set([
  'insert_paragraphs',
  'delete_paragraph',
])

/** Numbers typed at the start of a line, with the marker each scheme is shown as. */
const NUMBERED: readonly [RegExp, string][] = [
  [/^\(\d{1,3}\)/, '(1)'],
  [/^\d{1,3}\.(?=\s)/, '1.'],
  [/^\d{1,3}\)(?=\s)/, '1)'],
  [/^\([가-하]\)/, '(가)'],
  [/^[가-하]\.(?=\s)/, '가.'],
  [/^[가-하]\)(?=\s)/, '가)'],
  [/^[\u2460-\u2473]/, '①'],
  [/^[\u2160-\u216b]\./, 'Ⅰ.'],
]
/** Bullets typed at the start of a line. */
const BULLET = /^([-·•□■○●◦ㅇ※*▪◇◆▶►])\s/

/** The list marker at the start of a line, as the scheme looks; null for none. */
export function listMarkerOf(line: string): string | null {
  const text = line.trim()
  for (const [re, marker] of NUMBERED) if (re.test(text)) return marker
  const bullet = BULLET.exec(text)
  return bullet ? bullet[1]! : null
}

/** A line without its leading number or bullet, for telling a renumbered line from a new one. */
function withoutMarker(line: string): string {
  const text = line.trim()
  for (const [re] of NUMBERED) {
    const match = re.exec(text)
    if (match) return text.slice(match[0].length).trim()
  }
  return text
}

type FormBridge = Pick<
  AgentBridge,
  'formShape' | 'listTables' | 'readTable' | 'listFields' | 'readText'
>

/** The analysis made once when a document opens. */
export async function analyzeForm(bridge: FormBridge): Promise<FormProfile> {
  const [shape, list, fields, text] = await Promise.all([
    bridge.formShape(),
    bridge.listTables(),
    bridge.listFields(),
    bridge.readText().catch(() => ''),
  ])
  const tables: FormTable[] = []
  for (const summary of list.tables.slice(0, PROFILE_MAX_TABLES)) {
    const read = await bridge.readTable(summary.table).catch(() => null)
    const emptyCells =
      read && read.ok
        ? read.cells.filter((cell) => cell.text.trim() === '' && !cell.object && !cell.fields)
            .length
        : 0
    tables.push({
      table: summary.table,
      rows: summary.rows,
      cols: summary.cols,
      emptyCells,
      near: summary.near,
    })
  }
  const lists: FormList[] = []
  for (const line of text.split(/\r?\n/)) {
    const marker = listMarkerOf(line)
    if (!marker) continue
    const known = lists.find((entry) => entry.marker === marker)
    if (known) known.count += 1
    else lists.push({ marker, count: 1 })
  }
  return {
    pages: shape.pages,
    tableCount: list.count,
    emptyCells: tables.reduce((sum, table) => sum + table.emptyCells, 0),
    fields: fields.length,
    tables,
    lists,
  }
}

/**
 * What an AI change did to the form, in words the model reads (`would …`); null when the
 * change kept it. Content may grow along the form (rows, columns, paragraphs, pages, taller
 * tables); formatting the document did not use, and objects or tables that came or went,
 * may not.
 */
export function shapeChange(before: AgentFormShape, after: AgentFormShape): string | null {
  if (after.objects !== before.objects) {
    return 'add or remove an object (a picture, a table, a field)'
  }
  if (after.tables.length !== before.tables.length) return 'add or remove a table'
  const newChar = after.formats.char.filter((id) => !before.formats.char.includes(id))
  const newPara = after.formats.para.filter((id) => !before.formats.para.includes(id))
  if (newChar.length > 0 || newPara.length > 0) {
    return 'bring in formatting the document did not have (a new font, size, colour, emphasis or paragraph look)'
  }
  return null
}

/** The pieces of a change that new text may contain: its old and new text, cell by cell. */
function piecesOf(change: HwpChange): string[] {
  return [change.from, change.to]
    .flatMap((text) => text.split(/\s*\|\s*|\n/))
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= 2)
}

/**
 * Lines of the document that a call changed without one of its changes saying so: a new
 * line is accounted for when it holds a piece of a change, or when it is a line that was
 * there with its number rewritten. Empty lines are left out.
 */
export function unexplainedLines(before: string, after: string, changes: HwpChange[]): string[] {
  const lines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  const left = new Map<string, number>()
  for (const line of lines(before)) left.set(line, (left.get(line) ?? 0) + 1)
  const added: string[] = []
  for (const line of lines(after)) {
    const count = left.get(line) ?? 0
    if (count > 0) left.set(line, count - 1)
    else added.push(line)
  }
  const removed = new Set(
    [...left.entries()].filter(([, count]) => count > 0).map(([line]) => withoutMarker(line)),
  )
  const pieces = changes.flatMap(piecesOf)
  return added.filter(
    (line) => !pieces.some((piece) => line.includes(piece)) && !removed.has(withoutMarker(line)),
  )
}

/**
 * The form of the document and the rule the AI keeps it by, for every request. Without an
 * analysis and without the lock there is nothing to add: the system prompt already asks
 * the AI to keep the form.
 */
export function formContext(profile: FormProfile | null, mode: FormMode): string {
  if (!profile && mode === 'keep') return ''
  const lines = ['## The form of this document']
  if (profile) {
    const named = profile.tables.slice(0, CONTEXT_MAX_TABLES).map((table) => {
      const near = table.near ? ` (after "${table.near}")` : ''
      return `- table ${table.table}: ${table.rows} rows × ${table.cols} columns, ${table.emptyCells} empty answer cell(s)${near}`
    })
    const lists = profile.lists ?? []
    lines.push(
      `The document was analysed when it was opened: ${profile.pages} page(s), ${profile.tableCount} table(s), ${profile.emptyCells} empty answer cell(s), ${profile.fields} form field(s).`,
      ...named,
      ...(profile.tableCount > named.length ? ['- (more tables: list_tables lists them)'] : []),
      ...(lists.length > 0
        ? [
            `Lists and numbering in use: ${lists.map((list) => `"${list.marker}" (${list.count})`).join(', ')}. Continue these schemes.`,
          ]
        : []),
    )
  } else {
    lines.push('The form analysis of this document is not available; read it with the tools.')
  }
  if (mode === 'lock') {
    lines.push(
      '서식 고정 (formatting lock) is ON. The content may change and grow along the form; the formatting may not.',
      '- Allowed: rewording and filling text (replace_text, replace_all, replace_selection, fill_cells, check_boxes, fill_field, edit_note, refresh_toc); adding or removing table rows and columns (add_to_table, remove_from_table: new ones are shaped like their neighbours); adding or removing paragraphs and list items (insert_paragraphs, delete_paragraph), anchored to a paragraph of the same kind so they take its look.',
      "- When you add or remove an item of a typed list (1. 2. 3., 가. 나., ①, (1) …), write the new item in the list's scheme; the numbers after it are renumbered automatically.",
      "- Refused: changing fonts, sizes, colours, emphasis, alignment, spacing, styles or cell colours, merging or splitting cells, adding or removing whole tables, a table of contents and notes. fill_cells keeps the cell's own look. A change that brings in formatting the document did not have, or removes an object, is taken back.",
      '- After adding table rows, check the table the tool shows you: the rows must be where the user asked. If they are not, remove them and add them again in the right place.',
      '- Change only what the user asked for. If you notice another problem (a typo, an order that looks wrong), do not fix it: mention it in your reply and let the user decide.',
      '- Never say a change was made when it was refused or taken back.',
    )
  } else {
    lines.push(
      'Keep this form: change only the text the user asks about. Keep the fonts, sizes, colours, tables, cell sizes and page layout as they are, and change formatting or the structure only when the user asks for exactly that.',
    )
  }
  return lines.join('\n')
}
