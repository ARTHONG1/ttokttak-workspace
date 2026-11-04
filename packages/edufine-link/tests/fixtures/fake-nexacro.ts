/**
 * A stand-in for the K-에듀파인 page objects, built from a list of object paths so it can
 * come from the default 화면 이름표 or from a field diagnostic file. Datasets follow the
 * public Nexacro Dataset behaviour (addRow returns the new row index, rowcount,
 * getColumn, setColumn, deleteRow). Every write is logged; calling a save or approval
 * function is logged as FORBIDDEN.
 */
import type { FakeObject, FakeRow as Row, FakeSpec } from '../../src/fake-spec'
import type { ScreenMap } from '../../src/screen-map'

export type { FakeObject, FakeSpec }
export type Write = { op: string; target: string; args: unknown[] }

export class FakeDataset {
  rows: Row[]
  /** the current row, as a Nexacro grid bound to the dataset moves it */
  rowposition = 0
  constructor(
    readonly name: string,
    readonly columns: string[],
    rows: Row[],
    private readonly log: Write[],
  ) {
    this.rows = rows.map((r) => ({ ...r }))
  }
  get rowcount(): number {
    return this.rows.length
  }
  getColCount(): number {
    return this.columns.length
  }
  getColID(index: number): string | undefined {
    return this.columns[index]
  }
  getColumn(row: number, col: string): unknown {
    return this.rows[row]?.[col]
  }
  setColumn(row: number, col: string, value: unknown): boolean {
    this.log.push({ op: 'setColumn', target: this.name, args: [row, col, value] })
    if (!this.rows[row]) return false
    this.rows[row][col] = value
    return true
  }
  addRow(): number {
    this.log.push({ op: 'addRow', target: this.name, args: [] })
    this.rows.push({})
    return this.rows.length - 1
  }
  deleteRow(row: number): boolean {
    this.log.push({ op: 'deleteRow', target: this.name, args: [row] })
    if (!this.rows[row]) return false
    this.rows.splice(row, 1)
    return true
  }
}

function place(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur = root
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  const last = keys[keys.length - 1]
  if (cur[last] && typeof cur[last] === 'object' && value && typeof value === 'object') {
    Object.assign(value as object, cur[last] as object)
  }
  cur[last] = value
}

export function makeFakeEdufine(spec: FakeSpec) {
  const writes: Write[] = []
  const form: Record<string, unknown> = {}
  const datasets = new Map<string, FakeDataset>()
  for (const o of spec.objects)
    if (o.kind === 'div') place(form, o.path, { visible: o.visible ?? true })
  for (const o of spec.objects) {
    if (o.kind === 'dataset') {
      const ds = new FakeDataset(o.path, o.columns, o.rows ?? [], writes)
      datasets.set(o.path, ds)
      place(form, o.path, ds)
    }
  }
  let addCalls = 0
  // K-에듀파인 adds a 품목 row only under a chosen budget line
  const budget = datasets.get(spec.map.pumui.budget)
  if (budget) budget.rowposition = spec.budgetSelected === false ? -1 : 0
  for (const o of spec.objects) {
    if (o.kind === 'edit') {
      const edit = {
        value: '',
        set_value(v: unknown) {
          writes.push({ op: 'set_value', target: o.path, args: [v] })
          edit.value = String(v)
        },
      }
      place(form, o.path, edit)
    } else if (o.kind === 'grid') {
      place(form, o.path, { getBindDataset: () => datasets.get(o.bind) })
    } else if (o.kind === 'button') {
      place(form, o.path, { name: o.path })
    } else if (o.kind === 'function') {
      const fn = (...args: unknown[]) => {
        if (o.behavior === 'forbidden') {
          writes.push({ op: 'FORBIDDEN', target: o.path, args })
          return
        }
        if (o.behavior !== 'row-add') return
        addCalls++
        writes.push({ op: 'call', target: o.path, args: [] })
        const target = spec.rowAddTarget ? datasets.get(spec.rowAddTarget) : undefined
        if (!target || !spec.budgetSelected) return
        if (spec.failAddAt && addCalls === spec.failAddAt) return
        target.addRow()
      }
      place(form, o.path, fn)
    }
  }
  const map = spec.map
  const activeFrame: Record<string, unknown> = {}
  place(activeFrame, map.workFormPath, form)
  // another screen in front (결재 대기 and the like) until the 품의등록 menu opens
  const otherFrame: Record<string, unknown> = {}
  place(otherFrame, map.workFormPath, {})
  let current = spec.startOn === 'other' ? otherFrame : activeFrame
  const app: Record<string, unknown> = {}
  place(app, map.workFramePath, {
    getActiveFrame: () => (spec.frame === 'active' ? current : null),
  })
  if (map.menu) {
    const menu = map.menu
    place(app, menu.openerPath, {
      [menu.openFn]: (id: string) => {
        writes.push({ op: 'openMenu', target: id, args: [] })
        if (id === menu.pumuiMenuId) setTimeout(() => (current = activeFrame), 300)
      },
    })
    place(
      app,
      menu.menuList,
      new FakeDataset(menu.menuList, ['menuId'], [{ menuId: menu.pumuiMenuId }], writes),
    )
  }
  const nx = { getApplication: () => app }
  return {
    nx,
    form,
    writes,
    dataset: (path: string) => datasets.get(path),
    forbiddenCalls: () => writes.filter((w) => w.op === 'FORBIDDEN').length,
    /** the teacher picks the first budget line */
    selectBudget: () => {
      spec.budgetSelected = true
      if (budget) budget.rowposition = 0
    },
  }
}

export const UNIT_ROWS: Row[] = [
  { cmmnDetailCd: '001', cmmnDetailCdNm: '개' },
  { cmmnDetailCd: '002', cmmnDetailCdNm: '명' },
  { cmmnDetailCd: '010', cmmnDetailCdNm: '상자' },
  { cmmnDetailCd: '017', cmmnDetailCdNm: 'SET' },
  { cmmnDetailCd: '020', cmmnDetailCdNm: '식' },
]

/** the 품의등록 screen as the 화면 이름표 describes it, plus save/approval buttons */
export function pumuiScreen(
  map: ScreenMap,
  opts: {
    budgetSelected?: boolean
    existingRows?: Row[]
    failAddAt?: number
    unitDiv?: 'divThng' | 'divServc'
    startOn?: 'pumui' | 'other'
  } = {},
): FakeSpec {
  const p = map.pumui
  const c = p.columns
  const unitDiv = opts.unitDiv ?? 'divThng'
  return {
    frame: 'active',
    map,
    budgetSelected: opts.budgetSelected ?? true,
    failAddAt: opts.failAddAt,
    startOn: opts.startOn,
    rowAddTarget: 'dsPrdlstDtl',
    objects: [
      { path: p.title, kind: 'edit' },
      { path: p.summary, kind: 'edit' },
      {
        path: 'dsPrdlstDtl',
        kind: 'dataset',
        columns: Object.values(c),
        rows: opts.existingRows ?? [],
      },
      { path: p.grid, kind: 'grid', bind: 'dsPrdlstDtl' },
      {
        path: p.budget,
        kind: 'dataset',
        columns: ['detlBsnsNm', 'detlIem', 'cptDtl', 'dmndAmt'],
        rows: [
          { detlBsnsNm: '과학교육', detlIem: '일반수용비', cptDtl: '실험도구', dmndAmt: 300000 },
        ],
      },
      { path: p.rowAddButton, kind: 'button' },
      { path: p.rowAddHandler, kind: 'function', behavior: 'row-add' },
      { path: 'divThng', kind: 'div', visible: unitDiv === 'divThng' },
      { path: 'divServc', kind: 'div', visible: unitDiv === 'divServc' },
      {
        path: unitDiv + '.form.dsEAB0005200',
        kind: 'dataset',
        columns: [p.unitCode, p.unitName],
        rows: UNIT_ROWS,
      },
      { path: 'divAuth0_btnAuthC03_onclick', kind: 'function', behavior: 'forbidden' },
      { path: 'fnSave', kind: 'function', behavior: 'forbidden' },
      { path: 'gfnTransaction', kind: 'function', behavior: 'forbidden' },
    ],
  }
}

/** the 원인행위 screen: a different form without the 품의등록 objects */
export function causeScreen(map: ScreenMap): FakeSpec {
  return {
    frame: 'active',
    map,
    objects: [
      { path: 'dsMain', kind: 'dataset', columns: ['sj', 'causeActionPurpsCn'] },
      { path: 'divMain.form.btnCntrctRegist', kind: 'button' },
      { path: 'fnSave', kind: 'function', behavior: 'forbidden' },
    ],
  }
}
