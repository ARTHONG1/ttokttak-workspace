import { getPath, isDataset, type DatasetLike } from './nexacro'
import type { ScreenMap } from './screen-map'
import type { UnitTable } from './units'

export type NexacroLike = { getApplication(): unknown }
/** the work screen form: an opaque page object read through ScreenMap paths */
export type WorkForm = Record<string, unknown>

export function findWorkForm(nx: NexacroLike | undefined, map: ScreenMap): WorkForm | null {
  try {
    if (!nx || typeof nx.getApplication !== 'function') return null
    const frame = getPath(nx.getApplication(), map.workFramePath) as { getActiveFrame?: () => unknown }
    if (!frame || typeof frame.getActiveFrame !== 'function') return null
    const form = getPath(frame.getActiveFrame(), map.workFormPath)
    return form && typeof form === 'object' ? (form as WorkForm) : null
  } catch {
    return null
  }
}

export type ScreenKind = { kind: 'pumui' } | { kind: 'other'; missing: string[] }

/** which 품의등록 names this screen lacks; none missing means it is the 품의등록 screen */
export function detectScreen(form: WorkForm, map: ScreenMap): ScreenKind {
  const p = map.pumui
  const checks: [string, (v: unknown) => boolean][] = [
    [p.title, (v) => !!v && typeof (v as { set_value?: unknown }).set_value === 'function'],
    [p.summary, (v) => !!v && typeof (v as { set_value?: unknown }).set_value === 'function'],
    [p.grid, (v) => !!v && typeof (v as { getBindDataset?: unknown }).getBindDataset === 'function'],
    [p.budget, isDataset],
    [p.rowAddButton, (v) => !!v],
    [p.rowAddHandler, (v) => typeof v === 'function'],
  ]
  const missing = checks.filter(([path, ok]) => !ok(getPath(form, path))).map(([path]) => path)
  return missing.length === 0 ? { kind: 'pumui' } : { kind: 'other', missing }
}

export function gridDataset(form: WorkForm, map: ScreenMap): DatasetLike | null {
  try {
    const grid = getPath(form, map.pumui.grid) as { getBindDataset?: () => unknown }
    const ds = grid?.getBindDataset?.()
    return isDataset(ds) ? ds : null
  } catch {
    return null
  }
}

/** the first visible unit table with rows, and where it was found */
export function findUnitTable(form: WorkForm, map: ScreenMap): { path: string; table: UnitTable } | null {
  const p = map.pumui
  for (const path of p.unitTables) {
    const owner = path.includes('.') ? getPath(form, path.split('.')[0]) : null
    if (owner && (owner as { visible?: unknown }).visible === false) continue
    const ds = getPath(form, path)
    if (!isDataset(ds) || ds.rowcount === 0) continue
    const table: UnitTable = []
    for (let r = 0; r < ds.rowcount; r++) {
      const code = String(ds.getColumn(r, p.unitCode) ?? '').trim()
      const name = String(ds.getColumn(r, p.unitName) ?? '').trim()
      if (code && name) table.push({ code, name })
    }
    if (table.length) return { path, table }
  }
  return null
}

export function readUnitTable(form: WorkForm, map: ScreenMap): UnitTable {
  return findUnitTable(form, map)?.table ?? []
}

