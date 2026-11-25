import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNoticeFeed } from '../src/main/notices'
import { activeOn, normalizeNotices, youtubeId } from '../src/shared/notices'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const PICTURE = '/__web/popup-media/0f8fad5b-d9cb-469f-a165-70867728950e.png'

const promo = (changes: Record<string, unknown> = {}) => ({
  id: 'book-1',
  enabled: true,
  title: '바로 배워서 바로 써먹는 AI 에이전트',
  text: 'Codex·Claude에 학교 업무 맡기기',
  mediaType: 'image',
  mediaUrl: PICTURE,
  linkUrl: 'https://www.yes24.com/product/goods/195612765',
  linkLabel: '책 보기',
  startsAt: '',
  endsAt: '',
  ...changes,
})

const popup = (changes: Record<string, unknown> = {}) => ({
  id: 'notice-1',
  enabled: true,
  title: '새 소식',
  body: '설명',
  mediaType: 'none',
  mediaUrl: '',
  linkUrl: '',
  linkLabel: '',
  placements: ['desktop'],
  startsAt: '',
  endsAt: '',
  ...changes,
})

describe('알림·홍보 목록 검사', () => {
  it('keeps the items that pass and leaves out the rest', () => {
    const notices = normalizeNotices({
      version: 1,
      promos: [
        promo(),
        promo({ id: 'bad-link', linkUrl: 'javascript:alert(1)' }),
        promo({ id: 'outside-picture', mediaUrl: 'https://evil.test/x.png' }),
        promo({ id: 'bad-video', mediaType: 'video', mediaUrl: 'http://example.com/a.mp4' }),
        promo({
          id: 'bad-youtube',
          mediaType: 'youtube',
          mediaUrl: 'https://evil.test/watch?v=tLxKYB8qInY',
        }),
        promo({ id: 'bad-day', endsAt: '2026/12/31' }),
        promo(),
      ],
      popups: [
        popup(),
        popup({ id: 'nowhere', placements: [] }),
        popup({ id: 'x', placements: ['desktop', 'moon'] }),
      ],
    })
    expect(notices.promos.map((p) => p.id)).toEqual(['book-1'])
    expect(notices.popups.map((p) => [p.id, p.placements])).toEqual([
      ['notice-1', ['desktop']],
      ['x', ['desktop']],
    ])
    expect(normalizeNotices({ version: 2, promos: [promo()] }).promos).toEqual([])
    expect(normalizeNotices('nonsense').popups).toEqual([])
  })

  it('shows an item only while it is on and inside its dates', () => {
    const item = { enabled: true, startsAt: '2026-12-01', endsAt: '2027-01-06' }
    expect(activeOn(item, '2026-11-30')).toBe(false)
    expect(activeOn(item, '2026-12-01')).toBe(true)
    expect(activeOn(item, '2027-01-06')).toBe(true)
    expect(activeOn(item, '2027-01-07')).toBe(false)
    expect(activeOn({ ...item, enabled: false }, '2026-12-10')).toBe(false)
    expect(youtubeId('https://youtu.be/tLxKYB8qInY')).toBe('tLxKYB8qInY')
    expect(youtubeId('https://youtube.com.evil.test/watch?v=tLxKYB8qInY')).toBeNull()
  })
})

describe('알림·홍보 목록 받기', () => {
  function server(list: unknown) {
    const calls: { url: string; tag: string | null }[] = []
    let body = JSON.stringify(list)
    let tag = '"one"'
    const fetch = (async (url: string, init?: RequestInit) => {
      const asked = new Headers(init?.headers).get('If-None-Match')
      calls.push({ url: String(url), tag: asked })
      if (String(url).endsWith('.png')) return new Response(PNG)
      if (asked === tag) return new Response(null, { status: 304 })
      return new Response(body, { headers: { etag: tag } })
    }) as typeof globalThis.fetch
    return {
      fetch,
      calls,
      change(next: unknown) {
        body = JSON.stringify(next)
        tag = '"two"'
      },
    }
  }

  it('asks once an hour, gets the list only when it changed, and keeps it for offline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'notices-'))
    const remote = server({ version: 1, promos: [promo()], popups: [popup()] })
    let clock = 0
    const listUrl = 'https://raw.example.test/notice/main/notices.json'
    const feed = createNoticeFeed({ dir, listUrl, fetch: remote.fetch, now: () => clock })

    const first = await feed.shown('2026-11-25', true)
    expect(first.promos[0]!.imageSrc).toMatch(/^data:image\/png;base64,/)
    expect(first.popups.map((p) => p.id)).toEqual(['notice-1'])
    await feed.shown('2026-11-25', true)
    expect(remote.calls.filter((c) => c.url === listUrl)).toHaveLength(1)

    // an hour on: asked with the tag, unchanged, so nothing new comes
    clock += 60 * 60 * 1000
    await feed.list()
    expect(remote.calls.filter((c) => c.url === listUrl).at(-1)!.tag).toBe('"one"')

    // the list changed: the next question brings it
    remote.change({
      version: 1,
      promos: [promo({ id: 'book-2', mediaType: 'none', mediaUrl: '' })],
      popups: [],
    })
    clock += 60 * 60 * 1000
    expect((await feed.list()).promos.map((p) => p.id)).toEqual(['book-2'])

    // a new run without the network still has the kept list and pictures
    const offline = createNoticeFeed({
      dir,
      listUrl,
      fetch: (async () => {
        throw new Error('offline')
      }) as typeof globalThis.fetch,
    })
    expect((await offline.list()).promos.map((p) => p.id)).toEqual(['book-2'])
    // only the picture of an uploaded file is read, once
    expect(remote.calls.filter((c) => c.url.endsWith('.png'))).toHaveLength(1)
  })

  it('shows nothing when turned off, and paths instead of pictures on the web edition', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'notices-'))
    const remote = server({ version: 1, promos: [promo()], popups: [popup()] })
    const off = createNoticeFeed({ dir, listUrl: '', fetch: remote.fetch })
    expect(await off.shown('2026-11-25', true)).toEqual({ popups: [], promos: [] })
    const web = createNoticeFeed({
      dir,
      listUrl: 'http://127.0.0.1:5188/__web/notices.json',
      webPictures: true,
      fetch: remote.fetch,
    })
    const shown = await web.shown('2026-11-25', false)
    expect(shown.promos[0]!.imageSrc).toBe(PICTURE)
    expect(shown.popups).toEqual([])
  })

  it('plays a YouTube video or a video file from a promo and a popup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'notices-'))
    const remote = server({
      version: 1,
      promos: [
        promo({ id: 'clip', mediaType: 'youtube', mediaUrl: 'https://youtu.be/tLxKYB8qInY' }),
        promo({ id: 'film', mediaType: 'video', mediaUrl: 'https://example.com/film.mp4' }),
      ],
      popups: [popup({ mediaType: 'video', mediaUrl: 'https://example.com/news.mp4' })],
    })
    const feed = createNoticeFeed({
      dir,
      listUrl: 'https://raw.example.test/notice/main/notices.json',
      fetch: remote.fetch,
    })
    const shown = await feed.shown('2026-11-25', true)
    expect(shown.promos.map((p) => [p.imageSrc, p.youtubeId, p.videoUrl])).toEqual([
      ['https://i.ytimg.com/vi/tLxKYB8qInY/hqdefault.jpg', 'tLxKYB8qInY', null],
      [null, null, 'https://example.com/film.mp4'],
    ])
    expect(shown.popups[0]!.videoUrl).toBe('https://example.com/news.mp4')
  })
})
