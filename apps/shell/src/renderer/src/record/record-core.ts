/**
 * 똑딱업무 > 생기부: what the page computes without the screen. It follows the author's
 * ACE 세특&행발: 교과 세특 (세부능력 및 특기사항) from the task, the achievement standard
 * and each student's level, and 행발 (행동특성 및 종합의견) from the teacher's observation
 * notes, one AI turn per student. A student's name never goes into a request.
 */

export type RecordMode = 'subject' | 'behavior'

export const MODES: { id: RecordMode; label: string; long: string }[] = [
  { id: 'subject', label: '교과 세특', long: '교과 세부능력 및 특기사항' },
  { id: 'behavior', label: '행발', long: '행동특성 및 종합의견' },
]

export type LengthId = 'very-short' | 'short' | 'medium' | 'long' | 'very-long'

export const LENGTHS: { id: LengthId; label: string }[] = [
  { id: 'very-short', label: '매우 짧게' },
  { id: 'short', label: '짧게' },
  { id: 'medium', label: '보통' },
  { id: 'long', label: '길게' },
  { id: 'very-long', label: '매우 길게' },
]

export const LEVELS = ['최상', '상', '보통', '하', '최하'] as const
export type Level = (typeof LEVELS)[number]

export type SchoolLevel = 'elementary' | 'middle' | 'high'

export const SCHOOL_LEVELS: { id: SchoolLevel; label: string }[] = [
  { id: 'elementary', label: '초등학교' },
  { id: 'middle', label: '중학교' },
  { id: 'high', label: '고등학교' },
]

export const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '미술', '음악', '체육'] as const

/** the subject select's value for a subject the teacher types */
export const CUSTOM_SUBJECT = 'custom'

/** NEIS takes 1,500 bytes for one entry */
export const NEIS_BYTE_LIMIT = 1500

export const MAX_STUDENTS = 50

/** how many students are written at once */
export const GENERATE_AT_ONCE = 3

export interface Student {
  id: string
  name: string
  level: Level
  /** the teacher's observation notes */
  notes: string
  /** the generated text, which the teacher edits */
  result: string
}

export interface CommonInfo {
  schoolLevel: SchoolLevel | ''
  grade: string
  /** one of SUBJECTS, CUSTOM_SUBJECT or '' */
  subject: string
  customSubject: string
  unitName: string
  assignmentDesc: string
  achievementStandard: string
}

export const emptyInfo = (): CommonInfo => ({
  schoolLevel: '',
  grade: '',
  subject: '',
  customSubject: '',
  unitName: '',
  assignmentDesc: '',
  achievementStandard: '',
})

/** one mode's work: its settings and its students */
export interface Work {
  length: LengthId
  instructions: string
  /** 교과 세특 only */
  info: CommonInfo
  students: Student[]
}

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

export const subjectOf = (info: CommonInfo): string =>
  (info.subject === CUSTOM_SUBJECT ? info.customSubject : info.subject).trim()

/** what 교과 세특 still needs before the AI can write, or null */
export function commonProblem(info: CommonInfo): string | null {
  if (!info.schoolLevel) return '학교급을 골라 주세요.'
  if (!subjectOf(info)) return '과목을 골라 주세요.'
  if (!info.assignmentDesc.trim()) return '과제 설명을 입력해 주세요.'
  if (!info.achievementStandard.trim()) return '관련 성취기준을 입력해 주세요.'
  return null
}

const lengthLabel = (id: LengthId): string => LENGTHS.find((l) => l.id === id)?.label ?? '보통'

const gradeText = (grade: string): string => {
  const g = grade.trim()
  return /^\d+$/.test(g) ? g + '학년' : g
}

export const SUBJECT_SYSTEM = [
  '# Role (역할)',
  "당신은 대한민국 학교생활기록부 작성 가이드라인을 완벽히 숙지한 베테랑 교사입니다. 당신의 임무는 학생의 '교과 세부능력 및 특기사항(세특)'을 작성하는 것입니다.",
  '',
  '# [중요] 최우선 작성 지침',
  "1. 마크다운 서식 절대 금지: '#', '##', '**' 등 어떠한 마크다운 기호도 사용하지 마십시오.",
  "2. 제목 및 헤더 금지: '교과 세부능력 및 특기사항', 과목명, 과제명 등 어떠한 제목이나 머리말도 포함하지 마십시오. 나이스에 바로 입력할 수 있는 순수 문장들만 출력하십시오.",
  '3. 분량 가이드:',
  '   - 매우 짧게: 1문장 (핵심 성취 위주)',
  '   - 짧게/보통: 2~3문장 (활동 동기 + 수행 과정 + 성취 결과) - 가장 권장되는 형태',
  '   - 길게/매우 길게: 4~5문장 이상 (심화 확장 및 구체적 사례 포함)',
  "4. 사용자 지시사항 우선: 사용자가 별도의 '사용자(교사)의 최우선 지시사항'을 제공한 경우, 이를 절대적으로 우선하여 반영하십시오.",
  '',
  '# General Guidelines (일반 지침)',
  '1. 문체: 반드시 나이스(NEIS) 입력용 개조식 종결 어미(~함, ~임, ~음, ~됨)를 사용하십시오.',
  '2. 금지 어미: "~입니다", "~보입니다", "~해요"와 같은 서술형 어미는 절대 금지입니다.',
  '3. 주어 생략: "위 학생은", "이 학생은"으로 문장을 시작하지 마십시오. 가급적 주어를 생략하고 바로 활동과 성취를 서술하십시오.',
  '4. 구조: [활동/동기] → [수행 과정] → [성취 결과 및 역량] 순으로 논리적으로 구성하십시오.',
  '5. 객관성: 추상적인 미사여구보다는 학생이 실제로 수행한 행동 위주로 구체적으로 서술하십시오.',
  '6. 학생의 이름이나 번호를 쓰지 마십시오. 줄을 바꾸지 말고 한 문단으로 쓰십시오.',
].join('\n')

export const BEHAVIOR_SYSTEM = [
  '당신은 대한민국 교사의 학교생활기록부 「행동특성 및 종합의견」 작성을 돕는 전문 보조자입니다.',
  '',
  '당신의 목표는 나이스(NEIS)에 바로 입력할 수 있는 수준의 공식적이고 전문적인 문장(개조식)을 생성하는 것입니다.',
  '',
  '[중요] 최우선 작성 지침',
  "사용자가 별도의 '사용자(교사)의 최우선 지시사항'을 제공한 경우, 아래의 일반 대원칙보다 해당 지시사항을 최우선으로 적용하여 문장을 생성하십시오.",
  '',
  '[작성 대원칙 - 일반 지침]',
  '1. 문장 끝은 반드시 "~함", "~임", "~음", "~됨", "~보임", "~기대됨"과 같은 학교생활기록부 전용 종결 어미를 사용하십시오.',
  '2. "~입니다", "~함이 인상적입니다", "~보입니다"와 같은 서술형 종결 어미는 절대 사용하지 마십시오.',
  '3. 문장 시작마다 "위 학생은", "이 학생은"을 반복하지 마십시오. 가급적 주어를 생략하고 구체적인 행동이나 성취를 바로 서술하십시오.',
  "4. 학생의 부족한 점은 긍정적 표현(예: '성장 가능성이 큼', '지속적인 노력이 필요함')으로 완곡하게 표현하십시오.",
  '5. 단순 미사여구가 아닌 구체적인 행동 특성이 드러나야 합니다. 관찰 기록에 없는 사실을 지어내지 마십시오.',
  '6. 학생의 이름이나 번호를 결과에 쓰지 마십시오.',
  "7. '#', '**' 같은 마크다운 기호, 제목, 머리말 없이 문장만 한 문단으로 출력하십시오.",
  '',
  '[필수 평가 요소]',
  '- 학습 태도 및 자기주도성',
  '- 인성 및 생활 태도 (배려, 협력, 책임감 등)',
  '- 교우 관계 및 공동체 의식',
  '- 성장 가능성 및 교사의 종합 제언',
  '',
  '[분량 가이드]',
  '- 매우 짧게: 1~2문장 (100자 내외)',
  '- 짧게: 2~3문장 (200자 내외)',
  '- 보통: 3~4문장 (300~400자 내외)',
  '- 길게: 4~5문장 (450자 내외)',
  '- 매우 길게: 5문장 이상 (500자 이내)',
].join('\n')

const instructionBlock = (instructions: string, fallback: string): string[] => [
  '[사용자(교사)의 최우선 지시사항]',
  instructions.trim() ? '!!! 중요 !!!: ' + instructions.trim() : '- 없음 (' + fallback + ')',
]

/**
 * Students of one class share the task and often the level, and each is written in a turn
 * of its own, so the texts would open and run alike. The student's place in the list
 * asks for a different build each time.
 */
const variationLine = (order: number | undefined): string[] =>
  order === undefined
    ? []
    : [
        '- 글 번호: ' +
          order +
          ' (같은 반 다른 학생의 글과 겹치지 않도록, 이 번호의 글만의 첫머리·문장 구성·어휘로 쓸 것. 번호 자체는 글에 쓰지 않음)',
      ]

/** one student's 교과 세특 request: the common information, the level and the notes */
export function subjectRequest(
  info: CommonInfo,
  length: LengthId,
  instructions: string,
  student: Student,
  order?: number,
): string {
  const school = SCHOOL_LEVELS.find((s) => s.id === info.schoolLevel)?.label ?? ''
  const lines = [
    ...instructionBlock(instructions, '작성 지침에 따름'),
    '',
    '[생성 정보]',
    '- 학교급: ' + school,
  ]
  if (info.grade.trim()) lines.push('- 학년: ' + gradeText(info.grade))
  lines.push('- 과목: ' + subjectOf(info))
  if (info.unitName.trim()) lines.push('- 단원: ' + info.unitName.trim())
  lines.push(
    '- 과제 설명: ' + info.assignmentDesc.trim(),
    '- 성취기준: ' + info.achievementStandard.trim(),
    '- 학생 성취도: ' + student.level,
    '- 요청된 분량 수준: ' + lengthLabel(length),
  )
  if (student.notes.trim()) lines.push('- 개별 관찰 기록: ' + student.notes.trim())
  lines.push(...variationLine(order))
  lines.push(
    '',
    '위의 정보와 [사용자(교사)의 최우선 지시사항]을 반드시 확인하고 이를 반영하여, 나이스 입력용 교과 세특을 작성하십시오.',
    '불필요한 제목, 기호, 번호 없이 오직 나이스에 입력할 문장들만 깨끗하게 출력하십시오.',
  )
  return lines.join('\n')
}

/** one student's 행발 request: the observation notes */
export function behaviorRequest(
  length: LengthId,
  instructions: string,
  student: Student,
  order?: number,
): string {
  return [
    ...instructionBlock(instructions, '대원칙에 따름'),
    '',
    '[생성 정보]',
    '- 요청된 분량 수준: ' + lengthLabel(length),
    '- 학생 관찰 및 특성 기록: ' + student.notes.trim(),
    ...variationLine(order),
    '',
    '위의 [사용자(교사)의 최우선 지시사항]을 절대적으로 우선하여 반영하고, 나이스 입력용 행동특성 및 종합의견을 작성하십시오.',
  ].join('\n')
}

/** the AI's answer as NEIS takes it: no markdown, no heading, one paragraph */
export function cleanReply(reply: string): string {
  const lines = reply
    .replace(/```[a-z]*\n?/gi, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) =>
      line
        .replace(/^([-*•·]|\d+[.)])\s+/, '')
        .replace(/\*\*|__|`/g, '')
        .trim(),
    )
    .filter(Boolean)
  return lines
    .join(' ')
    .replace(/^["'“‘「]+/, '')
    .replace(/["'”’」]+$/, '')
    .trim()
}

/* ------------------------------------------------------------------ files */

/** CSV text into rows of cells: quoted cells keep commas, quotes and line breaks */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** a CSV file's bytes as text: UTF-8, or the EUC-KR that Excel on Windows saves */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('euc-kr').decode(bytes)
  }
  return text.replace(/^\uFEFF/, '')
}

const NAME_HEADERS = ['이름', '성명', '학생명', '학생이름']
const NOTES_HEADERS = ['개별관찰및특성기록', '개별관찰기록', '학생관찰및특성기록', '관찰기록']
const RESULT_HEADERS: Record<RecordMode, string[]> = {
  subject: ['세특', '교과세특'],
  behavior: ['행동특성및종합의견', '행발'],
}
const LEVEL_HEADERS = ['성취수준', '성취도']

const NOTES_TITLE: Record<RecordMode, string> = {
  subject: '개별 관찰 및 특성 기록',
  behavior: '학생 관찰 및 특성 기록',
}
const RESULT_TITLE: Record<RecordMode, string> = {
  subject: '세특',
  behavior: '행동 특성 및 종합의견',
}

const headerKey = (cell: string): string => cell.replace(/\s+/g, '')

const isLevel = (value: string): value is Level => (LEVELS as readonly string[]).includes(value)

export type StudentFields = Omit<Student, 'id'>

/** the students of a CSV this page saved, or of the original site's (found by column name) */
export function studentsFromCsv(text: string, mode: RecordMode): StudentFields[] {
  const rows = parseCsv(text)
  const header = (rows[0] ?? []).map(headerKey)
  const find = (names: string[]) => header.findIndex((h) => names.includes(h))
  const nameAt = find(NAME_HEADERS)
  if (nameAt < 0) throw new Error("첫 줄에 '이름' 칸이 있는 CSV 파일을 골라 주세요.")
  const notesAt = find(NOTES_HEADERS)
  const resultAt = find(RESULT_HEADERS[mode])
  const levelAt = find(LEVEL_HEADERS)
  const at = (row: string[], index: number) => (index < 0 ? '' : (row[index] ?? '').trim())
  return rows
    .slice(1)
    .map((row): StudentFields => {
      const level = at(row, levelAt)
      return {
        name: at(row, nameAt),
        level: isLevel(level) ? level : '상',
        notes: at(row, notesAt),
        result: at(row, resultAt),
      }
    })
    .filter((s) => s.name || s.notes || s.result)
    .slice(0, MAX_STUDENTS)
}

const csvCell = (value: string): string =>
  /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value

export const hasContent = (s: StudentFields): boolean =>
  Boolean(s.name.trim() || s.notes.trim() || s.result.trim())

/** the students with something written, as the CSV studentsFromCsv reads back */
export function studentsToCsv(students: StudentFields[], mode: RecordMode): string {
  const subject = mode === 'subject'
  const lines = [
    ['이름', ...(subject ? ['성취 수준'] : []), NOTES_TITLE[mode], RESULT_TITLE[mode]].join(','),
  ]
  for (const s of students) {
    if (!hasContent(s)) continue
    lines.push([s.name, ...(subject ? [s.level] : []), s.notes, s.result].map(csvCell).join(','))
  }
  return lines.join('\n')
}

/** an empty CSV to fill in a spreadsheet and load back */
export const templateCsv = (mode: RecordMode): string =>
  ['이름', ...(mode === 'subject' ? ['성취 수준'] : []), NOTES_TITLE[mode]].join(',')

/**
 * The names of a class list read as text: a sheet's rows as "a | b | c" (how the app
 * reads a spreadsheet for the AI), or a CSV or TSV. The names are under 성명 or 이름.
 */
export function rosterNames(text: string): string[] {
  const split = (line: string): string[] =>
    (line.includes('|')
      ? line.split('|')
      : line.includes('\t')
        ? line.split('\t')
        : line.split(',')
    ).map((cell) => cell.trim().replace(/^"|"$/g, ''))
  const names: string[] = []
  let column = -1
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (line.startsWith('# ')) {
      if (names.length > 0) break
      column = -1
      continue
    }
    const cells = split(line)
    if (column < 0) {
      column = cells.findIndex((cell) => NAME_HEADERS.includes(headerKey(cell)))
      continue
    }
    const name = cells[column] ?? ''
    if (name && !/^\(\d+ empty\)$/.test(name)) names.push(name)
  }
  return names.slice(0, MAX_STUDENTS)
}

/* ------------------------------------------------------------------ students */

/** as many rows as asked: new rows at the end, and only empty rows taken off the end */
export function resizeStudents(students: Student[], count: number, make: () => Student): Student[] {
  const target = Math.max(1, Math.min(MAX_STUDENTS, Math.floor(count) || 1))
  const out = students.slice()
  while (out.length < target) out.push(make())
  while (out.length > target && !hasContent(out[out.length - 1])) out.pop()
  return out
}

/** run work over the items, a few at a time; once shouldStop says so nothing more starts */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length && !shouldStop()) {
      const item = items[next]
      next += 1
      await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
}

/* ------------------------------------------------------------------ saved work */

/** 임시 저장: one saved work of one mode, kept in this browser only */
export interface SavedSession {
  id: string
  mode: RecordMode
  title: string
  /** ISO time */
  savedAt: string
  work: Work
}

export const SESSIONS_KEY = 'ttokttak_school_record_sessions'
/** the length, the instructions and the common information, remembered between visits */
export const SETTINGS_KEY = 'ttokttak_school_record_settings'
export const MAX_SESSIONS = 30

export function sessionTitle(mode: RecordMode, work: Work): string {
  const count = work.students.filter(hasContent).length
  const head = mode === 'subject' ? (subjectOf(work.info) || '교과') + ' 세특' : '행발'
  return head + ' · ' + count + '명'
}

const isLength = (value: unknown): value is LengthId => LENGTHS.some((l) => l.id === value)

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** stored JSON back as a Work; anything missing or of the wrong kind becomes its default */
export function workFrom(raw: unknown, newId: () => string): Work {
  const r = (raw ?? {}) as Record<string, unknown>
  const info = (r.info ?? {}) as Record<string, unknown>
  const school = text(info.schoolLevel)
  const students = Array.isArray(r.students) ? r.students : []
  return {
    length: isLength(r.length) ? r.length : 'medium',
    instructions: text(r.instructions),
    info: {
      schoolLevel: SCHOOL_LEVELS.some((s) => s.id === school) ? (school as SchoolLevel) : '',
      grade: text(info.grade),
      subject: text(info.subject),
      customSubject: text(info.customSubject),
      unitName: text(info.unitName),
      assignmentDesc: text(info.assignmentDesc),
      achievementStandard: text(info.achievementStandard),
    },
    students: students.slice(0, MAX_STUDENTS).map((item): Student => {
      const s = (item ?? {}) as Record<string, unknown>
      const level = text(s.level)
      return {
        id: text(s.id) || newId(),
        name: text(s.name),
        level: isLevel(level) ? level : '상',
        notes: text(s.notes),
        result: text(s.result),
      }
    }),
  }
}

export function sessionsFrom(raw: string | null, newId: () => string): SavedSession[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data
    .map((item): SavedSession | null => {
      const s = (item ?? {}) as Record<string, unknown>
      if (s.mode !== 'subject' && s.mode !== 'behavior') return null
      return {
        id: text(s.id) || newId(),
        mode: s.mode,
        title: text(s.title),
        savedAt: text(s.savedAt),
        work: workFrom(s.work, newId),
      }
    })
    .filter((s): s is SavedSession => s !== null)
    .slice(0, MAX_SESSIONS)
}
