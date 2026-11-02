import type { AgentFormShape } from '../../../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from './agent-bridge'

/**
 * The form of an uploaded document and how the AI keeps it.
 *
 * Every document is analysed once when it opens (the pages, its tables and their empty
 * answer cells, the form fields), and the AI is told that form with every request. With
 * the 양식 유지 switch off (`keep`) the AI is asked to change only the text it was asked
 * about. With it on (`lock`) that is enforced: tools that change formatting, styles,
 * tables, paragraphs or notes are refused, and a text change that makes a table taller,
 * moves it, adds a page, a paragraph or removes an object is taken back.
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

export interface FormProfile {
  pages: number
  tableCount: number
  emptyCells: number
  /** form fields (누름틀) */
  fields: number
  /** the first tables, at most `PROFILE_MAX_TABLES` */
  tables: FormTable[]
}

/** Tables read cell by cell when a document opens; the rest are only counted. */
const PROFILE_MAX_TABLES = 30
/** Tables named one by one in the context of a request. */
const CONTEXT_MAX_TABLES = 12

/** Tools that change formatting, styles, tables, paragraphs or notes: refused while locked. */
export const FORM_LOCK_REFUSED: ReadonlySet<string> = new Set([
  'insert_paragraphs',
  'delete_paragraph',
  'insert_table',
  'format_text',
  'format_paragraph',
  'format_selection',
  'create_style',
  'edit_style',
  'merge_cells',
  'split_cell',
  'format_cells',
  'add_to_table',
  'remove_from_table',
  'delete_table',
  'insert_toc',
  'insert_note',
  'delete_note',
])

/** Tools that only change text: allowed while locked, each checked against the form. */
export const FORM_LOCK_CHECKED: ReadonlySet<string> = new Set([
  'replace_text',
  'replace_all',
  'replace_selection',
  'fill_cells',
  'check_boxes',
  'fill_field',
  'edit_note',
  'refresh_toc',
])

type FormBridge = Pick<AgentBridge, 'formShape' | 'listTables' | 'readTable' | 'listFields'>

/** The analysis made once when a document opens. */
export async function analyzeForm(bridge: FormBridge): Promise<FormProfile> {
  const [shape, list, fields] = await Promise.all([
    bridge.formShape(),
    bridge.listTables(),
    bridge.listFields(),
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
  return {
    pages: shape.pages,
    tableCount: list.count,
    emptyCells: tables.reduce((sum, table) => sum + table.emptyCells, 0),
    fields: fields.length,
    tables,
  }
}

const sameBox = (
  a: AgentFormShape['tables'][number]['box'],
  b: AgentFormShape['tables'][number]['box'],
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.page === b.page &&
    Math.abs(a.x - b.x) <= 0.5 &&
    Math.abs(a.y - b.y) <= 0.5 &&
    Math.abs(a.width - b.width) <= 0.5 &&
    Math.abs(a.height - b.height) <= 0.5)

/**
 * What an AI change did to the form, in words the model reads (`would …`); null when the
 * form is as it was.
 */
export function shapeChange(before: AgentFormShape, after: AgentFormShape): string | null {
  if (after.pages !== before.pages) {
    return `change the number of pages from ${before.pages} to ${after.pages}`
  }
  if (after.objects !== before.objects)
    return 'add or remove an object (a picture, a table, a field)'
  if (after.tables.length !== before.tables.length) return 'add or remove a table'
  if (JSON.stringify(after.paragraphs) !== JSON.stringify(before.paragraphs)) {
    return 'add or remove a paragraph'
  }
  for (let index = 0; index < before.tables.length; index++) {
    const was = before.tables[index]!
    const now = after.tables[index]!
    const name = `table ${index + 1}`
    if (now.rows !== was.rows || now.cols !== was.cols || now.cells !== was.cells) {
      return `change the rows, columns or cells of ${name}`
    }
    if (JSON.stringify(now.paragraphs) !== JSON.stringify(was.paragraphs)) {
      return `add or remove a paragraph inside a cell of ${name}`
    }
    if (!sameBox(was.box, now.box)) {
      return was.box && now.box && now.box.height > was.box.height + 0.5
        ? `make ${name} taller (the text does not fit its cell)`
        : `move or resize ${name}`
    }
  }
  return null
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
    lines.push(
      `The document was analysed when it was opened: ${profile.pages} page(s), ${profile.tableCount} table(s), ${profile.emptyCells} empty answer cell(s), ${profile.fields} form field(s).`,
      ...named,
      ...(profile.tableCount > named.length ? ['- (more tables: list_tables lists them)'] : []),
    )
  } else {
    lines.push('The form analysis of this document is not available; read it with the tools.')
  }
  if (mode === 'lock') {
    lines.push(
      '양식 유지 (form lock) is ON. Only text may change: use replace_text, replace_all, replace_selection (one string for each selected paragraph), fill_cells, check_boxes, fill_field, edit_note and refresh_toc.',
      "- Every tool that changes formatting, styles, tables, paragraphs or notes is refused. fill_cells keeps the cell's own look.",
      '- A text change that would make a table taller, move a table, add a page or a paragraph is taken back automatically. When text does not fit, offer a shorter wording, or tell the user that turning 양식 유지 off allows the change.',
      '- Never say a change was made when it was refused or taken back.',
    )
  } else {
    lines.push(
      'Keep this form: change only the text the user asks about. Keep the fonts, sizes, colours, tables, cell sizes and page layout as they are, and change formatting or the structure only when the user asks for exactly that.',
    )
  }
  return lines.join('\n')
}
