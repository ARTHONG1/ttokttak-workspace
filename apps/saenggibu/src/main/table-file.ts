/**
 * 명렬표 and 글 파일: an Excel workbook (.xlsx, its first sheet) or a CSV/TSV file read as
 * tab-separated rows of text, which the 생기부 page's rosterNames and entriesFromText take.
 * CSV comes as UTF-8 or, from older Korean Excel, EUC-KR.
 */
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import JSZip from 'jszip'
import type { TableFileResult } from '../shared/api'

export const TABLE_EXTENSIONS = ['xlsx', 'xlsm', 'csv', 'tsv'] as const
export const TABLE_MAX_BYTES = 20 * 1024 * 1024
export const TABLE_MAX_CHARS = 200_000

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10),
        )
      : ENTITIES[e.toLowerCase()]!,
  )
/** all <t> runs of a string item, joined */
const runs = (xml: string): string =>
  unescape([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
/** a cell's text on one line of the table */
const flat = (s: string): string => s.replace(/[\t\r\n]+/g, ' ').trim()

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** the first sheet of a workbook as tab-separated rows */
export async function xlsxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const read = (name: string) => zip.file(name)?.async('string') ?? Promise.resolve('')
  const shared = [...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => runs(m[1]!),
  )
  // the first sheet in the workbook's order
  const workbook = await read('xl/workbook.xml')
  const firstId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1]
  const rels = await read('xl/_rels/workbook.xml.rels')
  const target = firstId
    ? (new RegExp('<Relationship\\b[^>]*Id="' + firstId + '"[^>]*Target="([^"]+)"').exec(
        rels,
      )?.[1] ??
      new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + firstId + '"').exec(rels)?.[1])
    : undefined
  const path = target
    ? target.startsWith('/')
      ? target.slice(1)
      : 'xl/' + target.replace(/^\.\//, '')
    : 'xl/worksheets/sheet1.xml'
  const sheet = await read(path)
  const lines: string[] = []
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? ''
      const inner = c[2] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
      const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let text = ''
      if (type === 's' && value !== undefined) text = shared[Number(value)] ?? ''
      else if (type === 'inlineStr') text = runs(inner)
      else if (value !== undefined) text = unescape(value)
      const at = ref ? columnIndex(ref) : cells.length
      while (cells.length < at) cells.push('')
      cells[at] = flat(text)
    }
    if (cells.some(Boolean)) lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

/** CSV/TSV bytes as text: UTF-8 (with or without a BOM), else EUC-KR */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('euc-kr').decode(bytes)
  }
}

export async function readTableFile(path: string): Promise<TableFileResult> {
  const name = basename(path)
  const ext = extname(path).slice(1).toLowerCase()
  if (ext === 'xls')
    return {
      ok: false,
      error: '예전 엑셀 형식(.xls)은 읽을 수 없어요. 엑셀에서 .xlsx로 저장한 뒤 다시 골라 주세요.',
    }
  if (!(TABLE_EXTENSIONS as readonly string[]).includes(ext))
    return {
      ok: false,
      error: name + '은(는) 읽을 수 없는 형식이에요. 엑셀이나 CSV 파일을 골라 주세요.',
    }
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    return { ok: false, error: name + '을(를) 찾을 수 없어요.' }
  }
  if (size > TABLE_MAX_BYTES)
    return { ok: false, error: '파일이 너무 커요. 20MB 이하 파일을 골라 주세요.' }
  let text: string
  try {
    const bytes = new Uint8Array(await readFile(path))
    text = (ext === 'xlsx' || ext === 'xlsm' ? await xlsxText(bytes) : decodeText(bytes)).trim()
  } catch {
    return { ok: false, error: name + '에서 글을 읽지 못했어요.' }
  }
  if (!text) return { ok: false, error: name + '에 읽을 글이 없어요.' }
  return {
    ok: true,
    kind: 'text',
    name,
    text: text.length > TABLE_MAX_CHARS ? text.slice(0, TABLE_MAX_CHARS) : text,
    truncated: text.length > TABLE_MAX_CHARS,
  }
}
