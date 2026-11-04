/**
 * What crosses between a site page, the bridge and the extension background. The bridge
 * forwards only these types; everything else is dropped. The page and the background ship
 * together, so these names change freely; what the web app and the desktop app send keeps
 * its old names too (see background.ts). Nothing is set by the teacher.
 */
export const PAGE_REQUESTS = [
  'map:get',
  /** { feature }: the task's waiting work (InboxEntry) or null */
  'inbox:peek',
  /** { feature }: the task is done with its waiting work */
  'inbox:clear',
  /** { feature }: ask 똑딱작업실 (the desktop app) for the task's work (NativeReply) */
  'work:take-desktop',
  'desktop:ping',
  'web:state',
  /** { site }: the page found that site running; remember the address and tab */
  'site:seen',
  'panel:auto',
] as const
export type PageRequest = (typeof PAGE_REQUESTS)[number]

/** requests only the extension popup may make ({ site }: the remembered address or null) */
export const POPUP_REQUESTS = ['place:get'] as const

export const PAGE_TAG = '__ttokEdufine'

/** what [K-에듀파인으로 보내기] did with the browser */
export type Moved = 'focused' | 'opened' | 'unknown'

export type NativeReply =
  | { ok: true; text?: string | null; version?: string }
  | { ok: false; state: 'off' | 'missing'; reason: string }
