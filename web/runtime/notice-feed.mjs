import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeNotices } from './popup-store.mjs'

// The web server's copy of the 알림·홍보 목록 (popup-store.mjs). On Cloud Run it asks the
// public repository only when someone visits and at most every 5 minutes, with an ETag (an
// unchanged list answers 304 with no body), and keeps the last good list when GitHub is slow
// or a list does not pass. The local preview reads the checked-out repository instead, so a
// saved draft shows before 게시하기.

export const NOTICE_RAW_BASE = 'https://raw.githubusercontent.com/ARTHONG1/ttokttak-notice/main/'
const TTL_MS = 5 * 60 * 1000
const TIMEOUT_MS = 5000
const MAX_LIST_BYTES = 256 * 1024
const MAX_PICTURE_BYTES = 8 * 1024 * 1024
const MAX_PICTURES = 48
const PICTURE = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/
const EMPTY = { version: 1, popups: [], promos: [] }

export function createNoticeFeed({
  repoDir,
  base = NOTICE_RAW_BASE,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  let kept = null
  let asking = null
  const pictures = new Map()

  async function within(url, headers = {}) {
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), TIMEOUT_MS)
    try {
      return await fetchImpl(url, { headers, signal: stop.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  async function ask() {
    try {
      const answer = await within(
        base + 'notices.json',
        kept?.etag ? { 'If-None-Match': kept.etag } : {},
      )
      if (answer.status === 304 && kept) {
        kept.at = now()
        return kept.data
      }
      if (!answer.ok) throw new Error('status ' + answer.status)
      const body = await answer.text()
      if (body.length > MAX_LIST_BYTES) throw new Error('the list is too big')
      const data = normalizeNotices(JSON.parse(body))
      kept = { data, etag: answer.headers.get('etag') || '', at: now() }
      return data
    } catch (err) {
      console.warn('[notices] kept the last list:', err.message)
      // ask again after the 5 minutes, not on every visit
      kept = { data: kept?.data ?? EMPTY, etag: kept?.etag ?? '', at: now() }
      return kept.data
    }
  }

  async function list() {
    if (repoDir) {
      try {
        return normalizeNotices(JSON.parse(await readFile(join(repoDir, 'notices.json'), 'utf8')))
      } catch {
        return EMPTY
      }
    }
    if (kept && now() - kept.at < TTL_MS) return kept.data
    asking ??= ask().finally(() => {
      asking = null
    })
    return asking
  }

  /** an uploaded picture's bytes, or null */
  async function picture(name) {
    if (!PICTURE.test(name)) return null
    if (repoDir) return readFile(join(repoDir, 'media', name)).catch(() => null)
    if (pictures.has(name)) return pictures.get(name)
    try {
      const answer = await within(base + 'media/' + name)
      if (!answer.ok) return null
      const bytes = Buffer.from(await answer.arrayBuffer())
      if (bytes.length === 0 || bytes.length > MAX_PICTURE_BYTES) return null
      if (pictures.size >= MAX_PICTURES) pictures.delete(pictures.keys().next().value)
      pictures.set(name, bytes)
      return bytes
    } catch {
      return null
    }
  }

  return { list, picture }
}
