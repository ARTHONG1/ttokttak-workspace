/**
 * 알림·홍보 목록: the popups and the home's promos, kept outside the app in the public
 * repository ARTHONG1/ttokttak-notice (notices.json and media/) so they change without a
 * release or a deploy. The local preview's 알림·홍보 관리 screen writes it; the desktop app and
 * the web read it. Whatever is read here is checked again: an item that does not pass is left
 * out, never shown half-checked.
 */

/** where the list and its pictures are read from */
export const NOTICE_RAW_BASE = 'https://raw.githubusercontent.com/ARTHONG1/ttokttak-notice/main/'
export const NOTICE_LIMIT = 12

/** home: the intro page (web), app: the web app, desktop: the desktop app */
export type NoticePlacement = 'home' | 'app' | 'desktop'
const PLACEMENTS: NoticePlacement[] = ['home', 'app', 'desktop']

export interface NoticePopup {
  id: string
  enabled: boolean
  title: string
  body: string
  mediaType: 'none' | 'image' | 'youtube' | 'video'
  mediaUrl: string
  linkUrl: string
  linkLabel: string
  placements: NoticePlacement[]
  /** 'YYYY-MM-DD', or '' for no limit */
  startsAt: string
  endsAt: string
}

export interface NoticePromo {
  id: string
  enabled: boolean
  title: string
  text: string
  /** an uploaded picture ('/__web/popup-media/<name>'), or '' */
  imageUrl: string
  linkUrl: string
  linkLabel: string
  startsAt: string
  endsAt: string
}

export interface Notices {
  version: 1
  popups: NoticePopup[]
  promos: NoticePromo[]
}

/** a promo as the home draws it */
export interface ShownPromo {
  id: string
  title: string
  text: string
  linkUrl: string
  linkLabel: string
  /** a data URL (desktop) or a path on the web server; null without a picture */
  imageSrc: string | null
}

/** a desktop popup as the home shows it */
export interface ShownPopup {
  id: string
  title: string
  body: string
  linkUrl: string
  linkLabel: string
  imageSrc: string | null
  youtubeId: string | null
}

export interface ShownNotices {
  popups: ShownPopup[]
  promos: ShownPromo[]
}

export const EMPTY_NOTICES: Notices = { version: 1, popups: [], promos: [] }

const UPLOADED =
  /^\/__web\/popup-media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|gif))$/
const ID = /^[a-zA-Z0-9_-]{1,80}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** the file name of a picture uploaded through the 관리 screen, or null */
export function uploadedName(url: string): string | null {
  return UPLOADED.exec(url)?.[1] ?? null
}

/** an https address without a user name or password, or null */
export function httpsUrl(value: string): string | null {
  if (!/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

/** the 11-character video id of a YouTube watch, share, Shorts or embed address */
export function youtubeId(value: string): string | null {
  const safe = httpsUrl(value)
  if (!safe) return null
  const url = new URL(safe)
  if (url.port) return null
  let id: string | null | undefined
  if (url.hostname === 'youtu.be') id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1]
  else if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
    ].includes(url.hostname)
  ) {
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : /^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1]
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

/** today on this computer's calendar, as 'YYYY-MM-DD' */
export function localDay(date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate())
}

/** turned on, and today inside its dates */
export function activeOn(
  item: { enabled: boolean; startsAt: string; endsAt: string },
  today: string,
): boolean {
  if (!item.enabled) return false
  if (item.startsAt && today < item.startsAt) return false
  return !item.endsAt || today <= item.endsAt
}

type Raw = Record<string, unknown>

function text(raw: Raw, key: string, max: number): string | null {
  const value = raw[key]
  return typeof value === 'string' && value.length <= max ? value.trim() : null
}

function day(raw: Raw, key: string): string | null {
  const value = text(raw, key, 10) ?? ''
  return value === '' || DAY.test(value) ? value : null
}

/** a link: none (both empty) or an https address with its label */
function link(raw: Raw): { linkUrl: string; linkLabel: string } | null {
  const url = text(raw, 'linkUrl', 2048)
  const label = text(raw, 'linkLabel', 80)
  if (url === null || label === null) return null
  if (!url) return { linkUrl: '', linkLabel: label }
  const safe = httpsUrl(url)
  return safe && label ? { linkUrl: safe, linkLabel: label } : null
}

function common(raw: Raw) {
  const id = text(raw, 'id', 80)
  const title = text(raw, 'title', 120)
  const startsAt = day(raw, 'startsAt')
  const endsAt = day(raw, 'endsAt')
  const linked = link(raw)
  if (!id || !ID.test(id) || typeof raw.enabled !== 'boolean') return null
  if (title === null || startsAt === null || endsAt === null || !linked) return null
  return { id, enabled: raw.enabled, title, startsAt, endsAt, ...linked }
}

function popupOf(raw: Raw): NoticePopup | null {
  const base = common(raw)
  const body = text(raw, 'body', 4000)
  const mediaType = raw.mediaType
  if (!base || body === null) return null
  if (
    mediaType !== 'none' &&
    mediaType !== 'image' &&
    mediaType !== 'youtube' &&
    mediaType !== 'video'
  )
    return null
  const mediaUrl = mediaType === 'none' ? '' : (text(raw, 'mediaUrl', 2048) ?? '')
  if (mediaType === 'image' && !uploadedName(mediaUrl) && !httpsUrl(mediaUrl)) return null
  if (mediaType === 'youtube' && !youtubeId(mediaUrl)) return null
  if (mediaType === 'video' && !httpsUrl(mediaUrl)) return null
  const placements = Array.isArray(raw.placements)
    ? PLACEMENTS.filter((p) => (raw.placements as unknown[]).includes(p))
    : []
  if (placements.length === 0) return null
  if (!base.title && !body && mediaType === 'none') return null
  return { ...base, body, mediaType, mediaUrl, placements }
}

function promoOf(raw: Raw): NoticePromo | null {
  const base = common(raw)
  const promoText = text(raw, 'text', 300)
  const imageUrl = text(raw, 'imageUrl', 200) ?? ''
  if (!base || promoText === null || !base.title) return null
  if (imageUrl && !uploadedName(imageUrl)) return null
  return { ...base, text: promoText, imageUrl }
}

function itemsOf<T extends { id: string }>(value: unknown, make: (raw: Raw) => T | null): T[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: T[] = []
  for (const raw of value.slice(0, NOTICE_LIMIT)) {
    const item = raw && typeof raw === 'object' ? make(raw as Raw) : null
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/** the list as read from outside: the items that pass, in their order; never throws */
export function normalizeNotices(raw: unknown): Notices {
  if (!raw || typeof raw !== 'object' || (raw as Raw).version !== 1) return EMPTY_NOTICES
  const value = raw as Raw
  return {
    version: 1,
    popups: itemsOf(value.popups, popupOf),
    promos: itemsOf(value.promos, promoOf),
  }
}
