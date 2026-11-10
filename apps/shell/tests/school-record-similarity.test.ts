import { describe, expect, it } from 'vitest'
import {
  entriesFromText,
  pairsToCsv,
  sharedPieces,
  similarity,
  similarPairs,
} from '../src/renderer/src/record/record-similarity'

/** 똑딱업무 > 생기부 > 유사도 검사: counted on the device, no AI */

const A =
  '강낭콩을 기르며 한살이를 관찰하고 관찰 일지를 꼼꼼히 기록함. 발표에서 자신의 생각을 논리적으로 설명함.'
const B =
  '강낭콩을 기르며 한살이를 관찰하고 관찰 일지를 꼼꼼히 기록함. 모둠 친구의 의견을 존중하며 협력함.'
const C = '리코더 연주에서 정확한 운지와 고른 호흡으로 곡의 분위기를 살려 표현함.'

describe('similarity', () => {
  it('is 100 for the same text, whatever the spacing and marks', () => {
    expect(similarity(A, A)).toBe(100)
    expect(similarity(A, A.replace(/ /g, '').replace(/\./g, ' / '))).toBe(100)
  })

  it('is 0 for texts with no wording in common, and for texts too short to say', () => {
    expect(similarity(A, C)).toBe(0)
    expect(similarity('성실함.', '성실함.')).toBe(0)
  })

  it('is in between for a shared sentence', () => {
    const p = similarity(A, B)
    expect(p).toBeGreaterThan(40)
    expect(p).toBeLessThan(90)
    expect(similarity(B, A)).toBe(p)
  })
})

describe('similar pairs', () => {
  const entries = [
    { name: '김하늘', text: A },
    { name: '이바다', text: C },
    { name: '박나래', text: B },
    { name: '최우주', text: A },
  ]

  it('lists the pairs over the floor, the most alike first', () => {
    const pairs = similarPairs(entries, 30)
    expect(pairs.map((p) => [p.a, p.b])).toEqual([
      [0, 3],
      [0, 2],
      [2, 3],
    ])
    expect(pairs[0].percent).toBe(100)
    expect(similarPairs(entries, 95)).toHaveLength(1)
  })

  it('writes them as a CSV', () => {
    const csv = pairsToCsv(entries, similarPairs(entries, 95)).split('\n')
    expect(csv[0]).toBe('학생 1,학생 2,유사도(%),글 1,글 2')
    expect(csv[1].startsWith('김하늘,최우주,100,')).toBe(true)
  })
})

describe('shared wording', () => {
  it('marks the wording both texts have, spaces inside it included', () => {
    const pieces = sharedPieces(A, B)
    expect(pieces.map((p) => p.text).join('')).toBe(A)
    const shared = pieces.filter((p) => p.shared).map((p) => p.text)
    expect(shared).toEqual(['강낭콩을 기르며 한살이를 관찰하고 관찰 일지를 꼼꼼히 기록함'])
  })

  it('marks nothing when nothing is shared', () => {
    expect(sharedPieces(A, C)).toEqual([{ text: A, shared: false }])
  })
})

describe('entries from a file', () => {
  it('reads a sheet: names under 성명, the text from the column with the most writing', () => {
    const text = [
      '# Sheet1',
      '2026학년도 생기부',
      '번호 | 성명 | 과목 | 세부능력 및 특기사항',
      '1 | 김하늘 | 과학 | ' + A,
      '2 | 이바다 | 과학 | ' + C,
      '3 | 박나래 | 과학 | ',
      '# Sheet2',
      '이름 | 내용',
      '다른반 | ' + B,
    ].join('\n')
    expect(entriesFromText(text)).toEqual([
      { name: '김하늘', text: A },
      { name: '이바다', text: C },
    ])
  })

  it('reads a CSV with quoted text, and numbers the rows without a name column', () => {
    expect(entriesFromText('\uFEFF이름,내용\n김하늘,"탐구에 적극적임, 성실함."\n')).toEqual([
      { name: '김하늘', text: '탐구에 적극적임, 성실함.' },
    ])
    expect(entriesFromText('첫 번째 글입니다\n두 번째 글입니다\n')).toEqual([
      { name: '1번', text: '첫 번째 글입니다' },
      { name: '2번', text: '두 번째 글입니다' },
    ])
    expect(entriesFromText('')).toEqual([])
  })
})
