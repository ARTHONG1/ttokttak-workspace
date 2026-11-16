import { describe, expect, it } from 'vitest'
import { allowedNumbers, extractGrammar } from '../src/renderer/src/pumui/grammar'

describe('품의 v3 number grammar for the built-in model', () => {
  const cart = '모나미 볼펜 구매가 12,000\n주문금액 48,000\n배송비 3,000원'

  it('allows the numbers written in the text, the comma parts too', () => {
    const allowed = allowedNumbers(cart)
    for (const n of [12000, 48000, 3000, 12, 48, 3, 0]) expect(allowed.has(n), String(n)).toBe(true)
    expect(allowed.has(4)).toBe(false)
    expect(allowed.has(28500)).toBe(false)
  })

  it('leaves out numbers of more than 9 digits', () => {
    expect(allowedNumbers('합계 1234567890').has(1234567890)).toBe(false)
  })

  it('fixes the v3 keys in order and lets money take only the allowed numbers', () => {
    const grammar = extractGrammar(cart)
    expect(grammar).toContain('"\\"name\\":"')
    const keys = ['name', 'spec', 'unit', 'qty', 'price', 'amount', 'state'].map((k) =>
      grammar.indexOf('\\"' + k + '\\":'),
    )
    expect(keys.every((at, i) => at > 0 && (i === 0 || at > keys[i - 1]))).toBe(true)
    expect(grammar).toMatch(/num ::= .*"48000"/)
    expect(grammar).not.toContain('"28500"')
    expect(grammar).not.toContain('"4"')
    expect(grammar).toContain('"\\"담음\\""')
  })

  it('still makes a grammar for a text without numbers', () => {
    const grammar = extractGrammar('볼펜 한 자루')
    expect(grammar).not.toMatch(/num ::= *$/m)
    expect(grammar).toContain('null')
  })
})
