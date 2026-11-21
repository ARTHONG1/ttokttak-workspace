import { describe, expect, it } from 'vitest'
import { FEATURES, proposalArticle } from '../src/renderer/src/SpecialFeatures'

describe('똑딱업무 tools', () => {
  it('lists 문서 변환 after 똑딱서명, then 생기부', () => {
    expect(FEATURES.map((f) => f.id)).toEqual([
      'proposal',
      'quiz',
      'sign',
      'convert',
      'organize',
      'record',
    ])
    expect(FEATURES.find((f) => f.id === 'convert')?.title).toBe('문서 변환')
    expect(FEATURES.find((f) => f.id === 'organize')?.title).toBe('똑딱정리')
    expect(FEATURES.find((f) => f.id === 'record')?.title).toBe('생기부')
  })
})

/**
 * 특화 기능 > 품의서 생성 writes the 기안문 of the author's ACE AI 품의서 생성기. The text
 * below is what that site produced on 2026-10-30 for the same title and cart.
 */
describe('proposal article', () => {
  const row = (description: string, quantity: number, unitPrice: number) => ({
    description,
    specification: '',
    unit: '개',
    quantity,
    unitPrice,
    amount: quantity * unitPrice,
  })

  it('matches the original generator line for line', () => {
    const rows = [
      row('모나미 153 볼펜', 5, 3600),
      row('3M 포스트잇', 2, 8900),
      row('바른손 A4 복사용지', 1, 25000),
    ]
    expect(proposalArticle('2025학년도 4학년 학급 용품 구입', rows)).toBe(
      [
        '1. 관련: ',
        '2. 2025학년도 4학년 학급 용품 구입을(를) 구입하고자 합니다.',
        '   가. 품목: 모나미 153 볼펜 외 2종',
        '   나. 금액: 금60,800원',
        '   다. 구입처: 온라인 쇼핑몰',
        '   .  끝.',
      ].join('\n'),
    )
  })

  it('names a single item without 외', () => {
    expect(proposalArticle('교실 시계 구입', [row('벽시계', 1, 15000)])).toContain(
      '가. 품목: 벽시계\n',
    )
  })

  // the 배송비 row is a cost, not an item: three goods and their shipping are "외 2종"
  // (a real cart read "외 3종", 2026-11-21)
  it('does not count the 배송비 row as an item', () => {
    const article = proposalArticle('학급 사무용품 구입', [
      row('모나미 153 볼펜', 5, 3600),
      row('3M 포스트잇 플래그', 10, 4200),
      row('복사용지', 2, 24900),
      row('배송비', 1, 3000),
    ])
    expect(article).toContain('가. 품목: 모나미 153 볼펜 외 2종\n')
    expect(article).toContain('나. 금액: 금112,800원')
    expect(
      proposalArticle('교실 시계 구입', [row('벽시계', 1, 15000), row('배송비', 1, 3000)]),
    ).toContain('가. 품목: 벽시계\n')
    // a product whose name mentions 배송비 is still one of the goods
    expect(
      proposalArticle('간식 구입', [row('과자 세트(배송비 포함)', 1, 20000), row('음료', 2, 5000)]),
    ).toContain('가. 품목: 과자 세트(배송비 포함) 외 1종\n')
  })
})
