/**
 * What crosses between the K-에듀파인 page, the bridge and the extension background.
 * The bridge forwards only these types; everything else is dropped.
 */
export const PAGE_REQUESTS = [
  'map:get',
  'settings:get',
  'pumui:peek-direct',
  'pumui:clear-direct',
  'pumui:take-desktop',
  'desktop:ping',
  'web:state',
] as const
export type PageRequest = (typeof PAGE_REQUESTS)[number]

/** requests only the extension popup may make */
export const POPUP_REQUESTS = [
  'settings:set',
  'origin:add',
  'origin:remove',
  'map:set',
  'map:refresh',
  'map:reset',
] as const

export const PAGE_TAG = '__ttokEdufine'

export interface Settings {
  /** off until the teacher turns it on: the first runs only preview */
  fillEnabled: boolean
  /** K-에듀파인 origins the teacher allowed, like https://klef.example.go.kr */
  origins: string[]
}

export const DEFAULT_SETTINGS: Settings = { fillEnabled: false, origins: [] }

/** a package handed over by the web app or the desktop app, waiting for the page */
export interface Pending {
  text: string
  from: 'web' | 'desktop'
  receivedAt: number
}

export type NativeReply =
  | { ok: true; text?: string | null; version?: string }
  | { ok: false; state: 'off' | 'missing'; reason: string }
