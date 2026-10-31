/**
 * 특화 기능 > 퀴즈 생성기: the data and rules of the author's ACE QUIZ LAB
 * ported by the author from that app into this one.
 *
 * A quiz is { questions: Question[] }. Five types: 선택형 (four options, the answer is
 * one of them), OX형 (options O and X), 단답형 (no options), 순서 완성형 (the options are
 * the items, the answer the right order as 1-based positions, "2,4,1,3") and 초성퀴즈
 * (the one option is the hint). Blooket CSV and the QuizN template take them as the
 * original exports them.
 */

export type QuestionType =
  'multiple-choice' | 'ox' | 'short-answer' | 'ordering' | 'initial-consonant'

export interface Question {
  id: string
  type: QuestionType
  question: string
  options?: string[]
  answer: string
  explanation?: string
}

export interface QuizData {
  questions: Question[]
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface QuizCounts {
  multipleChoice: number
  ox: number
  shortAnswer: number
  ordering: number
  initialConsonant: number
}

export const QUESTION_TYPES: QuestionType[] = [
  'multiple-choice',
  'ox',
  'short-answer',
  'ordering',
  'initial-consonant',
]

/** the original's labels: the list badge, the tab and the QuizN template's type column */
export const TYPE_LABEL: Record<QuestionType, string> = {
  'multiple-choice': '선택형',
  ox: 'OX형',
  'short-answer': '단답형',
  ordering: '순서 완성형',
  'initial-consonant': '초성퀴즈',
}

export const TYPE_TAB: Record<QuestionType, string> = {
  'multiple-choice': '선택',
  ox: 'OX',
  'short-answer': '단답',
  ordering: '순서',
  'initial-consonant': '초성',
}

const QUIZN_TYPE: Record<QuestionType, string> = {
  'multiple-choice': '선택형',
  ox: 'OX형',
  'short-answer': '단답형',
  ordering: '순서완성형',
  'initial-consonant': '초성퀴즈',
}

export const MAX_QUESTIONS = 30

export const totalOf = (c: QuizCounts): number =>
  c.multipleChoice + c.ox + c.shortAnswer + c.ordering + c.initialConsonant

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
}

export const LANGUAGES: { code: string; label: string; name: string }[] = [
  { code: 'ko', label: '한국어', name: 'Korean' },
  { code: 'en', label: 'English', name: 'English' },
  { code: 'ja', label: '日本語', name: 'Japanese' },
  { code: 'zh', label: '中文', name: 'Simplified Chinese' },
  { code: 'ru', label: 'Русский', name: 'Russian' },
  { code: 'vi', label: 'Tiếng Việt', name: 'Vietnamese' },
]

const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'

/** the initial consonants of a Hangul word ("엽록소" → "ㅇㄹㅅ"); other characters stay */
export function chosungOf(word: string): string {
  let out = ''
  for (const ch of word) {
    const code = ch.codePointAt(0) ?? 0
    out += code >= 0xac00 && code <= 0xd7a3 ? CHOSUNG[Math.floor((code - 0xac00) / 588)] : ch
  }
  return out
}

let idSeed = 0
export const newId = (): string => Date.now().toString(36) + '-' + (idSeed++).toString(36)

const clean = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''

/** "2, 4,1 ,3" → [2,4,1,3] when it is a full ordering of n items, else null */
export function orderOf(answer: string, n: number): number[] | null {
  const parts = answer
    .split(/[,\s→>-]+/)
    .filter(Boolean)
    .map((p) => Number(p))
  if (parts.length !== n || parts.some((p) => !Number.isInteger(p) || p < 1 || p > n)) return null
  return new Set(parts).size === n ? parts : null
}

/**
 * One question as the AI wrote it, made usable, or null when it cannot be: a 선택형 gets
 * its answer as one of its options (a number names an option), an OX answer is O or X, a
 * 순서 완성형 answer is a full ordering of its items, and a 초성퀴즈 hint is computed from
 * the answer so it always matches.
 */
export function normalizeQuestion(raw: unknown): Question | null {
  const q = (raw ?? {}) as Record<string, unknown>
  const type = QUESTION_TYPES.includes(q.type as QuestionType) ? (q.type as QuestionType) : null
  const question = clean(q.question)
  let answer = clean(q.answer)
  const explanation = clean(q.explanation)
  if (!type || !question) return null
  const options = Array.isArray(q.options) ? q.options.map(clean).filter(Boolean) : []
  const id = clean(q.id) || newId()
  const base = { id, type, question, explanation: explanation || undefined }
  switch (type) {
    case 'multiple-choice': {
      if (options.length < 2) return null
      const byNumber = /^\d+$/.test(answer) ? options[Number(answer) - 1] : undefined
      const match =
        options.find((o) => o === answer) ??
        byNumber ??
        options.find((o) => o.toLowerCase() === answer.toLowerCase())
      if (!match) return null
      return { ...base, options: options.slice(0, 4), answer: match }
    }
    case 'ox': {
      const a = answer.toUpperCase()
      answer =
        a.startsWith('O') || a === '참' || a === 'TRUE' || a === '1' || answer === '○'
          ? 'O'
          : a.startsWith('X') || a === '거짓' || a === 'FALSE' || answer === '×'
            ? 'X'
            : ''
      if (!answer) return null
      return { ...base, options: ['O', 'X'], answer }
    }
    case 'short-answer':
      if (!answer) return null
      return { ...base, answer }
    case 'ordering': {
      if (options.length < 2) return null
      let order = orderOf(answer, options.length)
      if (!order) {
        // the answer may list the items themselves in the right order
        const items = answer.split(/\s*(?:→|->|,|>)\s*/).filter(Boolean)
        const idx = items.map((it) => options.indexOf(it) + 1)
        if (
          idx.length === options.length &&
          idx.every((i) => i > 0) &&
          new Set(idx).size === idx.length
        )
          order = idx
      }
      if (!order) return null
      return { ...base, options, answer: order.join(',') }
    }
    case 'initial-consonant':
      if (!answer) return null
      return { ...base, options: [chosungOf(answer)], answer }
  }
}

/** the questions of an AI reply: the first JSON object in it, normalized */
export function parseQuizReply(reply: string): QuizData {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 답에서 문제를 찾지 못했어요. 다시 해 주세요.')
  let data: unknown
  try {
    data = JSON.parse(reply.slice(start, end + 1))
  } catch {
    throw new Error('AI 답을 읽지 못했어요. 다시 해 주세요.')
  }
  const list = (data as { questions?: unknown }).questions
  if (!Array.isArray(list)) throw new Error('AI 답에서 문제를 찾지 못했어요. 다시 해 주세요.')
  const questions = list.map(normalizeQuestion).filter((q): q is Question => q !== null)
  if (questions.length === 0) throw new Error('AI가 제공된 내용으로 문제를 만들지 못했어요.')
  return { questions }
}

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: '쉬움: 본문에 그대로 나온 사실을 묻는다. 보기의 오답은 뚜렷하게 다르다.',
  medium: '보통: 본문의 내용을 이해해야 풀 수 있다. 오답 보기는 그럴듯하게 만든다.',
  hard: '어려움: 여러 문장을 연결하거나 적용해야 풀 수 있다. 오답 보기는 헷갈리게 만든다.',
}

export function generationPrompt(counts: QuizCounts, difficulty: Difficulty): string {
  const want = [
    ['multiple-choice', counts.multipleChoice],
    ['ox', counts.ox],
    ['short-answer', counts.shortAnswer],
    ['ordering', counts.ordering],
    ['initial-consonant', counts.initialConsonant],
  ]
    .filter(([, n]) => Number(n) > 0)
    .map(([t, n]) => '- ' + t + ': ' + n + '문제')
    .join('\n')
  return [
    '너는 학교 선생님을 돕는 퀴즈 출제자다. 사용자가 준 학습 자료의 내용만으로 퀴즈를 만들어 JSON 하나로만 답한다.',
    '만들 문제 수(유형별로 정확히 이만큼):',
    want,
    '난이도 ' + DIFFICULTY_TEXT[difficulty],
    '형식: {"questions":[{"type":"유형","question":"질문","options":["..."],"answer":"정답","explanation":"해설"}]}',
    '유형별 규칙:',
    '- multiple-choice: options는 보기 4개. answer는 정답 보기의 글자 그대로.',
    '- ox: options는 ["O","X"]. question은 참이나 거짓을 판단할 문장. answer는 "O" 또는 "X".',
    '- short-answer: options를 넣지 않는다. answer는 한두 낱말의 짧은 답.',
    '- ordering: options는 순서를 맞출 항목 3~5개를 섞은 순서로 넣는다. answer는 올바른 순서대로 options의 번호(1부터)를 쉼표로 잇는다. 예: "2,4,1,3".',
    '- initial-consonant: answer는 본문에 나온 한글 낱말 하나. options에는 그 낱말의 초성을 하나 넣는다(예: 엽록소 → ["ㅇㄹㅅ"]). question은 그 낱말을 설명한다.',
    '모든 문제에 한두 문장의 explanation을 쓴다. 같은 내용을 두 번 묻지 않는다.',
    '자료가 한국어가 아니어도 문제는 한국어로 쓴다.',
    '설명, 머리말, 코드 블록 없이 JSON만 출력한다.',
  ].join('\n')
}

export function translationPrompt(language: string): string {
  return [
    '너는 퀴즈 번역가다. 사용자가 준 퀴즈 JSON의 question, options, answer, explanation을 ' +
      language +
      '로 번역해 같은 모양의 JSON 하나로만 답한다.',
    '규칙: id와 type은 그대로 둔다. ox의 options와 answer("O","X")는 바꾸지 않는다. ordering의 answer(번호 목록)는 바꾸지 않고 options의 순서도 그대로 둔다.',
    'multiple-choice의 answer는 번역한 options 가운데 하나와 글자가 같아야 한다. initial-consonant는 answer만 번역하고 options는 그대로 둔다.',
    '설명이나 코드 블록 없이 JSON만 출력한다.',
  ].join('\n')
}

/** a translated quiz back in the original's ids and order; a question the reply lost stays as it was */
export function mergeTranslation(original: QuizData, reply: string): QuizData {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  const data = JSON.parse(reply.slice(start, end + 1)) as { questions?: unknown[] }
  const byId = new Map<string, Record<string, unknown>>()
  for (const q of data.questions ?? []) {
    const r = (q ?? {}) as Record<string, unknown>
    if (typeof r.id === 'string') byId.set(r.id, r)
  }
  return {
    questions: original.questions.map((q) => {
      const t = byId.get(q.id)
      if (!t) return q
      const options = Array.isArray(t.options) ? t.options.map(clean) : q.options
      const out: Question = {
        ...q,
        question: clean(t.question) || q.question,
        explanation: clean(t.explanation) || q.explanation,
      }
      if (q.type === 'multiple-choice' && options && options.length === q.options?.length) {
        const answer = clean(t.answer)
        out.options = options
        out.answer = options.includes(answer)
          ? answer
          : (options[q.options.indexOf(q.answer)] ?? answer)
      } else if (q.type === 'short-answer' || q.type === 'initial-consonant') {
        out.answer = clean(t.answer) || q.answer
      } else if (q.type === 'ordering' && options && options.length === q.options?.length) {
        out.options = options
      }
      return out
    }),
  }
}

/** what a learner's answer is checked against, and how the right answer reads */
export function answerText(q: Question): string {
  if (q.type === 'ordering' && q.options) {
    const order = orderOf(q.answer, q.options.length)
    if (order) return order.map((i) => q.options![i - 1]).join(' → ')
  }
  return q.answer
}

export function isCorrect(q: Question, given: string | string[]): boolean {
  if (q.type === 'ordering') {
    const order = q.options ? orderOf(q.answer, q.options.length) : null
    return !!order && JSON.stringify(given) === JSON.stringify(order.map((i) => q.options![i - 1]))
  }
  const g = String(given)
  if (q.type === 'short-answer' || q.type === 'initial-consonant') {
    const flat = (s: string) => s.replace(/\s+/g, '').toLowerCase()
    return flat(g) === flat(q.answer)
  }
  return g === q.answer
}

/** Blooket's import CSV, as the original writes it: 선택형 and OX only, 20 seconds each */
export function blooketCsv(data: QuizData): string {
  const cell = (v: unknown) => {
    const t = v == null ? '' : String(v)
    return t.includes('"') || t.includes(',') || t.includes('\n')
      ? '"' + t.replace(/"/g, '""') + '"'
      : t
  }
  const rows: unknown[][] = [
    ['Blooket Import Template', '', '', '', '', '', '', ''],
    [
      'Question #',
      'Question Text',
      'Answer 1',
      'Answer 2',
      'Answer 3 (Optional)',
      'Answer 4 (Optional)',
      'Time Limit (sec)',
      'Correct Answer(s)',
    ],
  ]
  data.questions
    .filter((q) => q.type === 'multiple-choice' || q.type === 'ox')
    .forEach((q, i) => {
      const opts = [...(q.options ?? (q.type === 'ox' ? ['O', 'X'] : []))]
      while (opts.length < 4) opts.push('')
      const at = opts.findIndex((o) => o.trim().toLowerCase() === q.answer.trim().toLowerCase()) + 1
      rows.push([i + 1, q.question, opts[0], opts[1], opts[2], opts[3], 20, at > 0 ? at : ''])
    })
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\n')
}

/** one row of QuizN's upload template (columns B to K from row 22), as the original fills it */
export function quiznRow(q: Question): (string | number)[] {
  const opts = q.options ? [...q.options] : q.type === 'ox' ? ['O', 'X'] : []
  let answer = q.answer
  if (q.type === 'multiple-choice' && q.options) {
    const at = q.options.findIndex((o) => o.trim() === q.answer.trim())
    answer = at >= 0 ? String(at + 1) : ''
  }
  return [
    QUIZN_TYPE[q.type],
    q.question,
    opts[0] ?? '',
    opts[1] ?? '',
    opts[2] ?? '',
    opts[3] ?? '',
    20,
    answer,
    'On',
    'Off',
  ]
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The template's sheet XML with the questions written into rows 22 on. Each cell keeps
 * its style attribute, so the template's look, checks and pictures stay as they are.
 */
export function fillQuiznSheet(sheetXml: string, data: QuizData): string {
  const cols = 'BCDEFGHIJK'
  let xml = sheetXml
  data.questions.slice(0, 100).forEach((q, i) => {
    const r = 22 + i
    quiznRow(q).forEach((value, c) => {
      const ref = cols[c] + r
      const cell = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)')
      const m = xml.match(cell)
      if (!m) return
      const style = (m[1].match(/ s="\d+"/) ?? [''])[0]
      const out =
        typeof value === 'number'
          ? '<c r="' + ref + '"' + style + '><v>' + value + '</v></c>'
          : value === ''
            ? '<c r="' + ref + '"' + style + '/>'
            : '<c r="' +
              ref +
              '"' +
              style +
              ' t="inlineStr"><is><t xml:space="preserve">' +
              xmlEscape(value) +
              '</t></is></c>'
      xml = xml.replace(m[0], out)
    })
  })
  return xml
}
