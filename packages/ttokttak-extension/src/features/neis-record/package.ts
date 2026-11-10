/**
 * 생기부 꾸러미: one class's 교과 세특 or 행발 that 똑딱작업실 (web app, desktop app) hands to
 * the 똑딱작업실 extension, which types it into the NEIS grid row by row. The same JSON
 * travels over every route: direct connection, native messaging and the clipboard.
 * parseRecordPackage is the only way in.
 *
 * The students are in the order of the NEIS grid. One without a text stays in the list:
 * its row is passed over, so the rows after it still get their own student's text.
 */

export const RECORD_KIND = 'ttokttak.neis-record'
export const RECORD_VERSION = 1
/** larger input is refused before JSON.parse */
export const RECORD_MAX_TEXT = 100_000
export const RECORD_MAX_STUDENTS = 60
/** NEIS takes 1,500 bytes for one entry */
export const NEIS_BYTE_LIMIT = 1500

export type RecordMode = 'subject' | 'behavior'

export const RECORD_MODE_NAME: Readonly<Record<RecordMode, string>> = {
  subject: '교과 세특',
  behavior: '행발',
}

export interface RecordStudent {
  /** may be empty: the row's name is then not checked */
  name: string
  /** empty: this student's row is passed over */
  text: string
}

export interface RecordPackage {
  kind: typeof RECORD_KIND
  version: typeof RECORD_VERSION
  createdAt: string
  mode: RecordMode
  title: string
  students: RecordStudent[]
}

export type ParsedRecord =
  { ok: true; pkg: RecordPackage; ageHours: number } | { ok: false; reason: string }

/** NEIS counts a Hangul syllable as 3 bytes, a line break as 2 and anything else as 1 */
export function neisBytes(text: string): number {
  let total = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0x0a) total += 2
    else if (code >= 0xac00 && code <= 0xd7a3) total += 3
    else total += 1
  }
  return total
}

/** NEIS keeps one entry on one line */
const oneLine = (text: string): string => text.replace(/\s*\r?\n\s*/g, ' ').trim()

export const writtenCount = (students: readonly RecordStudent[]): number =>
  students.filter((s) => s.text).length

export function buildRecordPackage(input: {
  mode: RecordMode
  title: string
  students: readonly RecordStudent[]
  now?: Date
}): RecordPackage {
  const students = input.students.map((s) => ({ name: s.name.trim(), text: oneLine(s.text) }))
  // rows after the last text have nothing to do
  while (students.length > 0 && !students[students.length - 1].text) students.pop()
  return {
    kind: RECORD_KIND,
    version: RECORD_VERSION,
    createdAt: (input.now ?? new Date()).toISOString(),
    mode: input.mode,
    title: input.title.trim(),
    students,
  }
}

const fail = (reason: string): ParsedRecord => ({ ok: false, reason })
const NOT_OURS = '똑딱작업실 생기부에서 보낸 작업이 아니에요.'

export function parseRecordPackage(text: string, now: Date = new Date()): ParsedRecord {
  if (text.length > RECORD_MAX_TEXT) return fail('작업이 너무 커요.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail(NOT_OURS)
  }
  if (!raw || typeof raw !== 'object') return fail(NOT_OURS)
  const p = raw as Record<string, unknown>
  if (p.kind !== RECORD_KIND) return fail(NOT_OURS)
  if (p.version !== RECORD_VERSION) {
    return fail('이 작업은 더 새로운 똑딱작업실에서 만들었어요. 확장 프로그램을 업데이트해 주세요.')
  }
  if (p.mode !== 'subject' && p.mode !== 'behavior') return fail(NOT_OURS)
  if (!Array.isArray(p.students) || p.students.length === 0) return fail('학생이 한 명도 없어요.')
  if (p.students.length > RECORD_MAX_STUDENTS) {
    return fail('학생은 한 번에 ' + RECORD_MAX_STUDENTS + '명까지 보낼 수 있어요.')
  }
  const students: RecordStudent[] = []
  for (const [i, entry] of p.students.entries()) {
    const s = (entry ?? {}) as Record<string, unknown>
    if (typeof s.name !== 'string' || typeof s.text !== 'string') {
      return fail(i + 1 + '번째 학생의 내용을 읽지 못했어요.')
    }
    students.push({ name: s.name.trim(), text: oneLine(s.text) })
  }
  if (writtenCount(students) === 0) return fail('넣을 글이 있는 학생이 없어요.')
  const createdAt = typeof p.createdAt === 'string' ? p.createdAt : ''
  const made = Date.parse(createdAt)
  if (!Number.isFinite(made)) return fail(NOT_OURS)
  const title = typeof p.title === 'string' ? p.title.trim() : ''
  const pkg: RecordPackage = {
    kind: RECORD_KIND,
    version: RECORD_VERSION,
    createdAt,
    mode: p.mode,
    title: title || RECORD_MODE_NAME[p.mode],
    students,
  }
  return { ok: true, pkg, ageHours: Math.max(0, Math.floor((now.getTime() - made) / 3_600_000)) }
}
