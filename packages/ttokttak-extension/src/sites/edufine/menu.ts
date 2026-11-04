/**
 * Opening a K-에듀파인 screen (for 에듀파인 품의, 품의등록) the way K-에듀파인 itself opens a
 * menu: its own menu function from the 화면 이름표 and the task's menu ID. It only opens a
 * screen: nothing is filled, saved or sent. Never throws: a K-에듀파인 that does not look as
 * expected is left alone.
 */
import { getPath, isDataset } from './nexacro'
import type { NexacroLike } from './screen'
import type { ScreenMap } from './screen-map'

export type MenuOpen = 'opened' | 'not-ready' | 'unavailable'

export function openMenu(
  nx: NexacroLike | undefined,
  map: ScreenMap,
  menuId: string | undefined,
): MenuOpen {
  const m = map.menu
  if (!m || !nx || typeof nx.getApplication !== 'function') return 'unavailable'
  if (!menuId || !/^[A-Za-z0-9_]{1,40}$/.test(menuId)) return 'unavailable'
  try {
    const app = nx.getApplication()
    const opener = getPath(app, m.openerPath) as Record<string, unknown> | undefined
    const fn = opener?.[m.openFn]
    if (typeof fn !== 'function') return 'unavailable'
    // right after login the menu list is still loading and a menu opened then goes nowhere
    const menus = getPath(app, m.menuList)
    if (isDataset(menus) && menus.rowcount === 0) return 'not-ready'
    fn.call(opener, menuId)
    return 'opened'
  } catch {
    return 'unavailable'
  }
}
