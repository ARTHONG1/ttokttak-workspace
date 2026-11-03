/**
 * Filling the 품의등록 screen: planFill only reads (it is the preview), applyFill writes
 * the item rows first, then the title and summary, and undoes its own rows if anything
 * fails. Only three kinds of write happen: the screen's own 품목 행 추가 function, setColumn
 * on the item dataset, and set_value on the title and summary. Nothing saves, submits or
 * talks to the server; saving stays with the teacher.
 */
import { getPath, isDataset } from './nexacro'
import type { PumuiItem, PumuiPackage } from './pumui-package'
import { detectScreen, gridDataset, readUnitTable, type WorkForm } from './screen'
import type { ScreenMap } from './screen-map'
import { matchUnit } from './units'

export interface FillPlan {
  key: string
  title: string
  summary: string
  rows: { item: PumuiItem; unitCode: string }[]
  unmatched: PumuiItem[]
  existingRows: number
  total: number
  blockers: string[]
}

export type FillResult =
  | { ok: true; added: number; gridTotal: number }
  | { ok: false; reason: string; rolledBack: number }

export function planFill(form: WorkForm, map: ScreenMap, pkg: PumuiPackage): FillPlan {
  const plan: FillPlan = {
    key: pkg.createdAt + '|' + pkg.title,
    title: pkg.title,
    summary: pkg.summary,
    rows: [],
    unmatched: [],
    existingRows: 0,
    total: pkg.total,
    blockers: [],
  }
  if (detectScreen(form, map).kind !== 'pumui') {
    plan.blockers.push('K-에듀파인 품의등록 화면을 열어 주세요.')
    return plan
  }
  plan.existingRows = gridDataset(form, map)?.rowcount ?? 0
  const units = readUnitTable(form, map)
  if (units.length === 0) {
    plan.blockers.push('화면에서 단위 목록을 읽지 못했어요. 물품·용역 구분을 먼저 골라 주세요.')
    return plan
  }
  for (const item of pkg.items) {
    const unitCode = matchUnit(item.unit, units)
    if (unitCode) plan.rows.push({ item, unitCode })
    else plan.unmatched.push(item)
  }
  if (plan.unmatched.length) {
    plan.blockers.push(
      '단위를 찾지 못한 품목이 있어요: ' +
        plan.unmatched.map((i) => i.description + '(' + (i.unit || '단위 없음') + ')').join(', '),
    )
  }
  const budget = getPath(form, map.pumui.budget)
  if (!isDataset(budget) || budget.rowcount === 0) {
    plan.blockers.push('예산 내역이 비어 있어요. 예산을 먼저 불러와 주세요.')
  }
  return plan
}

const fail = (reason: string, rolledBack = 0): FillResult => ({ ok: false, reason, rolledBack })

export function applyFill(
  form: WorkForm,
  map: ScreenMap,
  plan: FillPlan,
  filled: Set<string> = new Set(),
): FillResult {
  if (plan.blockers.length) return fail(plan.blockers[0])
  if (filled.has(plan.key)) return fail('이 품의는 이 화면에 이미 채웠어요.')
  const ds = gridDataset(form, map)
  const add = getPath(form, map.pumui.rowAddHandler)
  const button = getPath(form, map.pumui.rowAddButton)
  if (!ds || typeof add !== 'function') return fail('K-에듀파인 품의등록 화면을 열어 주세요.')
  const c = map.pumui.columns
  const start = ds.rowcount
  let added = 0
  const undo = (): number => {
    let removed = 0
    for (let r = ds.rowcount - 1; r >= start && removed < added; r--) {
      try {
        ds.deleteRow(r)
        removed++
      } catch {
        break
      }
    }
    return removed
  }
  try {
    for (const [i, { item, unitCode }] of plan.rows.entries()) {
      const before = ds.rowcount
      add.call(form, button, {})
      if (ds.rowcount !== before + 1) {
        if (added === 0) return fail('예산 내역에서 예산 줄을 먼저 골라 주세요.')
        return fail(i + 1 + '번째 품목 행을 추가하지 못했어요. 이번에 넣은 행은 되돌렸어요.', undo())
      }
      added++
      const r = ds.rowcount - 1
      ds.setColumn(r, c.name, item.description)
      ds.setColumn(r, c.spec, item.specification)
      ds.setColumn(r, c.unit, unitCode)
      ds.setColumn(r, c.qty, item.quantity)
      ds.setColumn(r, c.price, item.unitPrice)
    }
    let gridTotal = 0
    for (let r = start; r < ds.rowcount; r++) {
      gridTotal += Math.round(Number(ds.getColumn(r, c.qty)) * Number(ds.getColumn(r, c.price)))
    }
    if (gridTotal !== plan.total) {
      return fail('화면에 들어간 금액 합계가 품의 합계와 달라요. 이번에 넣은 행은 되돌렸어요.', undo())
    }
    const title = getPath(form, map.pumui.title) as { set_value(v: string): void }
    const summary = getPath(form, map.pumui.summary) as { set_value(v: string): void }
    title.set_value(plan.title)
    summary.set_value(plan.summary)
    filled.add(plan.key)
    return { ok: true, added, gridTotal }
  } catch (e) {
    return fail('채우는 중 오류가 났어요(' + String((e as Error)?.message ?? e) + '). 이번에 넣은 행은 되돌렸어요.', undo())
  }
}

