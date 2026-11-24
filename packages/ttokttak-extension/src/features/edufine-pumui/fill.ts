/**
 * Filling the 품의등록 screen: planFill only reads (it is the preview), applyFill writes
 * the item rows first, then the title and summary, and undoes its own rows if anything
 * fails. Only three kinds of write happen: the screen's own 품목 행 추가 function, setColumn
 * on the item dataset, and set_value on the title and summary. Nothing saves, submits or
 * talks to the server; saving stays with the teacher.
 */
import { getPath, isDataset } from '../../sites/edufine/nexacro'
import type { PumuiItem, PumuiPackage } from './package'
import { detectScreen, gridDataset, readUnitTable, type WorkForm } from '../../sites/edufine/screen'
import type { ScreenMap } from '../../sites/edufine/screen-map'
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
  | { ok: false; reason: string; rolledBack: number; needsBudget?: boolean }

export function probePumui(form: WorkForm | null, map: ScreenMap) {
  if (!form || detectScreen(form, map).kind !== 'pumui') return { state: 'menu' as const }
  const budget = getPath(form, map.pumui.budget)
  const row = getPath(budget, 'rowposition')
  const selected =
    isDataset(budget) &&
    typeof row === 'number' &&
    Number.isInteger(row) &&
    row >= 0 &&
    row < budget.rowcount
  const units = readUnitTable(form, map)
  const grid = gridDataset(form, map)
  if (!selected || !units.length || !grid) return { state: 'waiting' as const }
  return { state: 'ready' as const, form, grid, budget, mark: budgetMark(form, map) }
}

/**
 * What the teacher's budget choice looks like right now: the budget dataset's current row
 * and any check-style columns. The panel waits for this to change after K-에듀파인 refused
 * a row for want of a chosen budget line, then fills again on its own (never on a timer).
 */
export function budgetMark(form: WorkForm, map: ScreenMap): string {
  const ds = getPath(form, map.pumui.budget)
  if (!isDataset(ds)) return ''
  const pos = String((ds as { rowposition?: unknown }).rowposition ?? '')
  const listing = ds as { getColCount?: () => number; getColID?: (i: number) => unknown }
  const cols: string[] = []
  const count = typeof listing.getColCount === 'function' ? listing.getColCount() : 0
  for (let i = 0; i < count; i++) {
    const id = String(listing.getColID?.(i) ?? '')
    if (/chk|check|sel/i.test(id)) cols.push(id)
  }
  const marks: string[] = []
  for (let r = 0; r < ds.rowcount; r++)
    marks.push(cols.map((c) => String(ds.getColumn(r, c))).join(','))
  return pos + '|' + ds.rowcount + '|' + marks.join(';')
}

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
  protect = false,
): FillResult {
  if (plan.blockers.length) return fail(plan.blockers[0])
  if (filled.has(plan.key)) return fail('이 품의는 이 화면에 이미 채웠어요.')
  const ds = gridDataset(form, map)
  const add = getPath(form, map.pumui.rowAddHandler)
  const button = getPath(form, map.pumui.rowAddButton)
  if (!ds || typeof add !== 'function') return fail('K-에듀파인 품의등록 화면을 열어 주세요.')
  const c = map.pumui.columns
  const start = ds.rowcount
  const title = getPath(form, map.pumui.title) as { value?: unknown; set_value(v: string): void }
  const summary = getPath(form, map.pumui.summary) as typeof title
  const oldTitle = title?.value
  const oldSummary = summary?.value
  const normalize = (value: unknown): string => String(value ?? '').replace(/\r\n/g, '\n')
  const matchesRow = (row: number, { item, unitCode }: FillPlan['rows'][number]): boolean =>
    String(ds.getColumn(row, c.name) ?? '') === item.description &&
    String(ds.getColumn(row, c.spec) ?? '') === item.specification &&
    String(ds.getColumn(row, c.unit) ?? '') === unitCode &&
    ds.getColumn(row, c.qty) != null &&
    Number(ds.getColumn(row, c.qty)) === item.quantity &&
    ds.getColumn(row, c.price) != null &&
    Number(ds.getColumn(row, c.price)) === item.unitPrice
  if (protect) {
    if (probePumui(form, map).state !== 'ready' || typeof ds.deleteRow !== 'function') {
      return fail('예산 줄과 단위 목록이 준비된 품의등록 화면을 확인해 주세요.')
    }
    if (
      !(oldTitle == null || typeof oldTitle === 'string') ||
      !(oldSummary == null || typeof oldSummary === 'string') ||
      !title ||
      !('value' in title) ||
      !summary ||
      !('value' in summary)
    ) {
      return fail('화면의 제목과 개요를 읽지 못했어요.')
    }
    if (
      (normalize(oldTitle).trim() && normalize(oldTitle) !== normalize(plan.title)) ||
      (normalize(oldSummary).trim() && normalize(oldSummary) !== normalize(plan.summary))
    ) {
      return fail('화면에 다른 제목이나 개요가 있어요. 새 품의등록 화면을 열어 주세요.')
    }
    for (let r = 0; r <= start - plan.rows.length; r++) {
      if (plan.rows.every((row, i) => matchesRow(r + i, row)))
        return fail('같은 품목이 이미 화면에 있어요. 중복 입력을 멈췄어요.')
    }
  }
  let added = 0
  let changedHeadings = false
  const undo = (): number => {
    let removed = 0
    for (let r = ds.rowcount - 1; r >= start && removed < added; r--) {
      try {
        if (ds.deleteRow(r) === false) break
        removed++
      } catch {
        break
      }
    }
    return removed
  }
  const recover = (reason: string): FillResult => {
    const rolledBack = undo()
    let restored = ds.rowcount === start
    if (changedHeadings) {
      try {
        title.set_value(String(oldTitle ?? ''))
        summary.set_value(String(oldSummary ?? ''))
        restored &&=
          normalize(title.value) === normalize(oldTitle) &&
          normalize(summary.value) === normalize(oldSummary)
      } catch {
        restored = false
      }
    }
    return fail(
      reason +
        (restored
          ? ' 이번 입력은 되돌렸어요.'
          : ' 일부 입력을 되돌리지 못했어요. 화면을 확인해 주세요.'),
      rolledBack,
    )
  }
  try {
    for (const [i, { item, unitCode }] of plan.rows.entries()) {
      const before = ds.rowcount
      add.call(form, button, {})
      if (ds.rowcount !== before + 1) {
        if (protect) {
          added = Math.max(0, ds.rowcount - start)
          return recover(i + 1 + '번째 품목 행을 추가하지 못했어요.')
        }
        if (added === 0)
          return {
            ok: false,
            reason: '예산 내역에서 예산 줄을 먼저 골라 주세요.',
            rolledBack: 0,
            needsBudget: true,
          }
        return fail(
          i + 1 + '번째 품목 행을 추가하지 못했어요. 이번에 넣은 행은 되돌렸어요.',
          undo(),
        )
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
    if (protect && !plan.rows.every((row, i) => matchesRow(start + i, row)))
      return recover('품목 입력값이 보낸 내용과 달라요.')
    for (let r = start; r < ds.rowcount; r++) {
      gridTotal += Math.round(Number(ds.getColumn(r, c.qty)) * Number(ds.getColumn(r, c.price)))
    }
    if (gridTotal !== plan.total) {
      if (protect) return recover('화면에 들어간 금액 합계가 품의 합계와 달라요.')
      return fail(
        '화면에 들어간 금액 합계가 품의 합계와 달라요. 이번에 넣은 행은 되돌렸어요.',
        undo(),
      )
    }
    changedHeadings = protect
    title.set_value(plan.title)
    summary.set_value(plan.summary)
    if (
      protect &&
      (normalize(title.value) !== normalize(plan.title) ||
        normalize(summary.value) !== normalize(plan.summary) ||
        ds.rowcount !== start + plan.rows.length ||
        !plan.rows.every((row, i) => matchesRow(start + i, row)))
    )
      return recover('품목이나 제목·개요가 보낸 내용과 달라요.')
    filled.add(plan.key)
    return { ok: true, added, gridTotal }
  } catch (e) {
    if (protect) {
      added = Math.max(added, ds.rowcount - start)
      return recover('K-에듀파인 입력 중 오류가 났어요.')
    }
    return fail(
      '채우는 중 오류가 났어요(' +
        String((e as Error)?.message ?? e) +
        '). 이번에 넣은 행은 되돌렸어요.',
      undo(),
    )
  }
}
