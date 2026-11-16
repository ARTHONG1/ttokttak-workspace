import { describe, expect, it } from 'vitest'
import {
  canonicalUnit,
  computeRows,
  parseExtractReply,
  type ExtractItem,
} from '../src/renderer/src/pumui/compute'

const item = (
  qty: number | null,
  price: number | null,
  amount: number | null,
  extra: Partial<ExtractItem> = {},
): ExtractItem => ({
  name: '볼펜',
  spec: '',
  unit: null,
  qty,
  price,
  amount,
  state: '담음',
  ...extra,
})

const one = (qty: number | null, price: number | null, amount: number | null) => {
  const out = computeRows({ items: [item(qty, price, amount)], fees: [] })
  return {
    quantity: out.rows[0].quantity,
    unitPrice: out.rows[0].unitPrice,
    reasons: out.flags.map((f) => f.reason),
  }
}

describe('품의 v3 computation: the app does the arithmetic the model only copies', () => {
  it.each([
    [null, 12000, 48000, 4, 12000, []],
    [408, null, 11424000, 408, 28000, []],
    [3, 12200, 36600, 3, 12200, []],
    [3, 12200, 36000, 3, 12200, ['amount_mismatch']],
    [null, 700, 2000, 0, 700, ['not_divisible']],
    [null, 1500, null, 1, 1500, []],
    [null, null, 5000, 1, 5000, []],
    [2, null, null, 2, 0, ['price_missing']],
    [null, 0, 5000, 0, 0, ['not_divisible']],
  ] as const)('qty %s, price %s, amount %s → %s × %s %j', (qty, price, amount, q, p, reasons) => {
    expect(one(qty, price, amount)).toEqual({ quantity: q, unitPrice: p, reasons: [...reasons] })
  })

  it('does not compute with a value of more than 9 digits', () => {
    expect(one(3, 1_000_000_000, null).reasons).toEqual(['not_divisible'])
    expect(one(null, 12000, 12_000_000_000).reasons).toEqual(['not_divisible'])
  })

  it('keeps the amount column as quantity × unit price', () => {
    const out = computeRows({ items: [item(null, 12000, 48000)], fees: [] })
    expect(out.rows[0].amount).toBe(48000)
  })

  it('drops sold-out and unselected items', () => {
    const out = computeRows({
      items: [
        item(1, 100, null, { name: '담은 것' }),
        item(1, 200, null, { name: '품절', state: '품절' }),
        item(1, 300, null, { name: '미선택', state: '미선택' }),
      ],
      fees: [],
    })
    expect(out.rows.map((r) => r.description)).toEqual(['담은 것'])
  })

  it('maps the written unit to a K-에듀파인 unit, and anything else to 개', () => {
    expect(canonicalUnit('박스')).toBe('상자')
    expect(canonicalUnit('EA')).toBe('개')
    expect(canonicalUnit('세트')).toBe('SET')
    expect(canonicalUnit('켤레')).toBe('켤레')
    expect(canonicalUnit('자루')).toBe('개')
    expect(canonicalUnit(null)).toBe('개')
  })

  it('adds the fees up into one 배송비 row at the end, and none for no fee', () => {
    const fees = (list: number[]) => computeRows({ items: [item(1, 100, null)], fees: list }).rows
    const rows = fees([3000, 2500])
    expect(rows.at(-1)).toEqual({
      description: '배송비',
      specification: '',
      unit: '식',
      quantity: 1,
      unitPrice: 5500,
      amount: 5500,
    })
    expect(fees([])).toHaveLength(1)
    expect(fees([0])).toHaveLength(1)
  })

  it('names the row each flag is about', () => {
    const out = computeRows({ items: [item(1, 100, null), item(2, null, null)], fees: [] })
    expect(out.flags).toEqual([{ row: 1, reason: 'price_missing' }])
  })
})

describe('reading a v3 reply', () => {
  it('reads the JSON even with words around it', () => {
    const reply =
      '답: {"items":[{"name":"볼펜","spec":"흑색","unit":"자루","qty":3,"price":1000,"amount":null,"state":"담음"}],"fees":[3000]}'
    expect(parseExtractReply(reply)).toEqual({
      items: [
        {
          name: '볼펜',
          spec: '흑색',
          unit: '자루',
          qty: 3,
          price: 1000,
          amount: null,
          state: '담음',
        },
      ],
      fees: [3000],
    })
  })

  it('refuses a reply it cannot read, with a message for the user', () => {
    expect(() => parseExtractReply('모르겠어요')).toThrow(/AI 답/)
    expect(() => parseExtractReply('{"rows":[]}')).toThrow(/AI 답/)
    expect(() =>
      parseExtractReply('{"items":[{"name":"볼펜","qty":"세 개","state":"담음"}],"fees":[]}'),
    ).toThrow(/AI 답/)
  })
})
