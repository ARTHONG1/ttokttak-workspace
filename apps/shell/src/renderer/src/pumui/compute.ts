import { canonicalUnit, isSafeAmount, SHIPPING } from './policy'
import type { EstimateRow, PumuiFlag } from './types'

export { canonicalUnit } from './policy'

/**
 * 품의 v3 ("옮겨 적기"): the model copies the values written in the cart and this file does
 * the arithmetic. It never guesses: a value it cannot compute stays 0 and its row is flagged.
 */

export type ExtractState = '담음' | '품절' | '미선택'

export interface ExtractItem {
  name: string
  spec: string
  unit: string | null
  qty: number | null
  price: number | null
  amount: number | null
  state: ExtractState
}

export interface ExtractReply {
  items: ExtractItem[]
  fees: number[]
}

const UNREADABLE = 'AI 답을 읽지 못했어요. 다시 해 주세요.'
const STATES: readonly string[] = ['담음', '품절', '미선택']

const numberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  throw new Error(UNREADABLE)
}

/** the v3 reply → items and fees; anything else is an error for the user (no silent fallback) */
export function parseExtractReply(reply: string): ExtractReply {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error(UNREADABLE)
  let data: unknown
  try {
    data = JSON.parse(reply.slice(start, end + 1))
  } catch {
    throw new Error(UNREADABLE)
  }
  const { items, fees } = (data ?? {}) as { items?: unknown; fees?: unknown }
  if (!Array.isArray(items) || (fees !== undefined && !Array.isArray(fees)))
    throw new Error(UNREADABLE)
  return {
    items: items.map((raw): ExtractItem => {
      if (!raw || typeof raw !== 'object') throw new Error(UNREADABLE)
      const it = raw as Record<string, unknown>
      const state = it.state ?? '담음'
      if (typeof it.name !== 'string' || typeof state !== 'string' || !STATES.includes(state))
        throw new Error(UNREADABLE)
      if (it.spec !== undefined && typeof it.spec !== 'string') throw new Error(UNREADABLE)
      if (it.unit !== undefined && it.unit !== null && typeof it.unit !== 'string')
        throw new Error(UNREADABLE)
      return {
        name: it.name,
        spec: typeof it.spec === 'string' ? it.spec : '',
        unit: typeof it.unit === 'string' ? it.unit : null,
        qty: numberOrNull(it.qty),
        price: numberOrNull(it.price),
        amount: numberOrNull(it.amount),
        state: state as ExtractState,
      }
    }),
    fees: ((fees ?? []) as unknown[]).map((f) => {
      const n = numberOrNull(f)
      if (n === null) throw new Error(UNREADABLE)
      return n
    }),
  }
}

interface Money {
  quantity: number
  unitPrice: number
  reason?: 'amount_mismatch' | 'not_divisible' | 'price_missing'
}

/** one item's quantity and unit price from the values the text gave (PUMUI_V3_APP_REQUEST 2-2) */
function money(qty: number | null, price: number | null, amount: number | null): Money {
  const given = [qty, price, amount].filter((v): v is number => v !== null)
  if (given.some((v) => !isSafeAmount(v)))
    return {
      quantity: isSafeAmount(qty) ? qty : 0,
      unitPrice: isSafeAmount(price) ? price : 0,
      reason: 'not_divisible',
    }
  if (price === null && amount === null)
    return { quantity: qty ?? 1, unitPrice: 0, reason: 'price_missing' }
  if (qty !== null && price !== null) {
    const differs = amount !== null && BigInt(qty) * BigInt(price) !== BigInt(amount)
    return { quantity: qty, unitPrice: price, ...(differs ? { reason: 'amount_mismatch' } : {}) }
  }
  if (price !== null && amount !== null) {
    if (price === 0 || amount % price !== 0 || amount === 0)
      return { quantity: 0, unitPrice: price, reason: 'not_divisible' }
    return { quantity: amount / price, unitPrice: price }
  }
  if (qty !== null && amount !== null) {
    if (qty === 0 || amount % qty !== 0)
      return { quantity: qty, unitPrice: 0, reason: 'not_divisible' }
    return { quantity: qty, unitPrice: amount / qty }
  }
  if (price !== null) return { quantity: 1, unitPrice: price }
  return { quantity: 1, unitPrice: amount ?? 0 }
}

export function computeRows(reply: ExtractReply): { rows: EstimateRow[]; flags: PumuiFlag[] } {
  const rows: EstimateRow[] = []
  const flags: PumuiFlag[] = []
  for (const item of reply.items) {
    if (item.state !== '담음') continue
    const m = money(item.qty, item.price, item.amount)
    if (m.reason) flags.push({ row: rows.length, reason: m.reason })
    rows.push({
      description: item.name.trim(),
      specification: item.spec.trim(),
      unit: canonicalUnit(item.unit),
      quantity: m.quantity,
      unitPrice: m.unitPrice,
      amount: m.quantity * m.unitPrice,
    })
  }
  const shipping = reply.fees.filter(isSafeAmount).reduce((a, b) => a + b, 0)
  if (shipping > 0)
    rows.push({
      description: SHIPPING,
      specification: '',
      unit: '식',
      quantity: 1,
      unitPrice: shipping,
      amount: shipping,
    })
  return { rows, flags }
}
