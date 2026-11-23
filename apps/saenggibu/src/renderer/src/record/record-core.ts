/**
 * 똑딱업무 > 생기부: what the page computes without the screen. It follows the author's
 * ACE 세특&행발: 교과 세특 (세부능력 및 특기사항) from the task, the achievement standard
 * and each student's level, and 행발 (행동특성 및 종합의견) from the teacher's observation
 * notes, and 창체 (창의적 체험활동 특기사항) from the area, the activity and each student's
 * part in it, one AI turn per student. A student's name never goes into a request.
 */

export type RecordMode = 'subject' | 'behavior' | 'activity'

export const MODES: { id: RecordMode; label: string; long: string }[] = [
  { id: 'subject', label: '교과 세특', long: '교과 세부능력 및 특기사항' },
  { id: 'behavior', label: '행발', long: '행동특성 및 종합의견' },
  { id: 'activity', label: '창체', long: '창의적 체험활동 특기사항' },
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

/**
 * 창체's areas (2026 학교생활기록부 기재요령, 2022 개정 교육과정): 자율·자치활동, 동아리활동
 * and 진로활동 each have an entry in 중·고; in 초등 자율·자치활동 and 동아리활동 share one.
 * 봉사활동 is no longer an area of its own.
 */
export type ActivityArea = 'autonomy' | 'club' | 'career' | 'autonomy-club'

const AREA_LABEL: Record<ActivityArea, string> = {
  autonomy: '자율·자치활동',
  club: '동아리활동',
  career: '진로활동',
  'autonomy-club': '자율·자치활동 및 동아리활동',
}

export function activityAreas(school: SchoolLevel | ''): { id: ActivityArea; label: string }[] {
  const ids: ActivityArea[] =
    school === 'elementary'
      ? ['autonomy-club', 'career']
      : school
        ? ['autonomy', 'club', 'career']
        : []
  return ids.map((id) => ({ id, label: AREA_LABEL[id] }))
}

const isArea = (value: string): value is ActivityArea => value in AREA_LABEL

/** the subject select's value for a subject the teacher types */
export const CUSTOM_SUBJECT = 'custom'

/** NEIS takes 1,500 bytes for one entry */
export const NEIS_BYTE_LIMIT = 1500

export const MAX_STUDENTS = 50

/**
 * students asked at once on the built-in 똑딱AI. On an Apple Silicon Mac its server writes four
 * side by side (apps/saenggibu/src/main/local-ai.ts SERVER_SHAPE); on another computer it takes
 * them one after another in the order they came, so asking four at once costs nothing there.
 */
export const GENERATE_AT_ONCE = 4

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
  /** 창체 only: the area, the activity's name and what the students did */
  area: ActivityArea | ''
  activityName: string
  activityContent: string
}

export const emptyInfo = (): CommonInfo => ({
  schoolLevel: '',
  grade: '',
  subject: '',
  customSubject: '',
  unitName: '',
  assignmentDesc: '',
  achievementStandard: '',
  area: '',
  activityName: '',
  activityContent: '',
})

/** one mode's work: its settings and its students */
export interface Work {
  length: LengthId
  instructions: string
  /** 교과 세특 and 창체 */
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

const gradeNumber = (grade: string): number | null => {
  const m = /^\s*(\d+)/.exec(grade)
  return m ? Number(m[1]) : null
}

/**
 * The area's name as NEIS shows it this year: in 2026 the 3학년 of 중·고 are still on the
 * 2015 curriculum, whose 자율·자치활동 is 자율활동.
 */
export function areaLabel(info: CommonInfo): string {
  if (!info.area) return ''
  if (
    info.area === 'autonomy' &&
    info.schoolLevel !== 'elementary' &&
    gradeNumber(info.grade) === 3
  )
    return '자율활동'
  return AREA_LABEL[info.area]
}

/** what 창체 still needs before the AI can write, or null */
export function activityProblem(info: CommonInfo): string | null {
  if (!info.schoolLevel) return '학교급을 골라 주세요.'
  if (!activityAreas(info.schoolLevel).some((a) => a.id === info.area)) return '영역을 골라 주세요.'
  if (!info.activityContent.trim()) return '활동 내용을 입력해 주세요.'
  return null
}

/**
 * The bytes NEIS takes for one entry: 1,500 (500자) for 세특, 행발 and each 중·고 창체 area;
 * 초등 창체 has no cap (null).
 */
export function byteLimit(mode: RecordMode, info: CommonInfo): number | null {
  return mode === 'activity' && info.schoolLevel === 'elementary' ? null : NEIS_BYTE_LIMIT
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

/**
 * 창체 특기사항. 똑딱AI's 생기부 training (V7 B, now its 생기부 adapter) saw these exact instructions in a few of its
 * training rows and dev prompts (apps/saenggibu/tests/prompt-contract.test.ts pins them with the
 * others), but on fewer cases than 세특 and 행발: its answers here are a draft to read.
 */
export const ACTIVITY_SYSTEM = [
  '당신은 대한민국 학교생활기록부 기재요령을 잘 아는 교사입니다. 학생의 「창의적 체험활동 상황」 특기사항을 작성합니다.',
  '',
  '[중요] 최우선 작성 지침',
  "사용자가 별도의 '사용자(교사)의 최우선 지시사항'을 제공한 경우, 아래의 일반 원칙보다 해당 지시사항을 우선하여 반영하십시오.",
  '',
  '[작성 원칙]',
  '1. 주어진 영역(자율·자치활동, 동아리활동, 진로활동 등)의 특기사항만 씁니다. 다른 영역의 활동을 섞지 마십시오.',
  '2. 공통 활동 내용 가운데 이 학생이 실제로 한 역할과 관찰된 행동을 중심으로, 참여 과정과 그 활동에서 드러난 태도·역량을 구체적으로 서술하십시오.',
  '3. 관찰 기록과 활동 내용에 없는 사실(새 활동, 직책, 수상, 결과, 수치)을 지어내지 마십시오.',
  '4. 교외 수상, 자격증, 특정 대학·기관·상호명, 부모의 직업이나 사회·경제적 지위처럼 학교생활기록부에 적을 수 없는 내용은 쓰지 마십시오.',
  '5. 문장 끝은 "~함", "~임", "~음", "~됨", "~보임"과 같은 학교생활기록부 전용 종결 어미를 사용하고, "~입니다", "~해요"는 쓰지 마십시오.',
  '6. "위 학생은", "이 학생은"으로 시작하지 말고, 학생의 이름이나 번호를 쓰지 마십시오.',
  "7. '#', '**' 같은 마크다운 기호, 제목, 영역 이름 머리말 없이 줄을 바꾸지 않은 한 문단으로만 출력하십시오.",
  '',
  '[분량 가이드]',
  '- 매우 짧게: 1문장',
  '- 짧게: 2문장',
  '- 보통: 3문장',
  '- 길게: 4문장',
  '- 매우 길게: 5문장 (500자 이내)',
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

/** one student's 창체 request: the area, the activity and the student's part in it */
export function activityRequest(
  info: CommonInfo,
  length: LengthId,
  instructions: string,
  student: Student,
  order?: number,
): string {
  const school = SCHOOL_LEVELS.find((s) => s.id === info.schoolLevel)?.label ?? ''
  const lines = [
    ...instructionBlock(instructions, '작성 원칙에 따름'),
    '',
    '[생성 정보]',
    '- 학교급: ' + school,
  ]
  if (info.grade.trim()) lines.push('- 학년: ' + gradeText(info.grade))
  lines.push('- 영역: ' + areaLabel(info))
  if (info.activityName.trim()) lines.push('- 활동명: ' + info.activityName.trim())
  lines.push(
    '- 활동 내용: ' + info.activityContent.trim(),
    '- 요청된 분량 수준: ' + lengthLabel(length),
  )
  if (student.notes.trim()) lines.push('- 학생 역할 및 관찰 기록: ' + student.notes.trim())
  lines.push(...variationLine(order))
  lines.push(
    '',
    '위의 정보와 [사용자(교사)의 최우선 지시사항]을 반드시 확인하고, 나이스에 입력할 이 영역의 특기사항을 작성하십시오.',
    '불필요한 제목, 기호, 번호 없이 오직 나이스에 입력할 문장들만 깨끗하게 출력하십시오.',
  )
  return lines.join('\n')
}

/* ------------------------------------------------------------------ 똑딱AI's own request */

/**
 * The request the built-in 똑딱AI (Qwen3.5-2B with its V7-B 생기부 adapter) is asked in: short
 * rules, model answers sent as earlier turns of the conversation, and the student's facts with
 * the teacher's notes sorted into what the student does well and what to work on. Measured on
 * 2026-11-24 against the long instructions above on the same notes: no "~습니다", fewer invented
 * facts and lengths closer to the request, and strengths and concerns kept apart. Connected AIs
 * (Codex, Claude, the web's Gemini) get the long instructions; the main process sends this form
 * to 똑딱AI only.
 */
export const COMPACT_SYSTEM = [
  '너는 대한민국 학교생활기록부를 쓰는 담임교사다. 교사가 준 정보로 나이스에 그대로 넣을 문단 하나를 쓴다.',
  '- 모든 문장은 "~함", "~임", "~음", "~됨", "~보임", "~기대됨"처럼 끝낸다. "~습니다", "~했다", "~이다"로 끝내지 않는다.',
  '- 관찰에 적힌 사실만 근거로 쓴다. 관찰에 없는 활동, 수상, 성적, 직책, 숫자, 사건, 어려움, 단점을 지어내지 않는다.',
  '- 관찰 항목마다 그 행동을 구체적으로 풀어 쓰고, 그 행동에서 드러나는 태도나 역량을 덧붙인다. 관찰이 짧으면 행동의 의미를 넓혀 분량을 채운다.',
  '- 장점은 장점으로, 부족한 점은 부족한 점으로 쓴다. 부족한 점은 노력하는 모습이나 성장 방향으로 부드럽게 표현한다.',
  '- 관찰이 "잘하는 점"과 "보완할 점"으로 나뉘어 있으면, 잘하는 점은 칭찬으로, 보완할 점은 노력이 필요한 점으로만 쓴다. 둘을 서로 바꾸지 않는다.',
  '- "교사 요청"이 있으면 가장 먼저 따른다.',
  '- "학생은", "이 학생은", "교사는"으로 시작하지 않고, 이름, 제목, 기호, 줄바꿈 없이 한 문단으로 쓴다.',
  '- 요청한 문장 수와 글자 수를 지킨다.',
].join('\n')

/** a request in both forms: the long instructions and the request, and 똑딱AI's own request */
export interface RecordTurn {
  system: string
  text: string
  /** model answers sent before the request as earlier turns of the conversation: [request, answer] */
  examples?: readonly (readonly [string, string])[]
  /** the GBNF grammar the built-in model's answer is held to (entryGrammar) */
  grammar?: string
  observation?: { category: '행발' | '평어' | '창체'; note: string }
}

/** the length asked for, per kind of entry (평어: an elementary school's 교과 세특) */
const LENGTH_TARGETS: Record<
  'behavior' | 'subject' | 'elementary' | 'activity',
  Record<LengthId, string>
> = {
  behavior: {
    'very-short': '1~2문장, 100자 안팎',
    short: '2~3문장, 200자 안팎',
    medium: '3~4문장, 300자 안팎',
    long: '4~5문장, 450자 안팎',
    'very-long': '5문장 이상, 500자 이내',
  },
  subject: {
    'very-short': '1문장, 100자 안팎',
    short: '2문장, 180자 안팎',
    medium: '3문장, 250자 안팎',
    long: '4~5문장, 400자 안팎',
    'very-long': '5~6문장, 500자 이내',
  },
  elementary: {
    'very-short': '1문장, 70자 안팎',
    short: '2문장, 120자 안팎',
    medium: '2~3문장, 150자 안팎',
    long: '3~4문장, 250자 안팎',
    'very-long': '4~5문장, 350자 안팎',
  },
  activity: {
    'very-short': '1문장, 80자 안팎',
    short: '2문장, 150자 안팎',
    medium: '3문장, 250자 안팎',
    long: '4문장, 350자 안팎',
    'very-long': '5문장, 450자 이내',
  },
}

/** a one-line field: its line breaks become spaces */
const oneLine = (value: string): string => value.trim().replace(/\s*\n\s*/g, ' ')

/** words in a note that mark something the student still has to work on */
const CONCERN =
  /어려워|어려움|부족|미흡|서툴|서툶|못함|못하|산만|떠듦|떠듬|떠든|떠들|다툼|다투|잦음|잦은|잦고|소극적|지각|대충|소홀|안 해|안 함|안 하|않음|않고|하지 않|미루|미룸|잊어|잊음|빠뜨|빼먹|장난|딴짓|늦게|편식|고집|짜증|거짓말|놀리|놀림|방해/u
/** a bad habit said not to happen ("포기하지 않음", "숙제를 빠뜨리지 않음"): praise */
const PRAISED_NEGATION =
  /(?:포기하|빠뜨리|빼먹|늦|잊|미루|다투|싸우|떠들|장난치|놀리|방해하|지각하|결석하|거짓말하|화내|울|편식하|고집하|짜증내|딴짓하)지\s*않/u
/** a change for the better ("다툼이 줄어듦"): it stays with what the student does well */
const GROWTH =
  /줄어|줄었|감소|개선|나아지|나아짐|좋아지|좋아짐|고쳐|극복|향상|거의 없|없어지|없어짐/u
/** a weaker sign, read only against the other half of "A지만 B" ("글씨가 바르지 않음") */
const NEGATED = /않|없/u

/** a verb or adjective stem as a record ending: 찾 → 찾음, 정확하 → 정확함, 만들 → 만듦, 돕 → 도움 */
function nominal(stem: string): string {
  if (stem.endsWith('돕')) return stem.slice(0, -1) + '도움'
  const last = stem.charCodeAt(stem.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return stem
  const final = (last - 0xac00) % 28
  // no final consonant: ㅁ becomes it (하 → 함); ㄹ takes ㅁ with it (만들 → 만듦); else 음 (찾 → 찾음)
  if (final === 0) return stem.slice(0, -1) + String.fromCharCode(last + 16)
  if (final === 8) return stem.slice(0, -1) + String.fromCharCode(last + 2)
  return stem + '음'
}

/** which half of "A지만 B" is the one to work on, when only one of them reads so */
function concernHalf(first: string, second: string): 0 | 1 | null {
  for (const sign of [CONCERN, NEGATED]) {
    const inFirst = sign.test(first)
    const inSecond = sign.test(second)
    if (inFirst !== inSecond) return inFirst ? 0 : 1
    if (inFirst) return null
  }
  return null
}

/**
 * The teacher's notes, one observation a line, sorted into what the student does well and what
 * to work on. "인물의 마음을 잘 찾지만 근거를 말하기 어려워함" becomes one of each: in one line
 * the 2B model reversed them two times out of three. A note is put with the things to work on
 * only on a plain sign of it; any other note, and a change for the better, stays with the rest.
 */
export function sortedNotes(notes: string): { good: string[]; concern: string[] } {
  const good: string[] = []
  const concern: string[] = []
  const observations = notes
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((part) =>
      part
        .trim()
        .replace(/^[-•·*]\s*/, '')
        .replace(/[.!?]+$/, '')
        .trim(),
    )
    .filter(Boolean)
  for (const observation of observations) {
    const contrast = observation.match(/^(.+?)(?:지만|으나|는데)\s+(.+)$/u)
    const half =
      contrast && contrast[1].length >= 3 && contrast[2].length >= 3 && !GROWTH.test(observation)
        ? concernHalf(contrast[1], contrast[2])
        : null
    if (contrast && half !== null) {
      const first = nominal(contrast[1])
      good.push(half === 0 ? contrast[2] : first)
      concern.push(half === 0 ? first : contrast[2])
    } else if (
      CONCERN.test(observation) &&
      !GROWTH.test(observation) &&
      !PRAISED_NEGATION.test(observation)
    )
      concern.push(observation)
    else good.push(observation)
  }
  return { good, concern }
}

function notesBlock(heading: string, notes: string, none: string): string[] {
  const { good, concern } = sortedNotes(notes)
  if (!good.length && !concern.length) return [heading + ':', '- ' + none]
  return [
    heading + ':',
    ...(good.length ? ['잘하는 점:', ...good.map((g) => '- ' + g)] : []),
    ...(concern.length ? ['보완할 점:', ...concern.map((c) => '- ' + c)] : []),
  ]
}

/** one student's 세특, 평어, 행발 or 창체 as 똑딱AI's own request */
export function compactRequest(
  mode: RecordMode,
  info: CommonInfo,
  length: LengthId,
  instructions: string,
  student: Student,
): string {
  const school = SCHOOL_LEVELS.find((s) => s.id === info.schoolLevel)?.label ?? ''
  const grade = info.grade.trim() ? gradeText(info.grade) : ''
  const who = [school, grade].filter(Boolean).join(' ')
  const lines: string[] = []
  if (mode === 'subject') {
    const elementary = info.schoolLevel === 'elementary'
    lines.push(
      (elementary ? '[교과 평어] ' : '[교과 세부능력 및 특기사항] ') +
        [who, subjectOf(info)].filter(Boolean).join(' ') +
        ' · 분량: ' +
        LENGTH_TARGETS[elementary ? 'elementary' : 'subject'][length],
    )
    if (info.unitName.trim()) lines.push('단원: ' + oneLine(info.unitName))
    lines.push('과제: ' + oneLine(info.assignmentDesc))
    if (info.achievementStandard.trim())
      lines.push('성취기준: ' + oneLine(info.achievementStandard))
    lines.push('성취도: ' + student.level)
    lines.push(...notesBlock('관찰', student.notes, '관찰 기록 없음'))
  } else if (mode === 'behavior') {
    lines.push(
      '[행동특성 및 종합의견] ' +
        (who ? who + ' · ' : '') +
        '분량: ' +
        LENGTH_TARGETS.behavior[length],
    )
    lines.push(...notesBlock('관찰', student.notes, '관찰 기록 없음'))
  } else {
    lines.push(
      '[창의적 체험활동 특기사항] ' +
        [who, areaLabel(info)].filter(Boolean).join(' · ') +
        ' · 분량: ' +
        LENGTH_TARGETS.activity[length],
    )
    const activity = oneLine(info.activityName) || '활동'
    lines.push(
      '활동: ' +
        activity +
        (info.activityContent.trim() ? ' (' + oneLine(info.activityContent) + ')' : ''),
    )
    lines.push(...notesBlock('학생 역할과 관찰', student.notes, '관찰 기록 없음'))
  }
  if (instructions.trim()) lines.push('교사 요청: ' + oneLine(instructions))
  return lines.join('\n')
}

/** the model answers sent before a request of this kind (fictional students, written for 똑딱AI) */
export function compactExamples(mode: RecordMode): readonly (readonly [string, string])[] {
  return COMPACT_EXAMPLES[mode]
}

const COMPACT_EXAMPLES: Record<RecordMode, readonly (readonly [string, string])[]> = {
  behavior: [
    [
      '[행동특성 및 종합의견] 초등학교 6학년 · 분량: 3~4문장, 300자 안팎\n관찰:\n잘하는 점:\n- 모둠 활동에서 역할을 나눌 때 남는 일을 먼저 맡음\n- 쉬는 시간에 혼자 있는 친구에게 먼저 말을 걺\n보완할 점:\n- 수학 문제를 풀 때 계산 실수가 잦아 검산 습관을 들이는 중임',
      '모둠 활동에서 역할을 나눌 때 친구들이 맡지 않은 일을 먼저 맡아 끝까지 해내며 공동체를 위해 자신의 몫을 기꺼이 감당하는 책임감을 보임. 쉬는 시간에 혼자 있는 친구에게 먼저 다가가 말을 건네는 모습에서 주변을 세심하게 살피는 따뜻한 배려심이 드러남. 수학 문제 풀이에서 계산 실수가 잦은 편이나 스스로 검산하는 습관을 들이려고 꾸준히 노력하고 있어 학습의 정확성이 점차 높아지고 있음. 맡은 일을 성실히 해내는 태도와 친구를 아끼는 마음을 바탕으로 학급에서 신뢰받는 구성원으로 성장할 것으로 기대됨.',
    ],
    [
      '[행동특성 및 종합의견] 중학교 1학년 · 분량: 3~4문장, 300자 안팎\n관찰:\n잘하는 점:\n- 발표를 잘함',
      '수업 시간에 자신의 생각을 적극적으로 발표하며 배운 내용을 자기 말로 정리하여 표현하는 능력이 돋보임. 자신의 의견을 분명하게 밝히는 자신감은 학급 토의와 모둠 활동의 분위기를 활발하게 만드는 데 도움이 됨. 발표에 적극적인 만큼 친구의 발표에도 귀 기울이며 서로의 생각을 비교해 보는 경험을 쌓는다면 생각의 폭을 넓히고 깊이를 더해 갈 것으로 기대됨.',
    ],
  ],
  subject: [
    [
      '[교과 세부능력 및 특기사항] 중학교 1학년 사회 · 분량: 3문장, 250자 안팎\n과제: 우리 지역 지형도 읽고 지도 만들기\n성취기준: [9사01-02] 지도에 나타난 지형 정보를 읽고 해석한다.\n성취도: 상\n관찰:\n잘하는 점:\n- 등고선을 해석해 산과 하천 위치를 지도에 표시함',
      '‘우리 지역 지형도 읽고 지도 만들기’ 활동에서 등고선을 해석하여 산지와 하천의 위치를 지도에 정확하게 표시함. 등고선의 간격과 높이 정보를 바탕으로 지형의 특징을 구분하는 등 지도에 담긴 정보를 읽어 내는 능력이 우수함. 지도 속 지형 정보를 실제 지역의 모습과 연결하여 이해하며 지리적 사고력을 갖추고 있음.',
    ],
    [
      '[교과 평어] 초등학교 3학년 수학 · 분량: 2~3문장, 150자 안팎\n과제: 여러 물건의 들이와 무게 비교하기\n성취기준: [4수03-14] 들이와 무게를 어림하고 측정할 수 있다.\n성취도: 보통\n관찰:\n잘하는 점:\n- 단위는 앎\n보완할 점:\n- 어림하기를 어려워함',
      '‘여러 물건의 들이와 무게 비교하기’ 활동에서 들이와 무게의 단위를 알고 단위를 사용하여 물건의 양을 나타냄. 물건의 들이와 무게를 어림하는 데에는 어려움이 있어 생활 속 물건을 직접 재어 보며 양감을 기르는 경험이 필요함.',
    ],
  ],
  activity: [
    [
      '[창의적 체험활동 특기사항] 중학교 2학년 · 자율·자치활동 · 분량: 3문장, 250자 안팎\n활동: 학급 환경 개선 캠페인 (캠페인을 기획하고 홍보물을 만들어 실천함)\n학생 역할과 관찰:\n잘하는 점:\n- 포스터 제작을 맡음\n- 친구들 의견을 모아 문구를 고침',
      '학급 환경 개선 캠페인에서 홍보 포스터 제작을 맡아 친구들의 의견을 모아 문구를 여러 차례 다듬으며 전달력을 높임. 캠페인의 취지를 쉽게 전하기 위해 표현을 고민하는 과정에서 학급의 문제에 관심을 갖고 해결에 참여하려는 태도를 보임. 맡은 역할을 끝까지 책임감 있게 수행하여 학급 구성원들이 캠페인에 함께하는 데 기여함.',
    ],
  ],
}

/* ------------------------------------------------------------------ checking 똑딱AI's entry */

/** the 2,350 Hangul syllables of KS X 1001; one outside them ("다툜") is a slip of the 2B model */
const COMMON_SYLLABLES: ReadonlySet<string> = (() => {
  const bytes: number[] = []
  for (let lead = 0xb0; lead <= 0xc8; lead++)
    for (let trail = 0xa1; trail <= 0xfe; trail++) bytes.push(lead, trail)
  return new Set(new TextDecoder('euc-kr').decode(Uint8Array.from(bytes)))
})()

/**
 * a sentence that keeps a concern as one: what is lacking, the effort or the help it needs, or
 * the concern set against what came after ("다툼이 잦았으나 …")
 */
const CONCERN_KEPT =
  /필요|보완|어려|부족|다소|으나|지만|편임|아쉬|않|못|서툴|미흡|한다면|는다면|개선|점차|조금씩/u

/** the first two letters of each word without its particle: what two texts share about a fact */
function wordStems(text: string): Set<string> {
  const stems = new Set<string>()
  for (const word of text.match(/[가-힣]+/gu) ?? []) {
    const stem = word.replace(
      /(?:으로|에서|에게|하며|하고|하여|하는|을|를|이|가|은|는|의|에|와|과|도|로)$/u,
      '',
    )
    if (stem.length >= 2) stems.add(stem.slice(0, 2))
  }
  return stems
}

/** the "보완할 점" lines of a request made by compactRequest */
function concernsOf(request: string): string[] {
  const lines = request.split('\n')
  const start = lines.indexOf('보완할 점:')
  if (start < 0) return []
  const concerns: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('- ')) break
    concerns.push(line.slice(2))
  }
  return concerns
}

/**
 * What makes an entry the built-in 2B model wrote unusable as it is, measured against the
 * request it answered (compactRequest): a concern written as praise or left out, Chinese or
 * Japanese letters, an English word or a rare syllable the notes do not have, a sentence that
 * does not end the record's way ("~함", "~음", "~임"), the same words over and over, or words of
 * the request itself ("관찰 기록", "초등학교 5학년"). Empty when none.
 */
export function entryProblems(entry: string, request: string): string[] {
  const problems: string[] = []
  if (/[\u3040-\u30ff\u4e00-\u9fff]/u.test(entry)) problems.push('한자·일본 글자')
  const english = (entry.match(/[A-Za-z]{2,}/g) ?? []).filter((word) => !request.includes(word))
  if (english.length) problems.push('영어 낱말')
  const rare = [...entry].filter(
    (ch) => /[가-힣]/u.test(ch) && !COMMON_SYLLABLES.has(ch) && !request.includes(ch),
  )
  if (rare.length) problems.push('깨진 글자')
  const sentences = entry
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim().replace(/\.$/, ''))
    .filter(Boolean)
  const endsRight = (sentence: string): boolean => isRecordEnding(sentence.slice(-1))
  if (!sentences.every(endsRight)) problems.push('문장 끝')
  // a word or two said again at once ("꼼꼼하게 꼼꼼하게"), or five words in a row said twice: a
  // sentence written again, or the 2B model caught in a loop
  const words = entry.split(/\s+/)
  const runs = new Set<string>()
  const saidAgain = (at: number, size: number): boolean =>
    at >= size && words.slice(at - size, at).join(' ') === words.slice(at, at + size).join(' ')
  for (let at = 0; at < words.length; at++) {
    const run = words.slice(at, at + 5).join(' ')
    if (saidAgain(at, 1) || saidAgain(at, 2) || runs.has(run)) {
      problems.push('같은 말 반복')
      break
    }
    if (at + 5 <= words.length) runs.add(run)
  }
  // the request's own words, unless the teacher's notes have them too ("관찰 기록지를 대충 씀")
  const notes = request
    .split('\n')
    .filter((line) => line.startsWith('- ') && line !== '- 관찰 기록 없음')
    .join('\n')
  const requestWords =
    entry.match(
      /관찰 기록|작성된 기록|성취도만으로|교사 요청|(?:초등학교|중학교|고등학교) ?\d+학년/gu,
    ) ?? []
  if (requestWords.some((words) => !notes.includes(words))) problems.push('요청 문구')
  for (const concern of concernsOf(request)) {
    const stems = wordStems(concern)
    // the note's own word for it ("다툼", "어려워") said again keeps it a concern as well
    const own = concern.match(CONCERN)?.[0]
    let best = ''
    let shared = 0
    for (const sentence of sentences) {
      const count = [...wordStems(sentence)].filter((stem) => stems.has(stem)).length
      if (count > shared) {
        best = sentence
        shared = count
      }
    }
    if (!best) problems.push('보완할 점 빠짐')
    else if (
      PRAISED_NEGATION.test(best) ||
      !(CONCERN_KEPT.test(best) || CONCERN.test(best) || (own && best.includes(own)))
    )
      problems.push('보완할 점을 칭찬으로 씀')
  }
  return problems
}

/** a syllable an entry's sentence ends on: ㅁ under it (함, 음, 임, 됨, 보임) or ㄻ (줄어듦, 만듦) */
function isRecordEnding(syllable: string): boolean {
  const code = syllable.charCodeAt(0)
  const final = (code - 0xac00) % 28
  return code >= 0xac00 && code <= 0xd7a3 && (final === 16 || final === 10)
}

/**
 * The GBNF grammar 똑딱AI's answer is held to (llama-server's "grammar"): the number of
 * sentences the request asks for, each ending "~함/~음/~임" and a full stop, written in the
 * 2,350 common syllables, digits, the marks an entry uses and any letter of the request itself.
 * Chinese letters, a broken syllable, "~습니다" or an answer that runs on cannot come out.
 */
export function entryGrammar(request: string): string {
  const count = request.match(/분량: (\d+)(?:~(\d+))?문장( 이상)?/u)
  const fewest = count ? Number(count[1]) : 3
  const most = count?.[2] ? Number(count[2]) : count?.[3] ? fewest + 1 : count ? fewest : 4
  const syllables = [...COMMON_SYLLABLES]
  const letters = new Set([
    ...syllables,
    ...(request.match(/[가-힣A-Za-z]/gu) ?? []),
    ...'0123456789 ,·‘’()~%',
  ])
  const charClass = (chars: Iterable<string>): string =>
    '[' + [...chars].join('').replace(/[\]\\^-]/g, (mark) => '\\' + mark) + ']'
  return [
    'root ::= sentence' +
      (most > 1 ? ' (" " sentence){' + (fewest - 1) + ',' + (most - 1) + '}' : ''),
    'sentence ::= letter{8,150} ending "."',
    'letter ::= ' + charClass(letters),
    'ending ::= ' + charClass(syllables.filter(isRecordEnding)),
  ].join('\n')
}

/**
 * The best of several answers to one request: the fewest entryProblems, then the fewest words
 * that neither the request nor another answer has. A fact the 2B model made up ("책상 앞에 앉는
 * 순간 책장을 넘기는") comes in one answer only; what the notes said comes in each of them.
 */
export function pickEntry(
  entries: readonly string[],
  request: string,
): { entry: string; problems: number } {
  const asked = wordStems(request)
  const scored = entries.map((entry, at) => {
    const others = entries.filter((_, other) => other !== at).map(wordStems)
    const ownWords = [...wordStems(entry)].filter(
      (stem) => !asked.has(stem) && others.every((words) => !words.has(stem)),
    )
    return { entry, problems: entryProblems(entry, request).length, ownWords: ownWords.length }
  })
  scored.sort((a, b) => a.problems - b.problems || a.ownWords - b.ownWords)
  return { entry: scored[0].entry, problems: scored[0].problems }
}

/** the AI's answer as NEIS takes it: no markdown, no heading, one paragraph */
export function cleanReply(reply: string): string {
  const lines = reply
    .replace(/```[a-z]*\n?/gi, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    // headings and "---" rules
    .filter((line) => line && !line.startsWith('#') && !/^[-=*_]{3,}$/.test(line))
    .map((line) =>
      line
        .replace(/^([-*•·]|\d+[.)])\s+/, '')
        .replace(/\*\*|__|`/g, '')
        .trim(),
    )
    .filter(Boolean)
  return (
    lines
      .join(' ')
      // a lead-in about the answer itself ("…작성한 행동특성 및 종합의견은 다음과 같습니다.")
      // is not part of the record; small models add one now and then
      .replace(
        /^[^.。]{0,120}(?:다음과 같습니다|다음과 같이 작성|작성했습니다|작성합니다)[.:]?\s*/,
        '',
      )
      // "1 학기", "2 학년": the 2B model now and then splits a number from its unit
      .replace(/(\d) (학기|학년|학급)/g, '$1$2')
      // an answer wrapped in quotes loses them; a quoted title at its start keeps its own
      // ("‘이야기 속 세상’ 활동에서": stripping the first mark alone left "이야기 속 세상’ 활동에서")
      .replace(/^["'“‘「]+([\s\S]*?)["'”’」]+$/, '$1')
      // "초등학교 5학년 학급 회의에서": the request's header said back; an entry names no grade
      .replace(/^(?:초등학교|중학교|고등학교) ?\d+학년(?:의)? /u, '')
      // rule 6 of every 생기부 instruction: no "이 학생은"/"위 학생은" opening (the 2B model
      // still opens with one now and then; 2 of 4 행발 in a class, 2026-11-21)
      .replace(/^(?:이|위|해당|본)\s*학생(?:은|이|의 경우)\s*,?\s*/, '')
      .trim()
  )
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
const NOTES_HEADERS = [
  '개별관찰및특성기록',
  '개별관찰기록',
  '학생관찰및특성기록',
  '관찰기록',
  '학생역할및관찰기록',
]
const RESULT_HEADERS: Record<RecordMode, string[]> = {
  subject: ['세특', '교과세특'],
  behavior: ['행동특성및종합의견', '행발'],
  activity: ['창체특기사항', '특기사항', '창의적체험활동특기사항'],
}
const LEVEL_HEADERS = ['성취수준', '성취도']

const NOTES_TITLE: Record<RecordMode, string> = {
  subject: '개별 관찰 및 특성 기록',
  behavior: '학생 관찰 및 특성 기록',
  activity: '학생 역할 및 관찰 기록',
}
const RESULT_TITLE: Record<RecordMode, string> = {
  subject: '세특',
  behavior: '행동 특성 및 종합의견',
  activity: '창체 특기사항',
}

const headerKey = (cell: string): string => cell.replace(/\s+/g, '')

const isLevel = (value: string): value is Level => (LEVELS as readonly string[]).includes(value)

export type StudentFields = Omit<Student, 'id'>

/** the students of a CSV this page saved, or of the original site's (found by column name) */
export function studentsFromCsv(
  text: string,
  mode: RecordMode,
  limit: number = MAX_STUDENTS,
): StudentFields[] {
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
    .slice(0, limit)
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
/** the names under a '성명' or '이름' header, up to limit (the page tells what it left out) */
export function rosterNames(text: string, limit: number = MAX_STUDENTS): string[] {
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
  return names.slice(0, limit)
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
  const head =
    mode === 'subject'
      ? (subjectOf(work.info) || '교과') + ' 세특'
      : mode === 'activity'
        ? areaLabel(work.info) || '창체'
        : '행발'
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
      area: isArea(text(info.area)) ? (text(info.area) as ActivityArea) : '',
      activityName: text(info.activityName),
      activityContent: text(info.activityContent),
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
      if (s.mode !== 'subject' && s.mode !== 'behavior' && s.mode !== 'activity') return null
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
