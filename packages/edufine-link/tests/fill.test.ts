import { describe, expect, it } from 'vitest'
import { applyFill, planFill } from '../src/fill'
import { buildPumuiPackage, type PumuiItem } from '../src/pumui-package'
import { findWorkForm } from '../src/screen'
import { DEFAULT_SCREEN_MAP as map } from '../src/screen-map'
import { causeScreen, makeFakeEdufine, pumuiScreen } from './fixtures/fake-nexacro'

const item = (description: string, unit: string, quantity: number, unitPrice: number): PumuiItem => ({
  description,
  specification: '규격 ' + description,
  unit,
  quantity,
  unitPrice,
  amount: Math.round(quantity * unitPrice),
})
const pkg = buildPumuiPackage({
  title: '과학실 실험 도구 구입',
  summary: '1. 관련:\n2. 실험 도구를 구입하고자 합니다.',
  items: [item('비커 500ml', '개', 4, 3000), item('실험 키트', '세트', 2, 15000), item('배송비', '식', 1, 3000)],
  now: new Date('2026-11-03T01:00:00Z'),
})

function setup(opts: Parameters<typeof pumuiScreen>[1] = {}) {
  const fake = makeFakeEdufine(pumuiScreen(map, opts))
  return { fake, form: findWorkForm(fake.nx, map)! }
}

describe('planFill (preview, writes nothing)', () => {
  it('maps every item to a unit code and counts existing rows', () => {
    const { fake, form } = setup({ existingRows: [{ prdlstCn: '기존' }] })
    const plan = planFill(form, map, pkg)
    expect(plan.blockers).toEqual([])
    expect(plan.rows.map((r) => r.unitCode)).toEqual(['001', '017', '020'])
    expect(plan.existingRows).toBe(1)
    expect(plan.total).toBe(45000)
    expect(fake.writes).toEqual([])
  })

  it('blocks on a unit the table does not know', () => {
    const { form } = setup()
    const odd = buildPumuiPackage({ title: '체육 용품 구입하기', summary: '', items: [item('양말', '켤레', 2, 1000)] })
    const plan = planFill(form, map, odd)
    expect(plan.unmatched.map((i) => i.description)).toEqual(['양말'])
    expect(plan.blockers).toEqual(['단위를 찾지 못한 품목이 있어요: 양말(켤레)'])
  })

  it('blocks on another screen', () => {
    const fake = makeFakeEdufine(causeScreen(map))
    const plan = planFill(findWorkForm(fake.nx, map)!, map, pkg)
    expect(plan.blockers[0]).toBe('K-에듀파인 품의등록 화면을 열어 주세요.')
  })
})

describe('applyFill', () => {
  it('fills title, summary and every item, and the screen total matches', () => {
    const { fake, form } = setup()
    const res = applyFill(form, map, planFill(form, map, pkg))
    expect(res).toEqual({ ok: true, added: 3, gridTotal: 45000 })
    const rows = fake.dataset('dsPrdlstDtl')!.rows
    expect(rows[1]).toEqual({ prdlstCn: '실험 키트', stndrd: '규격 실험 키트', thngUnitSeCd: '017', qty: 2, expectUntpc: 15000 })
    const title = fake.writes.findIndex((w) => w.target === map.pumui.title)
    const lastColumn = fake.writes.map((w) => w.op).lastIndexOf('setColumn')
    expect(title).toBeGreaterThan(lastColumn)
    expect(fake.forbiddenCalls()).toBe(0)
  })

  it('appends after rows that were already there and leaves them alone', () => {
    const { fake, form } = setup({ existingRows: [{ prdlstCn: '기존1' }, { prdlstCn: '기존2' }] })
    expect(applyFill(form, map, planFill(form, map, pkg))).toMatchObject({ ok: true, added: 3 })
    const rows = fake.dataset('dsPrdlstDtl')!.rows
    expect(rows.map((r) => r.prdlstCn)).toEqual(['기존1', '기존2', '비커 500ml', '실험 키트', '배송비'])
  })

  it('writes nothing when no budget line is selected', () => {
    const { fake, form } = setup({ budgetSelected: false })
    const res = applyFill(form, map, planFill(form, map, pkg))
    expect(res).toEqual({ ok: false, reason: '예산 내역에서 예산 줄을 먼저 골라 주세요.', rolledBack: 0 })
    expect(fake.writes.filter((w) => w.op !== 'call')).toEqual([])
  })

  it('undoes its own rows when adding the third row fails', () => {
    const { fake, form } = setup({ existingRows: [{ prdlstCn: '기존' }], failAddAt: 3 })
    const res = applyFill(form, map, planFill(form, map, pkg))
    expect(res).toEqual({
      ok: false,
      reason: '3번째 품목 행을 추가하지 못했어요. 이번에 넣은 행은 되돌렸어요.',
      rolledBack: 2,
    })
    expect(fake.dataset('dsPrdlstDtl')!.rows).toEqual([{ prdlstCn: '기존' }])
    expect(fake.writes.some((w) => w.target === map.pumui.title)).toBe(false)
  })

  it('refuses a plan with blockers without writing', () => {
    const { fake, form } = setup()
    const odd = buildPumuiPackage({ title: '체육 용품 구입하기', summary: '', items: [item('양말', '켤레', 2, 1000)] })
    expect(applyFill(form, map, planFill(form, map, odd))).toMatchObject({ ok: false, rolledBack: 0 })
    expect(fake.writes).toEqual([])
  })

  it('refuses to fill the same 품의 twice on one page', () => {
    const { form } = setup()
    const memory = new Set<string>()
    expect(applyFill(form, map, planFill(form, map, pkg), memory)).toMatchObject({ ok: true })
    expect(applyFill(form, map, planFill(form, map, pkg), memory)).toEqual({
      ok: false,
      reason: '이 품의는 이 화면에 이미 채웠어요.',
      rolledBack: 0,
    })
  })
})

