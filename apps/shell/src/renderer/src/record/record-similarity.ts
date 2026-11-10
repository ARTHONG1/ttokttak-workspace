/**
 * 똑딱업무 > 생기부 > 유사도 검사: which students' texts read alike. Everything is counted
 * on this device, without the AI: two texts are alike by the share of their letters that
 * sit in a run of SHINGLE or more letters found in both (spaces and marks left out), and
 * those runs are what the page marks.
 */
import { parseCsv } from './record-core'

export interface Entry {
  name: string
  text: string
}

/** letters in a row that must match before it counts as the same wording */
export const SHINGLE = 6
export const MAX_ENTRIES = 300
/** shorter texts say too little to compare */
export const MIN_LETTERS = 12

export interface Pair {
  a: number
  b: number
  /** 0..100: the share of both texts' letters that are in shared runs */
  percent: number
}

interface Prepared {
  /** the text's letters and digits, lower case, nothing else */
  letters: string
  /** where each of them is in the text */
  at: number[]
  grams: Set<string>
}

const LETTER = /[\p{L}\p{N}]/u

function prepare(text: string): Prepared {
  let letters = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!LETTER.test(ch)) continue
    letters += ch.toLowerCase()
    at.push(i)
  }
  const grams = new Set<string>()
  for (let i = 0; i + SHINGLE <= letters.length; i++) grams.add(letters.slice(i, i + SHINGLE))
  return { letters, at, grams }
}

/** which letters of one text are inside a run the other text has too */
function covered(self: Prepared, other: Prepared): boolean[] {
  const hit = new Array<boolean>(self.letters.length).fill(false)
  for (let i = 0; i + SHINGLE <= self.letters.length; i++) {
    if (!other.grams.has(self.letters.slice(i, i + SHINGLE))) continue
    for (let j = i; j < i + SHINGLE; j++) hit[j] = true
  }
  return hit
}

const count = (hit: boolean[]): number => hit.reduce((n, h) => n + (h ? 1 : 0), 0)

function percentOf(a: Prepared, b: Prepared): number {
  const total = a.letters.length + b.letters.length
  if (a.letters.length < MIN_LETTERS || b.letters.length < MIN_LETTERS) return 0
  return Math.round(((count(covered(a, b)) + count(covered(b, a))) / total) * 100)
}

/** how alike two texts are, 0..100 */
export const similarity = (a: string, b: string): number => percentOf(prepare(a), prepare(b))

/** every pair of entries at or over the floor, the most alike first */
export function similarPairs(entries: readonly Entry[], floor: number): Pair[] {
  const prepared = entries.map((e) => prepare(e.text))
  const pairs: Pair[] = []
  for (let a = 0; a < prepared.length; a++) {
    for (let b = a + 1; b < prepared.length; b++) {
      const percent = percentOf(prepared[a], prepared[b])
      if (percent >= floor) pairs.push({ a, b, percent })
    }
  }
  return pairs.sort((x, y) => y.percent - x.percent || x.a - y.a || x.b - y.b)
}

export interface Piece {
  text: string
  shared: boolean
}

/** a text cut into pieces, the wording it shares with the other text marked */
export function sharedPieces(text: string, other: string): Piece[] {
  const self = prepare(text)
  const hit = covered(self, prepare(other))
  const mark = new Array<boolean>(text.length).fill(false)
  for (let i = 0; i < hit.length; i++) {
    if (!hit[i]) continue
    mark[self.at[i]] = true
    // the spaces and marks between two shared letters belong to the run
    if (i > 0 && hit[i - 1]) for (let k = self.at[i - 1] + 1; k < self.at[i]; k++) mark[k] = true
  }
  const pieces: Piece[] = []
  for (let i = 0; i < text.length; i++) {
    const last = pieces[pieces.length - 1]
    if (last && last.shared === mark[i]) last.text += text[i]
    else pieces.push({ text: text[i], shared: mark[i] })
  }
  return pieces
}

const NAME_HEADERS = ['이름', '성명', '학생명', '학생이름']
const key = (cell: string): string => cell.replace(/\s+/g, '')

/**
 * The entries of a file read as text: a sheet's rows as "a | b | c" (how the app reads a
 * spreadsheet), or a CSV or TSV. The names are under 이름 or 성명; the text is the column
 * that holds the most writing. Without a name column the rows are numbered.
 */
export function entriesFromText(raw: string): Entry[] {
  const text = raw.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  let rows: string[][]
  if (lines.some((l) => l.startsWith('# ')) || lines[0]?.includes(' | ')) {
    rows = []
    let sheets = 0
    for (const line of lines) {
      if (line.startsWith('# ')) {
        sheets += 1
        if (sheets > 1 && rows.length > 0) break
        continue
      }
      if (line.trim()) rows.push(line.split('|').map((c) => c.trim()))
    }
  } else if (lines[0]?.includes('\t') && !lines[0].includes(',')) {
    rows = lines.filter((l) => l.trim()).map((l) => l.split('\t').map((c) => c.trim()))
  } else {
    rows = parseCsv(text).map((r) => r.map((c) => c.trim()))
  }
  rows = rows
    .map((r) => r.map((c) => (/^\(\d+ empty\)$/.test(c) ? '' : c)))
    .filter((r) => r.some(Boolean))
  if (rows.length === 0) return []
  const headerAt = rows.findIndex((r) => r.some((c) => NAME_HEADERS.includes(key(c))))
  const nameAt = headerAt < 0 ? -1 : rows[headerAt].findIndex((c) => NAME_HEADERS.includes(key(c)))
  const body = rows.slice(headerAt + 1)
  const width = Math.max(...body.map((r) => r.length), 0)
  let textAt = -1
  let most = 0
  for (let col = 0; col < width; col++) {
    if (col === nameAt) continue
    const letters = body.reduce((n, r) => n + (r[col] ?? '').length, 0)
    if (letters > most) {
      most = letters
      textAt = col
    }
  }
  if (textAt < 0) return []
  return body
    .map((r, i) => ({
      name: (nameAt < 0 ? '' : (r[nameAt] ?? '')) || i + 1 + '번',
      text: r[textAt] ?? '',
    }))
    .filter((e) => e.text.trim())
    .slice(0, MAX_ENTRIES)
}

const csvCell = (value: string): string =>
  /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value

/** the pairs as a CSV to keep */
export function pairsToCsv(entries: readonly Entry[], pairs: readonly Pair[]): string {
  const lines = ['학생 1,학생 2,유사도(%),글 1,글 2']
  for (const p of pairs) {
    lines.push(
      [
        entries[p.a].name,
        entries[p.b].name,
        String(p.percent),
        entries[p.a].text,
        entries[p.b].text,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}
