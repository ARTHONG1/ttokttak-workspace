import type { PumuiPackage } from '@genoffice/ttokttak-extension/package'
import type { ScreenMap } from '@genoffice/ttokttak-extension/screen-map'

export interface EdufineProbeInput {
  map: ScreenMap
  tryOpenMenu: boolean
}

export type EdufineProbeResult =
  | { state: 'no-app' }
  | { state: 'other-screen'; openedMenu: boolean }
  | { state: 'pumui'; ready: boolean }

/** Checks whether this frame hosts a running Nexacro K-Edufine app and optionally opens 품의등록. */
export function edufineProbe({ map, tryOpenMenu }: EdufineProbeInput): EdufineProbeResult {
  const path = (root: any, value: string): any =>
    value.split('.').reduce((cur, key) => cur?.[key], root)
  let app: any
  try {
    app = (window as any).nexacro?.getApplication?.()
  } catch {
    return { state: 'no-app' }
  }
  if (!app) return { state: 'no-app' }
  const frame = path(app, map.workFramePath)
  const form = path(frame?.getActiveFrame?.(), map.workFormPath)
  const p = map.pumui
  const ds = path(form, p.grid)?.getBindDataset?.()
  const add = path(form, p.rowAddHandler)
  const title = path(form, p.title)
  const summary = path(form, p.summary)
  const budget = path(form, p.budget)
  const isPumui = Boolean(
    form &&
    ds &&
    typeof ds.setColumn === 'function' &&
    typeof ds.getColumn === 'function' &&
    typeof ds.deleteRow === 'function' &&
    typeof add === 'function' &&
    title?.set_value &&
    summary?.set_value &&
    budget &&
    typeof budget.rowcount === 'number',
  )
  if (isPumui) {
    // This probe must remain read-only. In particular, never try the add-row handler
    // to discover whether a budget was selected: the handler can mutate the form.
    const budgetRows = Number(budget.rowcount)
    const budgetPosition = Number(budget.rowposition ?? -1)
    const budgetSelected = budgetRows > 0 && budgetPosition >= 0 && budgetPosition < budgetRows
    const unitsReady = p.unitTables.some((unitPath) => {
      const owner = unitPath.includes('.') ? path(form, unitPath.split('.')[0]) : null
      if (owner?.visible === false) return false
      const table = path(form, unitPath)
      if (!table || typeof table.getColumn !== 'function') return false
      for (let row = 0; row < Number(table.rowcount ?? 0); row++) {
        if (
          String(table.getColumn(row, p.unitCode) ?? '').trim() &&
          String(table.getColumn(row, p.unitName) ?? '').trim()
        )
          return true
      }
      return false
    })
    return { state: 'pumui', ready: budgetSelected && unitsReady }
  }
  let openedMenu = false
  if (tryOpenMenu && map.menu && /^[A-Za-z0-9_]{1,40}$/.test(map.menu.pumuiMenuId)) {
    try {
      const opener = path(app, map.menu.openerPath)
      const fn = opener?.[map.menu.openFn]
      const menus = path(app, map.menu.menuList)
      const ready = !menus || typeof menus.rowcount !== 'number' || menus.rowcount > 0
      if (typeof fn === 'function' && ready) {
        fn.call(opener, map.menu.pumuiMenuId)
        openedMenu = true
      }
    } catch {
      openedMenu = false
    }
  }
  return { state: 'other-screen', openedMenu }
}

export interface EdufinePageInput {
  map: ScreenMap
  pkg: PumuiPackage
  unitAliases: Readonly<Record<string, readonly string[]>>
}

/** Runs in the Nexacro page's main world. It only edits the bound form dataset. */
export function edufinePage({
  map,
  pkg,
  unitAliases,
}: EdufinePageInput): { ok: true; written: number; next: number } | { ok: false; reason: string } {
  const path = (root: any, value: string): any =>
    value.split('.').reduce((cur, key) => cur?.[key], root)
  const normText = (value: unknown): string => String(value ?? '').replace(/\r\n/g, '\n')
  const app = (window as any).nexacro?.getApplication?.()
  if (!app) return { ok: false, reason: 'K-에듀파인 화면의 프로그램 객체를 찾지 못했어요.' }
  const frame = path(app, map.workFramePath)
  const form = path(frame?.getActiveFrame?.(), map.workFormPath)
  const p = map.pumui
  const grid = path(form, p.grid)
  const ds = grid?.getBindDataset?.()
  const add = path(form, p.rowAddHandler)
  const button = path(form, p.rowAddButton)
  const title = path(form, p.title)
  const summary = path(form, p.summary)
  const budget = path(form, p.budget)
  if (
    !form ||
    !ds ||
    typeof ds.setColumn !== 'function' ||
    typeof ds.getColumn !== 'function' ||
    typeof ds.deleteRow !== 'function' ||
    typeof add !== 'function' ||
    !title?.set_value ||
    !summary?.set_value
  )
    return { ok: false, reason: 'K-에듀파인 품의등록 화면을 열어 주세요.' }
  const budgetRows = Number(budget?.rowcount ?? 0)
  const budgetPosition = Number(budget?.rowposition ?? -1)
  if (budgetRows <= 0 || budgetPosition < 0 || budgetPosition >= budgetRows)
    return { ok: false, reason: '예산 내역에서 사용할 예산 줄을 먼저 선택해 주세요.' }
  const units: { code: string; name: string }[] = []
  for (const unitPath of p.unitTables) {
    const owner = unitPath.includes('.') ? path(form, unitPath.split('.')[0]) : null
    if (owner?.visible === false) continue
    const table = path(form, unitPath)
    if (!table || typeof table.getColumn !== 'function') continue
    for (let row = 0; row < Number(table.rowcount ?? 0); row++) {
      const code = String(table.getColumn(row, p.unitCode) ?? '').trim()
      const name = String(table.getColumn(row, p.unitName) ?? '').trim()
      if (code && name) units.push({ code, name })
    }
    if (units.length) break
  }
  if (!units.length)
    return { ok: false, reason: '단위 목록을 읽지 못했어요. 물품·용역 구분을 먼저 골라 주세요.' }
  const unit = (wanted: string): string | undefined => {
    const norm = (value: string) => value.replace(/\s/g, '').toUpperCase()
    const w = norm(wanted)
    for (const name of [w, ...(unitAliases[w] ?? [])]) {
      const code = units.find((u) => norm(u.name) === name)?.code
      if (code) return code
    }
    return undefined
  }
  const start = Number(ds.rowcount ?? 0)
  const oldTitle = typeof title.value === 'string' ? title.value : ''
  const oldSummary = typeof summary.value === 'string' ? summary.value : ''
  if (
    (oldTitle && normText(oldTitle) !== normText(pkg.title)) ||
    (oldSummary && normText(oldSummary) !== normText(pkg.summary))
  )
    return {
      ok: false,
      reason: '화면에 다른 제목이나 개요가 있어요. 새 품의등록 화면에서 보내 주세요.',
    }
  const codes = pkg.items.map((item) => unit(item.unit))
  if (codes.some((code) => !code))
    return { ok: false, reason: '품목 단위를 화면에서 찾지 못했어요. 단위를 확인해 주세요.' }
  // Detect retries even after the desktop app reconnects to this still-open form.
  const c = p.columns
  for (let begin = 0; begin <= start - pkg.items.length; begin++) {
    if (
      pkg.items.every(
        (item, i) =>
          String(ds.getColumn(begin + i, c.name) ?? '') === item.description &&
          String(ds.getColumn(begin + i, c.spec) ?? '') === item.specification &&
          String(ds.getColumn(begin + i, c.unit) ?? '') === codes[i] &&
          Number(ds.getColumn(begin + i, c.qty)) === item.quantity &&
          Number(ds.getColumn(begin + i, c.price)) === item.unitPrice,
      )
    )
      return { ok: false, reason: '같은 품목 내역이 이미 화면에 있어요. 중복 입력하지 않았어요.' }
  }
  let added = 0
  let headingChanged = false
  const fail = (reason: string): { ok: false; reason: string } => {
    try {
      for (let row = Number(ds.rowcount ?? 0) - 1; row >= start; row--) ds.deleteRow(row)
      if (headingChanged) {
        title.set_value(oldTitle)
        summary.set_value(oldSummary)
      }
      if (
        Number(ds.rowcount) !== start ||
        (typeof title.value === 'string' && normText(title.value) !== normText(oldTitle)) ||
        (typeof summary.value === 'string' && normText(summary.value) !== normText(oldSummary))
      )
        throw new Error('rollback failed')
      return { ok: false, reason: reason + ' 이번 입력은 되돌렸어요.' }
    } catch {
      return {
        ok: false,
        reason: reason + ' 일부 입력을 되돌리지 못했어요. 화면을 확인하고 직접 복구해 주세요.',
      }
    }
  }
  try {
    for (const [index, item] of pkg.items.entries()) {
      const code = codes[index]!
      const before = Number(ds.rowcount ?? 0)
      add.call(form, button, {})
      if (Number(ds.rowcount ?? 0) !== before + 1) {
        if (added === 0) return { ok: false, reason: '예산 내역에서 예산 줄을 먼저 골라 주세요.' }
        return fail(`${index + 1}번째 품목 행을 추가하지 못했어요.`)
      }
      const row = Number(ds.rowcount) - 1
      const c = p.columns
      ds.setColumn(row, c.name, item.description)
      ds.setColumn(row, c.spec, item.specification)
      ds.setColumn(row, c.unit, code)
      ds.setColumn(row, c.qty, item.quantity)
      ds.setColumn(row, c.price, item.unitPrice)
      if (
        String(ds.getColumn(row, c.name)) !== item.description ||
        String(ds.getColumn(row, c.spec) ?? '') !== item.specification ||
        String(ds.getColumn(row, c.unit)) !== code ||
        Number(ds.getColumn(row, c.qty)) !== item.quantity ||
        Number(ds.getColumn(row, c.price)) !== item.unitPrice
      ) {
        return fail(`${index + 1}번째 품목의 입력값을 화면에서 다시 확인하지 못했어요.`)
      }
      added++
    }
    let total = 0
    for (let row = start; row < Number(ds.rowcount); row++)
      total += Math.round(
        Number(ds.getColumn(row, p.columns.qty)) * Number(ds.getColumn(row, p.columns.price)),
      )
    if (total !== Number(pkg.total)) return fail('화면에 들어간 금액 합계가 품의 합계와 달라요.')
    headingChanged = true
    title.set_value(pkg.title)
    summary.set_value(pkg.summary)
    if (
      (typeof title.value === 'string' && normText(title.value) !== normText(pkg.title)) ||
      (typeof summary.value === 'string' && normText(summary.value) !== normText(pkg.summary))
    )
      return fail('제목과 개요를 화면에서 다시 확인하지 못했어요.')
    return { ok: true, written: added, next: added }
  } catch {
    return fail('K-에듀파인 입력 중 오류가 났어요.')
  }
}
