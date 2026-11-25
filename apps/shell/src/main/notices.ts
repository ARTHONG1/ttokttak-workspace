import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EMPTY_NOTICES,
  activeOn,
  normalizeNotices,
  uploadedName,
  youtubeId,
  type Notices,
  type NoticeMediaType,
  type ShownNotices,
} from '../shared/notices'

/**
 * Reads the 알림·홍보 목록 (shared/notices.ts) for the home. It asks at most once an hour
 * whether the list changed (an ETag question: an unchanged list answers 304 with no body),
 * keeps the last list and its pictures in a folder so the home has them offline, and never
 * lets a slow or broken answer hold the home: it falls back to what it kept.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000
const TIMEOUT_MS = 5000
const MAX_LIST_BYTES = 256 * 1024
const MAX_PICTURE_BYTES = 8 * 1024 * 1024

const PICTURE_TYPES: Record<string, { mime: string; matches: (b: Uint8Array) => boolean }> = {
  png: {
    mime: 'image/png',
    matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  jpg: { mime: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  gif: {
    mime: 'image/gif',
    matches: (b) => String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === 'GIF8',
  },
  webp: {
    mime: 'image/webp',
    matches: (b) =>
      String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === 'RIFF' &&
      String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!) === 'WEBP',
  },
}

export interface NoticeFeedOptions {
  /** where the last list and pictures are kept */
  dir: string
  /** notices.json; '' turns the list off (the e2e tests) */
  listUrl: string
  /**
   * the web edition: the page loads pictures from the web server (/__web/popup-media/…),
   * so they are not read here
   */
  webPictures?: boolean
  fetch?: typeof fetch
  now?: () => number
}

async function fetchWithin(
  get: typeof fetch,
  url: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS)
  try {
    return await get(url, { headers, signal: stop.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

async function writeAtomically(file: string, data: string | Uint8Array): Promise<void> {
  const temp = file + '.' + process.pid + '.tmp'
  await writeFile(temp, data)
  await rename(temp, file)
}

export function createNoticeFeed(options: NoticeFeedOptions) {
  const get = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const listFile = join(options.dir, 'notices.json')
  const tagFile = join(options.dir, 'notices.etag')
  const mediaDir = join(options.dir, 'media')
  let current: Notices | null = null
  let checkedAt = 0
  let checking: Promise<Notices> | null = null

  async function kept(): Promise<Notices> {
    try {
      return normalizeNotices(JSON.parse(await readFile(listFile, 'utf8')))
    } catch {
      return EMPTY_NOTICES
    }
  }

  async function check(): Promise<Notices> {
    const before = await kept()
    const tag = await readFile(tagFile, 'utf8').catch(() => '')
    try {
      const answer = await fetchWithin(get, options.listUrl, tag ? { 'If-None-Match': tag } : {})
      if (answer.status === 304 || !answer.ok) return before
      const body = await answer.text()
      if (body.length > MAX_LIST_BYTES) return before
      const notices = normalizeNotices(JSON.parse(body))
      await mkdir(options.dir, { recursive: true })
      await writeAtomically(listFile, JSON.stringify(notices))
      await writeAtomically(tagFile, answer.headers.get('etag') ?? '')
      return notices
    } catch (err) {
      console.warn('[notices] could not check the list', err instanceof Error ? err.message : err)
      return before
    }
  }

  /** the list: the kept one, asked again when an hour has passed */
  async function list(): Promise<Notices> {
    if (!options.listUrl) return EMPTY_NOTICES
    if (current && now() - checkedAt < CHECK_EVERY_MS) return current
    checking ??= check()
      .then((notices) => {
        current = notices
        checkedAt = now()
        return notices
      })
      .finally(() => {
        checking = null
      })
    return checking
  }

  /** an uploaded picture for the page: a data URL here, a path on the web edition */
  async function picture(url: string): Promise<string | null> {
    const name = uploadedName(url)
    if (!name) return null
    if (options.webPictures) return '/__web/popup-media/' + name
    const type = PICTURE_TYPES[name.slice(name.lastIndexOf('.') + 1)]!
    const file = join(mediaDir, name)
    let bytes: Uint8Array | null = await readFile(file).catch(() => null)
    if (!bytes) {
      try {
        const answer = await fetchWithin(get, new URL('media/' + name, options.listUrl).href)
        if (!answer.ok) return null
        const fetched = new Uint8Array(await answer.arrayBuffer())
        if (fetched.length === 0 || fetched.length > MAX_PICTURE_BYTES || !type.matches(fetched))
          return null
        await mkdir(mediaDir, { recursive: true })
        await writeAtomically(file, fetched)
        bytes = fetched
      } catch {
        return null
      }
    }
    return 'data:' + type.mime + ';base64,' + Buffer.from(bytes).toString('base64')
  }

  /** what an item shows: its uploaded picture, or the video it plays */
  async function media(item: { mediaType: NoticeMediaType; mediaUrl: string }) {
    return {
      imageSrc: item.mediaType === 'image' ? await picture(item.mediaUrl) : null,
      youtubeId: item.mediaType === 'youtube' ? youtubeId(item.mediaUrl) : null,
      videoUrl: item.mediaType === 'video' ? item.mediaUrl : null,
    }
  }

  /** what the home shows today: the promos, and the popups for the desktop app */
  async function shown(today: string, withPopups: boolean): Promise<ShownNotices> {
    const notices = await list()
    const promos = await Promise.all(
      notices.promos
        .filter((promo) => activeOn(promo, today))
        .map(async (promo) => {
          const shownMedia = await media(promo)
          return {
            id: promo.id,
            title: promo.title,
            text: promo.text,
            linkUrl: promo.linkUrl,
            linkLabel: promo.linkLabel,
            ...shownMedia,
            // a YouTube promo's card shows the video's thumbnail
            imageSrc: shownMedia.youtubeId
              ? 'https://i.ytimg.com/vi/' + shownMedia.youtubeId + '/hqdefault.jpg'
              : shownMedia.imageSrc,
          }
        }),
    )
    const popups = withPopups
      ? await Promise.all(
          notices.popups
            .filter((popup) => activeOn(popup, today) && popup.placements.includes('desktop'))
            .map(async (popup) => ({
              id: popup.id,
              title: popup.title,
              body: popup.body,
              linkUrl: popup.linkUrl,
              linkLabel: popup.linkLabel,
              ...(await media(popup)),
            })),
        )
      : []
    return { popups, promos }
  }

  return { list, shown }
}
