/**
 * 특화 기능 > 똑딱퀴즈 단어 찾기: the word-search worksheet of the author's WordClass
 * (studio--ai-canvas-ddjku), read from its shipped page bundle. The grid maker is the
 * original's: the longest words go first, each gets 100 random tries at a place and
 * direction, a whole grid is tried 20 times until every word appears exactly once, and
 * the blanks are filled from the letters of the words plus a common-syllable set.
 */

export interface Placement {
  horizontal: boolean
  vertical: boolean
  diagonal: boolean
  allowBackward: boolean
}

export type Overlap = 'allow' | 'maximize' | 'minimize'

export interface SearchSettings {
  words: string[]
  definitions: Record<string, string>
  rows: number
  cols: number
  placement: Placement
  overlap: Overlap
}

export interface PlacedWord {
  word: string
  row: number
  col: number
  direction: string
}

export interface Puzzle {
  grid: string[][]
  placed: PlacedWord[]
  unplaced: string[]
  words: string[]
}

export const MAX_WORDS = 50
export const RECOMMENDED_WORDS = 5
export const NO_DEFINITION = '뜻 없음'

export const SIZES = [
  { label: '작게 (10×10)', value: 10 },
  { label: '보통 (15×15)', value: 15 },
  { label: '크게 (20×20)', value: 20 },
  { label: '아주 크게 (25×25)', value: 25 },
]

/** the original's difficulty slider: grid, directions and overlap together */
export const LEVELS: { label: string; size: number; placement: Placement; overlap: Overlap }[] = [
  {
    label: '쉬움',
    size: 10,
    placement: { horizontal: true, vertical: true, diagonal: false, allowBackward: false },
    overlap: 'minimize',
  },
  {
    label: '보통',
    size: 15,
    placement: { horizontal: true, vertical: true, diagonal: true, allowBackward: false },
    overlap: 'allow',
  },
  {
    label: '어려움',
    size: 20,
    placement: { horizontal: true, vertical: true, diagonal: true, allowBackward: true },
    overlap: 'maximize',
  },
]

interface Direction {
  name: string
  dr: number
  dc: number
}

const FORWARD: Direction[] = [
  { name: 'horizontal', dr: 0, dc: 1 },
  { name: 'vertical', dr: 1, dc: 0 },
  { name: 'diagDownRight', dr: 1, dc: 1 },
  { name: 'diagUpRight', dr: -1, dc: 1 },
  { name: 'diagDownLeft', dr: 1, dc: -1 },
  { name: 'diagUpLeft', dr: -1, dc: -1 },
]

const BACKWARD: Direction[] = [
  { name: 'horizontalReverse', dr: 0, dc: -1 },
  { name: 'verticalReverse', dr: -1, dc: 0 },
  { name: 'diagDownRightReverse', dr: -1, dc: -1 },
  { name: 'diagUpRightReverse', dr: 1, dc: -1 },
  { name: 'diagDownLeftReverse', dr: -1, dc: 1 },
  { name: 'diagUpLeftReverse', dr: 1, dc: 1 },
]

export function directionsFor(p: Placement): Direction[] {
  const out: Direction[] = []
  if (p.horizontal) out.push(FORWARD[0])
  if (p.vertical) out.push(FORWARD[1])
  if (p.diagonal) out.push(...FORWARD.slice(2))
  if (p.allowBackward) {
    if (p.horizontal) out.push(BACKWARD[0])
    if (p.vertical) out.push(BACKWARD[1])
    if (p.diagonal) out.push(...BACKWARD.slice(2))
  }
  return out.length > 0 ? out : [FORWARD[0]]
}

const KOREAN_FILL =
  '가나다라마바사아자차카타파하고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후그느드르므브스으즈츠크트프흐기니디리미비시이지치키티피히'.split(
    '',
  )
const LATIN_FILL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** the fill letters: Korean syllables when any word is Hangul, else A–Z, plus every letter used */
export function fillLetters(words: string[]): string[] {
  const korean = words.some((w) => /[ㄱ-힣]/.test(w))
  const set = new Set(korean ? KOREAN_FILL : LATIN_FILL)
  for (const w of words) for (const ch of w) if (ch.trim()) set.add(ch.toUpperCase())
  return [...set]
}

/** a word's letters as grid cells; a space is not a cell */
const lettersOf = (w: string) => [...w.toUpperCase()].filter((ch) => ch.trim())

function fits(
  grid: string[][],
  letters: string[],
  r: number,
  c: number,
  d: Direction,
  overlap: Overlap,
): boolean {
  const rows = grid.length
  const cols = grid[0].length
  for (let i = 0; i < letters.length; i++) {
    const y = r + i * d.dr
    const x = c + i * d.dc
    if (y < 0 || y >= rows || x < 0 || x >= cols) return false
    const cell = grid[y][x]
    if (cell !== '' && (cell !== letters[i] || overlap === 'minimize')) return false
  }
  return true
}

function put(grid: string[][], letters: string[], r: number, c: number, d: Direction): void {
  for (let i = 0; i < letters.length; i++) grid[r + i * d.dr][c + i * d.dc] = letters[i]
}

/**
 * How many places a word can be read in the grid along the allowed directions: a one-letter
 * word reads the same every way from its cell, so it counts once per cell.
 */
export function occurrences(grid: string[][], word: string, dirs: Direction[]): number {
  const letters = lettersOf(word)
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (letters.length === 1) {
    let one = 0
    for (const row of grid) for (const cell of row) if (cell === letters[0]) one++
    return one
  }
  // the original's reverse diagonals repeat its four forward ones; a line counts once
  const seen = new Set<string>()
  dirs = dirs.filter((d) => {
    const key = d.dr + ',' + d.dc
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  let n = 0
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (const d of dirs) {
        let ok = true
        for (let i = 0; i < letters.length && ok; i++) {
          const y = r + i * d.dr
          const x = c + i * d.dc
          ok = y >= 0 && y < rows && x >= 0 && x < cols && grid[y][x] === letters[i]
        }
        if (ok && letters.length > 0) n++
      }
  return n
}

/** the words the grid holds: trimmed, without repeats (case-blind) and no longer than the grid */
export function cleanWords(words: string[], rows: number, cols: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of words) {
    const w = raw.trim()
    const key = w.toUpperCase()
    if (!w || seen.has(key) || lettersOf(w).length > Math.max(rows, cols)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

function attempt(words: string[], s: SearchSettings, dirs: Direction[], rand: () => number) {
  const grid = Array.from({ length: s.rows }, () => Array<string>(s.cols).fill(''))
  const placed: PlacedWord[] = []
  const unplaced: string[] = []
  for (const word of [...words].sort((a, b) => lettersOf(b).length - lettersOf(a).length)) {
    const letters = lettersOf(word)
    let done = false
    for (let i = 0; i < 100 && !done; i++) {
      const d = dirs[Math.floor(rand() * dirs.length)]
      const r = Math.floor(rand() * s.rows)
      const c = Math.floor(rand() * s.cols)
      if (fits(grid, letters, r, c, d, s.overlap)) {
        put(grid, letters, r, c, d)
        placed.push({ word, row: r, col: c, direction: d.name })
        done = true
      }
    }
    if (!done) unplaced.push(word)
  }
  return { grid, placed, unplaced }
}

export function makePuzzle(s: SearchSettings, rand: () => number = Math.random): Puzzle {
  const words = cleanWords(s.words, s.rows, s.cols)
  const dirs = directionsFor(s.placement)
  const fill = fillLetters(words)
  // A blank may not take a letter that spells a word along any allowed line through it,
  // so a word appears only where it was placed. One-letter words would otherwise show up
  // wherever the fill repeats them, which the original lets through on its last try.
  const keys = words.map((w) => lettersOf(w))
  const completes = (grid: string[][], r: number, c: number): boolean => {
    for (const letters of keys) {
      for (let k = 0; k < letters.length; k++) {
        if (letters[k] !== grid[r][c]) continue
        for (const d of dirs) {
          let ok = true
          for (let i = 0; i < letters.length && ok; i++) {
            const y = r + (i - k) * d.dr
            const x = c + (i - k) * d.dc
            ok = y >= 0 && y < s.rows && x >= 0 && x < s.cols && grid[y][x] === letters[i]
          }
          if (ok) return true
        }
      }
    }
    return false
  }
  const fillBlanks = (grid: string[][]) => {
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] !== '') continue
        const start = Math.floor(rand() * fill.length)
        // the first letter, from a random start, that spells no extra word here
        for (let i = 0; i < fill.length; i++) {
          grid[r][c] = fill[(start + i) % fill.length]
          if (!completes(grid, r, c)) break
        }
      }
  }
  for (let tryNo = 0; tryNo < 20; tryNo++) {
    const a = attempt(words, s, dirs, rand)
    if (a.unplaced.length > 0) continue
    fillBlanks(a.grid)
    // a word that reads twice, once by chance in the fill, would confuse the answer
    if (words.every((w) => occurrences(a.grid, w, dirs) === 1)) return { ...a, words }
  }
  const a = attempt(words, s, dirs, rand)
  fillBlanks(a.grid)
  return { ...a, words }
}

/** the cells of each placed word, for the answer view: "row,col" keys */
export function answerCells(puzzle: Puzzle): Map<string, number> {
  const cells = new Map<string, number>()
  const dirs = new Map([...FORWARD, ...BACKWARD].map((d) => [d.name, d]))
  puzzle.placed.forEach((p, n) => {
    const d = dirs.get(p.direction)
    if (!d) return
    lettersOf(p.word).forEach((_ch, i) => cells.set(p.row + i * d.dr + ',' + (p.col + i * d.dc), n))
  })
  return cells
}

/** the original's checks before making a sheet; problems that stop it, then mere advice */
export function checkSettings(s: SearchSettings): { blocking: string[]; advice: string[] } {
  const blocking: string[] = []
  const advice: string[] = []
  if (s.words.length === 0) blocking.push('학습지에 넣을 단어를 1개 이상 입력해 주세요.')
  else if (s.words.length < RECOMMENDED_WORDS)
    advice.push(
      '알찬 학습지를 위해 ' +
        RECOMMENDED_WORDS +
        '개 이상의 단어를 권해요. (지금 ' +
        s.words.length +
        '개)',
    )
  if (!s.placement.horizontal && !s.placement.vertical && !s.placement.diagonal)
    blocking.push('단어 배치 방향을 하나 이상 골라 주세요.')
  const size = Math.max(s.rows, s.cols)
  for (const w of s.words) {
    const n = lettersOf(w).length
    if (n > size && (s.placement.horizontal || s.placement.vertical))
      blocking.push(
        '"' + w + '"(' + n + '자)는 ' + size + '×' + size + ' 그리드에 비해 너무 길어요.',
      )
    else if (s.placement.diagonal && (n > s.rows || n > s.cols))
      advice.push('"' + w + '"(' + n + '자)는 대각선으로 넣기에 길 수 있어요.')
  }
  return { blocking, advice }
}

/** a word typed into the list: letters, numbers and spaces only, as the original allows */
export function wordProblem(word: string, list: string[]): string | null {
  const w = word.trim()
  if (!w) return '추가할 단어를 입력해 주세요.'
  if (/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\s]/.test(w)) return '단어에는 특수문자를 쓸 수 없어요.'
  if (list.some((x) => x.toUpperCase() === w.toUpperCase()))
    return '"' + w + '"는 이미 목록에 있어요.'
  if (list.length >= MAX_WORDS) return '단어는 ' + MAX_WORDS + '개까지 넣을 수 있어요.'
  return null
}

const hasDefinition = (d: string | undefined) =>
  !!d && d.trim() !== '' && d.trim() !== NO_DEFINITION

/** the original's distractors for the matching activity */
const DISTRACTORS = [
  '물 속에서 숨을 쉴 수 있게 하는 장비.',
  '밤하늘을 관찰하는 데 사용하는 광학 기구.',
  '매우 높은 산의 정상.',
  '바다 깊은 곳에 사는 큰 물고기.',
]

export interface Matching {
  words: { id: string; text: string }[]
  meanings: { id: string; text: string; wordId: string | null }[]
}

/** words with a meaning on the left, their meanings shuffled with up to 2 distractors on the right */
export function makeMatching(
  s: Pick<SearchSettings, 'words' | 'definitions'>,
  rand: () => number = Math.random,
): Matching | null {
  const words = s.words
    .filter((w) => hasDefinition(s.definitions[w]))
    .map((w, i) => ({ id: 'w' + i, text: w }))
  if (words.length < 2) return null
  const meanings: Matching['meanings'] = words.map((w, i) => ({
    id: 'm' + i,
    text: s.definitions[w.text].trim(),
    wordId: w.id,
  }))
  const used = new Set(meanings.map((m) => m.text))
  let left = Math.min(2, Math.floor(words.length / 2))
  for (const d of DISTRACTORS) {
    if (left <= 0) break
    if (used.has(d)) continue
    meanings.push({ id: 'm' + meanings.length, text: d, wordId: null })
    left--
  }
  for (let i = meanings.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[meanings[i], meanings[j]] = [meanings[j], meanings[i]]
  }
  return { words, meanings }
}

export const cardWords = (s: Pick<SearchSettings, 'words' | 'definitions'>): string[] =>
  s.words.filter((w) => hasDefinition(s.definitions[w]))

export function suggestionPrompt(count: number): string {
  return [
    '너는 학교 선생님을 돕는 낱말 학습지 도우미다. 사용자가 말한 주제와 수준에 맞는 단어와 뜻풀이를 JSON 하나로만 답한다.',
    '형식: {"suggestions":[{"word":"단어","definition":"뜻풀이"}]}',
    '규칙:',
    '- 단어는 정확히 ' + count + '개.',
    '- 단어는 띄어쓰기와 특수문자가 없는 한 낱말이다. 한글이면 2~6글자, 영어면 3~12글자로 한다.',
    '- 같은 단어를 두 번 쓰지 않는다.',
    '- 뜻풀이는 학생이 읽기 쉬운 한 문장으로, 단어 자체를 쓰지 않는다.',
    '- 사용자가 영어 단어를 원하면 단어는 영어로, 뜻풀이는 한국어로 쓴다.',
    '설명이나 코드 블록 없이 JSON만 출력한다.',
  ].join('\n')
}

export function parseSuggestions(
  reply: string,
  have: string[],
): { word: string; definition: string }[] {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 답에서 단어를 찾지 못했어요. 다시 해 주세요.')
  const data = JSON.parse(reply.slice(start, end + 1)) as { suggestions?: unknown }
  const list = Array.isArray(data.suggestions) ? data.suggestions : []
  const taken = new Set(have.map((w) => w.toUpperCase()))
  const out: { word: string; definition: string }[] = []
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>
    const word =
      typeof r.word === 'string' ? r.word.replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\s]/g, '').trim() : ''
    const definition = typeof r.definition === 'string' ? r.definition.trim() : ''
    if (!word || taken.has(word.toUpperCase())) continue
    taken.add(word.toUpperCase())
    out.push({ word, definition: definition || NO_DEFINITION })
  }
  return out
}
