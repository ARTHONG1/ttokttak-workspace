/**
 * 화면 이름표: every K-에듀파인 name the extension relies on, kept as data so a
 * different 교육청 or a new K-에듀파인 version is fixed by a new table (fetched from the
 * web app or loaded from a file) instead of a new extension release. Paths are
 * dot-separated and start at the work screen form (see workFormPath).
 * Source: docs/KEDUFINE_INTERFACE_NOTES.md (K-에듀파인's own names).
 */

export interface ScreenMap {
  /** format version of this table */
  version: 1
  /** which table this is, shown in the self-check and diagnostics */
  revision: string
  /** from nexacro.getApplication() to the work frame that has getActiveFrame() */
  workFramePath: string
  /** from the active frame to the work screen form */
  workFormPath: string
  pumui: {
    title: string
    summary: string
    grid: string
    budget: string
    rowAddButton: string
    rowAddHandler: string
    /** candidate unit tables, first visible one with rows wins */
    unitTables: string[]
    unitCode: string
    unitName: string
    columns: { name: string; spec: string; unit: string; qty: string; price: string }
  }
  /**
   * How K-에듀파인 opens a menu, so the 똑딱 button can bring up the 품의등록 screen from any
   * other screen. Optional: a table without it only asks the teacher to open the screen.
   * Paths start at nexacro.getApplication().
   */
  menu?: {
    /** the form that has the menu-opening function */
    openerPath: string
    openFn: string
    /** K-에듀파인's menu list; opening waits until it has rows */
    menuList: string
    /** the 품의등록 menu */
    pumuiMenuId: string
  }
}

export const DEFAULT_SCREEN_MAP: ScreenMap = {
  version: 1,
  revision: '2026-11-04 기본',
  workFramePath: 'mainframe.MainVFrameSet.SubHFrameSet.WorkVFrameSet.WorkFrame',
  workFormPath: 'form.divWork.form',
  pumui: {
    title: 'divMain.form.edtCnsulSj',
    summary: 'divMain.form.txtareaCnsulSumrCn',
    grid: 'grdPrdlstDtl',
    budget: 'dsBgtDtlList',
    rowAddButton: 'divAuth2.form.btnRowAdit',
    rowAddHandler: 'divAuth2_btnRowAdit_onclick',
    unitTables: ['divThng.form.dsEAB0005200', 'divServc.form.dsEAB0005200', 'dsEAB0005200'],
    unitCode: 'cmmnDetailCd',
    unitName: 'cmmnDetailCdNm',
    columns: {
      name: 'prdlstCn',
      spec: 'stndrd',
      unit: 'thngUnitSeCd',
      qty: 'qty',
      price: 'expectUntpc',
    },
  },
  menu: {
    openerPath: 'mainframe.MainVFrameSet.SubHFrameSet.LeftFrame.form',
    openFn: 'gfnOpenMenu',
    menuList: 'gdsMenu',
    pumuiMenuId: 'A00FAA0104001001',
  },
}

const isPath = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_$]+(\.[A-Za-z0-9_$]+)*$/.test(v)

/** a 화면 이름표 from a file or the web app; null when it is not one this version reads */
export function parseScreenMap(text: string): ScreenMap | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const m = raw as ScreenMap
  if (!m || m.version !== 1 || typeof m.revision !== 'string') return null
  const p = m.pumui
  if (!p || typeof p !== 'object') return null
  const paths = [
    m.workFramePath,
    m.workFormPath,
    p.title,
    p.summary,
    p.grid,
    p.budget,
    p.rowAddButton,
    p.rowAddHandler,
    p.unitCode,
    p.unitName,
    ...(Array.isArray(p.unitTables) ? p.unitTables : [null]),
    ...(p.columns ? Object.values(p.columns) : [null]),
  ]
  if (!paths.every(isPath) || !p.columns || Object.keys(p.columns).length !== 5) return null
  if (m.menu !== undefined) {
    const u = m.menu
    if (!u || ![u.openerPath, u.openFn, u.menuList, u.pumuiMenuId].every(isPath)) return null
  }
  return m
}
