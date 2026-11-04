/**
 * 품의 패키지: one 품의 that 똑딱작업실 (web app, desktop app, AI agent tools) hands to the
 * 똑딱 에듀파인 연결 extension, which fills the K-에듀파인 품의등록 screen from it.
 * The same JSON travels over every route: direct connection, native messaging, clipboard
 * and a .ttokpumui file. parsePumuiPackage is the only way in, and it checks everything
 * the screen fill relies on (kind, version, title, item numbers, the total).
 */

export const PUMUI_KIND = 'ttokttak.pumui'
export const PUMUI_VERSION = 1
export const PUMUI_FILE_EXTENSION = '.ttokpumui'
/** larger input is refused before JSON.parse */
export const PUMUI_MAX_TEXT = 100_000

export interface PumuiItem {
  description: string
  specification: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface PumuiPackage {
  kind: typeof PUMUI_KIND
  version: typeof PUMUI_VERSION
  createdAt: string
  title: string
  summary: string
  items: PumuiItem[]
  total: number
}

export type ParsedPumui =
  { ok: true; pkg: PumuiPackage; ageHours: number } | { ok: false; reason: string }

const sum = (items: PumuiItem[]): number => items.reduce((s, it) => s + it.amount, 0)

export function buildPumuiPackage(input: {
  title: string
  summary: string
  items: PumuiItem[]
  now?: Date
}): PumuiPackage {
  const items = input.items.map((it) => ({
    description: it.description.trim(),
    specification: (it.specification ?? '').trim(),
    unit: (it.unit ?? '').trim(),
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    amount: Math.round(it.quantity * it.unitPrice),
  }))
  return {
    kind: PUMUI_KIND,
    version: PUMUI_VERSION,
    createdAt: (input.now ?? new Date()).toISOString(),
    title: input.title.trim(),
    summary: input.summary,
    items,
    total: sum(items),
  }
}

const fail = (reason: string): ParsedPumui => ({ ok: false, reason })
const NOT_OURS = '똑딱작업실에서 만든 품의가 아니에요.'

export function parsePumuiPackage(text: string, now: Date = new Date()): ParsedPumui {
  if (text.length > PUMUI_MAX_TEXT) return fail('품의가 너무 커요.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail(NOT_OURS)
  }
  if (!raw || typeof raw !== 'object') return fail(NOT_OURS)
  const p = raw as Record<string, unknown>
  if (p.kind !== PUMUI_KIND) return fail(NOT_OURS)
  if (p.version !== PUMUI_VERSION) {
    return fail('이 품의는 더 새로운 똑딱작업실에서 만들었어요. 확장 프로그램을 업데이트해 주세요.')
  }
  const title = typeof p.title === 'string' ? p.title.trim() : ''
  if (title.length < 5) return fail('품의 제목은 5자 이상이어야 해요.')
  if (!Array.isArray(p.items) || p.items.length === 0) return fail('품목이 하나도 없어요.')
  const items: PumuiItem[] = []
  for (const [i, entry] of p.items.entries()) {
    const n = i + 1
    const it = (entry ?? {}) as Record<string, unknown>
    const description = typeof it.description === 'string' ? it.description.trim() : ''
    if (!description) return fail(n + '번째 품목의 품명이 비어 있어요.')
    const nums = [it.quantity, it.unitPrice, it.amount]
    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return fail(n + '번째 품목의 수량·단가·금액이 숫자가 아니에요.')
    }
    const [quantity, unitPrice, amount] = nums as number[]
    if (Math.round(quantity * unitPrice) !== amount) {
      return fail(n + '번째 품목의 금액이 수량×단가와 달라요.')
    }
    items.push({
      description,
      specification: typeof it.specification === 'string' ? it.specification.trim() : '',
      unit: typeof it.unit === 'string' ? it.unit.trim() : '',
      quantity,
      unitPrice,
      amount,
    })
  }
  if (typeof p.total !== 'number' || p.total !== sum(items)) {
    return fail('합계가 품목 금액의 합과 달라요.')
  }
  const createdAt = typeof p.createdAt === 'string' ? p.createdAt : ''
  const made = Date.parse(createdAt)
  if (!Number.isFinite(made)) return fail(NOT_OURS)
  const pkg: PumuiPackage = {
    kind: PUMUI_KIND,
    version: PUMUI_VERSION,
    createdAt,
    title,
    summary: typeof p.summary === 'string' ? p.summary : '',
    items,
    total: p.total,
  }
  return { ok: true, pkg, ageHours: Math.max(0, Math.floor((now.getTime() - made) / 3_600_000)) }
}
