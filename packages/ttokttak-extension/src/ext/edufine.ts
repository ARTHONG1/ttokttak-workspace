/** K-에듀파인 as the page scripts see it: its app and the current 화면 이름표 */
import { findNexacro, type FrameWin } from '../sites/edufine/nexacro'
import type { NexacroLike } from '../sites/edufine/screen'
import { DEFAULT_SCREEN_MAP, type ScreenMap } from '../sites/edufine/screen-map'
import { call } from './page-channel'

/** K-에듀파인's app on this page or in a same-origin frame of it, looked up each time (it loads late) */
export const nexacro = (): NexacroLike | undefined =>
  findNexacro<NexacroLike>(window as unknown as FrameWin)

export async function edufineMap(): Promise<ScreenMap> {
  const m = (await call<ScreenMap>('map:get')) as ScreenMap | { ok: false }
  return m && (m as ScreenMap).version === 1 ? (m as ScreenMap) : DEFAULT_SCREEN_MAP
}
