import { describe, expect, it } from 'vitest'
import {
  buildPumuiPackage,
  parsePumuiPackage,
  PUMUI_FILE_EXTENSION,
  type PumuiItem,
} from '../../../src/features/edufine-pumui/package'

const item = (quantity: number, unitPrice: number, description = '비커 500ml'): PumuiItem => ({
  description,
  specification: '유리',
  unit: '개',
  quantity,
  unitPrice,
  amount: Math.round(quantity * unitPrice),
})

const base = { title: '과학실 실험 도구 구입', summary: '1. 관련: \n2. 구입하고자 합니다.' }

describe('pumui package', () => {
  it('round-trips through text', () => {
    const now = new Date('2026-11-03T01:00:00Z')
    const pkg = buildPumuiPackage({
      ...base,
      items: [item(2, 1000), item(1, 3500, '스포이트')],
      now,
    })
    expect(pkg).toMatchObject({
      kind: 'ttokttak.pumui',
      version: 1,
      total: 5500,
      createdAt: now.toISOString(),
    })
    const back = parsePumuiPackage(JSON.stringify(pkg), new Date('2026-11-03T02:00:00Z'))
    expect(back).toEqual({ ok: true, pkg, ageHours: 1 })
  })

  it('names the file extension', () => {
    expect(PUMUI_FILE_EXTENSION).toBe('.ttokpumui')
  })

  it('rejects a package whose total does not add up', () => {
    const pkg = buildPumuiPackage({ ...base, items: [item(2, 1000)] })
    expect(parsePumuiPackage(JSON.stringify({ ...pkg, total: 1 }))).toEqual({
      ok: false,
      reason: '합계가 품목 금액의 합과 달라요.',
    })
  })

  it('rejects a line whose amount is not quantity times unit price', () => {
    const pkg = buildPumuiPackage({ ...base, items: [item(2, 1000)] })
    const broken = { ...pkg, items: [{ ...pkg.items[0], amount: 1999 }], total: 1999 }
    expect(parsePumuiPackage(JSON.stringify(broken))).toEqual({
      ok: false,
      reason: '1번째 품목의 금액이 수량×단가와 달라요.',
    })
  })

  it('accepts a discount line with a negative amount when the total matches', () => {
    const items = [item(2, 1000), { ...item(1, -500, '할인금액'), unit: '식' }]
    const pkg = buildPumuiPackage({ ...base, items })
    expect(parsePumuiPackage(JSON.stringify(pkg))).toMatchObject({ ok: true })
    expect(pkg.total).toBe(1500)
  })

  it('rejects other text, wrong kind or version, no items and a short title', () => {
    expect(parsePumuiPackage('볼펜 3개 주문합니다')).toEqual({
      ok: false,
      reason: '똑딱작업실에서 만든 품의가 아니에요.',
    })
    const pkg = buildPumuiPackage({ ...base, items: [item(1, 100)] })
    expect(parsePumuiPackage(JSON.stringify({ ...pkg, kind: 'other' }))).toEqual({
      ok: false,
      reason: '똑딱작업실에서 만든 품의가 아니에요.',
    })
    expect(parsePumuiPackage(JSON.stringify({ ...pkg, version: 2 }))).toEqual({
      ok: false,
      reason: '이 품의는 더 새로운 똑딱작업실에서 만들었어요. 확장 프로그램을 업데이트해 주세요.',
    })
    expect(parsePumuiPackage(JSON.stringify({ ...pkg, items: [], total: 0 }))).toEqual({
      ok: false,
      reason: '품목이 하나도 없어요.',
    })
    expect(parsePumuiPackage(JSON.stringify({ ...pkg, title: '볼펜' }))).toEqual({
      ok: false,
      reason: '품의 제목은 5자 이상이어야 해요.',
    })
  })

  it('rejects input that is too large', () => {
    expect(parsePumuiPackage('x'.repeat(100_001))).toEqual({
      ok: false,
      reason: '품의가 너무 커요.',
    })
  })

  it('rejects non-finite numbers and empty item names', () => {
    const pkg = buildPumuiPackage({ ...base, items: [item(1, 100)] })
    const bad = { ...pkg, items: [{ ...pkg.items[0], quantity: 'x' }] }
    expect(parsePumuiPackage(JSON.stringify(bad))).toEqual({
      ok: false,
      reason: '1번째 품목의 수량·단가·금액이 숫자가 아니에요.',
    })
    const noName = { ...pkg, items: [{ ...pkg.items[0], description: ' ' }] }
    expect(parsePumuiPackage(JSON.stringify(noName))).toEqual({
      ok: false,
      reason: '1번째 품목의 품명이 비어 있어요.',
    })
  })

  it('reports the age of an old package', () => {
    const pkg = buildPumuiPackage({
      ...base,
      items: [item(1, 100)],
      now: new Date('2026-11-01T00:00:00Z'),
    })
    const res = parsePumuiPackage(JSON.stringify(pkg), new Date('2026-11-02T01:00:00Z'))
    expect(res).toMatchObject({ ok: true, ageHours: 25 })
  })
})
