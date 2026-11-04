/**
 * Where each work site ran last in this browser (its address and tab), learned from the
 * page itself and never typed: [K-에듀파인으로 보내기] brings that tab forward.
 */
import type { SiteId } from './feature'
import type { StorageChange } from './inbox'

export interface Place {
  origin: string
  /** path only: a query can carry session values */
  path: string
  /** the tab the site ran in last */
  tabId?: number
}

export const placeKey = (site: SiteId): string => 'place:' + site

export function readPlace(value: unknown): Place | null {
  const v = value as Partial<Place> | null
  if (!v || typeof v !== 'object' || typeof v.origin !== 'string' || typeof v.path !== 'string')
    return null
  return typeof v.tabId === 'number'
    ? { origin: v.origin, path: v.path, tabId: v.tabId }
    : { origin: v.origin, path: v.path }
}

/** the keys 0.4.0 and earlier kept the K-에듀파인 address and tab under */
const OLD_PLACE = 'edufinePlace'
const OLD_TAB = 'edufineTabId'

/** the storage change that moves a 0.4.0 K-에듀파인 address and tab under place:edufine */
export function migratePlaces(stored: Record<string, unknown>): StorageChange {
  if (!(OLD_PLACE in stored) && !(OLD_TAB in stored)) return { set: {}, remove: [] }
  const old = readPlace(stored[OLD_PLACE])
  const tab = stored[OLD_TAB]
  const keep = old && !readPlace(stored[placeKey('edufine')])
  return {
    set: keep
      ? { [placeKey('edufine')]: typeof tab === 'number' ? { ...old, tabId: tab } : old }
      : {},
    remove: [OLD_PLACE, OLD_TAB],
  }
}
