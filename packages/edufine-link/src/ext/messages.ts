/**
 * What crosses between the K-에듀파인 page, the bridge and the extension background.
 * The bridge forwards only these types; everything else is dropped. Nothing is set by
 * the teacher: the K-에듀파인 addresses (https://*.go.kr) are granted at install, filling
 * is always offered after the preview, and the 화면 이름표 updates itself.
 */
export const PAGE_REQUESTS = [
  'map:get',
  'pumui:peek-direct',
  'pumui:clear-direct',
  'pumui:take-desktop',
  'desktop:ping',
  'web:state',
] as const
export type PageRequest = (typeof PAGE_REQUESTS)[number]

export const PAGE_TAG = '__ttokEdufine'

/** a package handed over by the web app or the desktop app, waiting for the page */
export interface Pending {
  text: string
  from: 'web' | 'desktop'
  receivedAt: number
}

export type NativeReply =
  | { ok: true; text?: string | null; version?: string }
  | { ok: false; state: 'off' | 'missing'; reason: string }
