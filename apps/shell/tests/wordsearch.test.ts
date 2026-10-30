import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  answerCells,
  checkSettings,
  cleanWords,
  directionsFor,
  fillLetters,
  makeMatching,
  makePuzzle,
  occurrences,
  parseSuggestions,
  wordProblem,
  type SearchSettings,
} from '../src/renderer/src/wordsearch-model'

/**
 * 똑딱퀴즈 > 단어 찾기 follows the author's WordClass. The words below are the ten its AI
 * suggested on 2026-10-31 for "초등학교 4학년 과학 식물 관련 단어".
 */
const WORDS = ['뿌리', '줄기', '잎', '꽃', '열매', '씨', '암술', '수술', '발아', '광합성']

/** a repeatable random source, so a failing grid can be reproduced */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const settings = (level: number, words = WORDS): SearchSettings => ({
  words,
  definitions: Object.fromEntries(words.map((w) => [w, w + '의 뜻'])),
  rows: LEVELS[level].size,
  cols: LEVELS[level].size,
  placement: LEVELS[level].placement,
  overlap: LEVELS[level].overlap,
})

describe('the word-search grid', () => {
  for (const [level, name] of [
    [0, '쉬움'],
    [1, '보통'],
    [2, '어려움'],
  ] as const) {
    it('places every word exactly once at ' + name, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const s = settings(level)
        const p = makePuzzle(s, seeded(seed))
        expect(p.unplaced).toEqual([])
        expect(p.grid).toHaveLength(s.rows)
        expect(
          p.grid.every((row) => row.length === s.cols && row.every((c) => c.length === 1)),
        ).toBe(true)
        const dirs = directionsFor(s.placement)
        for (const w of WORDS) expect(occurrences(p.grid, w, dirs)).toBe(1)
      }
    })
  }

  it('keeps to the chosen directions', () => {
    const p = makePuzzle(
      {
        ...settings(1),
        placement: { horizontal: true, vertical: false, diagonal: false, allowBackward: false },
      },
      seeded(7),
    )
    expect(new Set(p.placed.map((x) => x.direction))).toEqual(new Set(['horizontal']))
  })

  it('does not let words share a cell when overlap is kept low', () => {
    const p = makePuzzle(settings(0), seeded(3))
    const cells = answerCells(p)
    const letters = p.placed.reduce((n, x) => n + [...x.word].length, 0)
    expect(cells.size).toBe(letters)
  })

  it('reports a word it could not fit', () => {
    const p = makePuzzle(
      { ...settings(0, ['가나다라마바사아자차카', '가나']), rows: 3, cols: 3 },
      seeded(1),
    )
    expect(p.words).toEqual(['가나'])
  })

  it('fills with Korean syllables for Korean words and A–Z otherwise', () => {
    expect(fillLetters(['광합성'])).toContain('하')
    expect(fillLetters(['광합성'])).toContain('광')
    expect(fillLetters(['apple'])).toContain('Z')
    expect(fillLetters(['apple'])).not.toContain('가')
  })

  it('drops repeats and words longer than the grid', () => {
    expect(cleanWords([' 잎 ', '잎', 'Leaf', 'leaf', '아주아주아주긴단어입니다'], 10, 10)).toEqual([
      '잎',
      'Leaf',
    ])
  })
})

describe('the checks before a sheet', () => {
  it('stops without words or directions and advises on few words', () => {
    expect(checkSettings({ ...settings(1, []) }).blocking).toHaveLength(1)
    expect(
      checkSettings({
        ...settings(1),
        placement: { horizontal: false, vertical: false, diagonal: false, allowBackward: true },
      }).blocking,
    ).toHaveLength(1)
    expect(checkSettings(settings(1, ['잎', '꽃'])).advice[0]).toContain('5개')
  })

  it('takes letters, numbers and spaces only, without repeats, 50 at most', () => {
    expect(wordProblem('광합성', [])).toBeNull()
    expect(wordProblem('광-합성', [])).toContain('특수문자')
    expect(wordProblem('LEAF', ['leaf'])).toContain('이미')
    expect(
      wordProblem(
        '새',
        Array.from({ length: 50 }, (_, i) => 'w' + i),
      ),
    ).toContain('50개')
  })
})

describe('the activities', () => {
  it('pairs each word with its meaning and adds the original distractors', () => {
    const m = makeMatching(settings(1), seeded(2))!
    expect(m.words).toHaveLength(10)
    expect(m.meanings).toHaveLength(12)
    expect(
      m.meanings
        .filter((x) => x.wordId === null)
        .map((x) => x.text)
        .sort(),
    ).toEqual(
      ['물 속에서 숨을 쉴 수 있게 하는 장비.', '밤하늘을 관찰하는 데 사용하는 광학 기구.'].sort(),
    )
    for (const w of m.words)
      expect(m.meanings.find((x) => x.wordId === w.id)?.text).toBe(w.text + '의 뜻')
  })

  it('needs two words with a meaning', () => {
    expect(
      makeMatching({ words: ['잎', '꽃'], definitions: { 잎: '뜻 없음', 꽃: '피는 것' } }),
    ).toBeNull()
  })

  it('reads the AI suggestions without repeats or symbols', () => {
    const reply =
      '{"suggestions":[{"word":"잎","definition":"a"},{"word":"광합-성","definition":"b"},{"word":"줄기","definition":""}]}'
    expect(parseSuggestions(reply, ['잎'])).toEqual([
      { word: '광합성', definition: 'b' },
      { word: '줄기', definition: '뜻 없음' },
    ])
  })
})
