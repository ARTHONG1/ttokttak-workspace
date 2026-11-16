import { FIELDS, SHIPPING, UNITS } from './policy'
import type { PumuiFlag, VerifyResult } from './types'

/**
 * The money check outside the model, line for line the same as pumui_v2/verifier.py in the
 * model project (tests/pumui-verifier.test.ts compares the two on its 240 vectors).
 * - confirmed: nothing is flagged and a total written in the text equals the rows' total
 * - unconfirmed: nothing is flagged, but the text has no total to compare with
 * - needs_review: something is flagged
 * It never changes a row; it only says why a row needs a look.
 */

const NUMBER = /\d{1,3}(?:,\d{3})+(?!\d)|\d+/g
export const CART_TOTAL =
  /총\s*상품\s*(금액|가격)|상품\s*금액\s*합계|상품\s*합계|결제\s*예정\s*금액|총\s*결제\s*금액|최종\s*결제\s*금액|총\s*주문\s*금액|합계\s*금액|총액/
export const GOODS_TOTAL = /총\s*상품\s*(금액|가격)|상품\s*금액\s*합계|상품\s*합계/
export const SHIP = /배송비|배송료|택배비|운송비/
export const SHIP_SUM = /총\s*배송비|배송비\s*합계/
export const COUPON = /쿠폰\s*할인|할인\s*금액|할인\s*합계/
export const VAT = /(부가세|VAT|vat)\s*별도/
const TABLE_TOTAL = /^\s*\|?\s*합계[\s|,;:]/
const VALUE_ONLY = /^[\s₩￦\-|]*[\d,]+\s*[원￦₩]?[\s|]*$/
const WORDISH = /[가-힣A-Za-z0-9]/

/** every number in the text; "5,360" counts as 5360 and also as 5 and 360 */
export function numbers(text: string): Set<number> {
  const found = new Set<number>()
  for (const match of text.matchAll(NUMBER)) {
    const token = match[0]
    found.add(Number(token.replaceAll(',', '')))
    for (const part of token.split(',')) found.add(Number(part))
  }
  return found
}

export function lineNumbers(line: string): number[] {
  return [...line.matchAll(NUMBER)].map((m) => Number(m[0].replaceAll(',', '')))
}

const maxOf = (values: number[]): number | null => (values.length ? Math.max(...values) : null)

/** a copied screen often puts the label and its value on different lines: look below for a value-only line */
export function valueAt(lines: string[], index: number, ahead: number): number | null {
  const found = lineNumbers(lines[index])
  if (found.length) return maxOf(found)
  for (const line of lines.slice(index + 1, index + 1 + ahead)) {
    if (VALUE_ONLY.test(line)) return maxOf(lineNumbers(line))
    if (WORDISH.test(line)) return null
  }
  return null
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/** a 배송비 line that states one fee: not a free-shipping condition, not a sum of fees */
const isFeeLine = (line: string): boolean =>
  SHIP.test(line) && !line.includes('이상') && !line.includes('무료') && !SHIP_SUM.test(line)

/** the sums of every choice of 1 to 6 of the given fees */
function subsetSums(values: number[]): Set<number> {
  const out = new Set<number>()
  const limit = Math.min(values.length, 6)
  const walk = (start: number, size: number, sum: number) => {
    if (size > 0) out.add(sum)
    if (size === limit) return
    for (let i = start; i < values.length; i++) walk(i + 1, size + 1, sum + values[i])
  }
  walk(0, 0, 0)
  return out
}

export function check(source: string, items: readonly object[]): VerifyResult {
  const flags: PumuiFlag[] = []
  const flat = source.split(/\s+/).filter(Boolean).join(' ')
  const nums = numbers(source)
  const lines = source.split('\n').filter((l) => l.trim())
  const rows = items as readonly Record<string, unknown>[]
  const goods = rows.filter((i) => i.description !== SHIPPING)
  const shipRows = rows.filter((i) => i.description === SHIPPING)
  const names = goods.map((i) => JSON.stringify([i.description ?? null, i.specification ?? null]))
  if (new Set(names).size !== names.length) flags.push({ row: null, reason: 'duplicate_item' })
  rows.forEach((item, n) => {
    const keys = Object.keys(item)
    const sameFields = keys.length === FIELDS.length && FIELDS.every((f) => Object.hasOwn(item, f))
    if (!sameFields || typeof item.unit !== 'string' || !UNITS.includes(item.unit)) {
      flags.push({ row: n, reason: 'format' })
      return
    }
    const qty = item.quantity
    const price = item.unitPrice
    if (!isInt(qty) || !isInt(price) || qty < 1 || price < 0) {
      flags.push({ row: n, reason: 'format' })
      return
    }
    if (item.description === SHIPPING) return
    if (price === 0) flags.push({ row: n, reason: 'zero_price' })
    else if (!nums.has(price) && !nums.has(price * qty))
      flags.push({ row: n, reason: 'price_not_in_source' })
    // a screen whose quantity column was not copied: line total ÷ unit price
    const derived = nums.has(price) && nums.has(price * qty)
    if (qty !== 1 && !nums.has(qty) && !derived)
      flags.push({ row: n, reason: 'quantity_not_in_source' })
    for (const [key, reason] of [
      ['description', 'name_not_in_source'],
      ['specification', 'spec_not_in_source'],
    ] as const) {
      const tokens = String(item[key]).split(/\s+/).filter(Boolean)
      if (tokens.some((token) => !flat.includes(token))) flags.push({ row: n, reason })
    }
  })
  // 배송비: leave out conditions ("5만 원 이상 무료") and sums; the largest number of a line is its fee
  const feeLines = lines
    .map((l, n) => (isFeeLine(l) ? valueAt(lines, n, 5) : null))
    .filter((f): f is number => Boolean(f))
  const feeSums = lines.flatMap((l, n) => (SHIP_SUM.test(l) ? [valueAt(lines, n, 5) || 0] : []))
  const shipping = shipRows.reduce((sum, i) => sum + (isInt(i.unitPrice) ? i.unitPrice : 0), 0)
  if (shipRows.length > 1 || (shipRows.length > 0 && rows.at(-1) !== shipRows.at(-1)))
    flags.push({ row: null, reason: 'shipping_row_form' })
  if (shipRows.length > 0) {
    const subset = subsetSums(feeLines)
    const feeTotal = feeLines.reduce((a, b) => a + b, 0)
    if (shipping <= 0 || (!subset.has(shipping) && !feeSums.includes(shipping)))
      flags.push({ row: null, reason: 'shipping_not_in_source' })
    else if (feeLines.length > 0 && shipping !== feeTotal && !feeSums.includes(shipping))
      flags.push({ row: null, reason: 'shipping_partial' })
  } else if (feeLines.length > 0 || feeSums.some((f) => f > 0)) {
    flags.push({ row: null, reason: 'shipping_missing' })
  }
  // totals: each written total is compared with the one value its label means. Allowing several
  // readings lets a wrong answer pass when a missing item happens to cost as much as the shipping.
  const goodsTotal = goods.reduce(
    (sum, i) => sum + (isInt(i.quantity) && isInt(i.unitPrice) ? i.quantity * i.unitPrice : 0),
    0,
  )
  const coupon = lines
    .filter((l) => COUPON.test(l))
    .reduce((sum, l) => sum + (maxOf(lineNumbers(l)) ?? 0), 0)
  const stated: [number | null, number][] = []
  let feeSeen = false
  lines.forEach((line, n) => {
    if (isFeeLine(line)) feeSeen = true
    if (line.includes('수량')) return
    if (GOODS_TOTAL.test(line)) stated.push([valueAt(lines, n, 3), goodsTotal])
    else if (CART_TOTAL.test(line))
      stated.push([valueAt(lines, n, 3), goodsTotal + shipping - coupon])
    else if (TABLE_TOTAL.test(line + ' '))
      stated.push([maxOf(lineNumbers(line)), goodsTotal + (feeSeen ? shipping : 0)])
  })
  const known = stated.filter((s): s is [number, number] => s[0] !== null)
  const totalVerified = known.length > 0 && known.every(([value, want]) => value === want)
  if (known.length > 0 && !totalVerified) flags.push({ row: null, reason: 'total_mismatch' })
  if (VAT.test(source)) flags.push({ row: null, reason: 'vat_excluded' })
  const status = flags.length ? 'needs_review' : totalVerified ? 'confirmed' : 'unconfirmed'
  return { status, flags, totalVerified, goodsTotal, shipping, total: goodsTotal + shipping }
}
