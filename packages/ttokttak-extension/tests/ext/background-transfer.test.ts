import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRecordPackage } from '../../src/features/neis-record/package'

const origin = 'https://hangul-ai-workbench-ehhtyai22q-du.a.run.app'
const feature = 'neis-record'
const inboxKey = 'inbox:' + feature
const url = 'https://example.neis.go.kr/input'
const sender = (documentId: string, tabId = 2, frameId = 1) => ({
  documentId,
  frameId,
  url,
  tab: { id: tabId },
})
const popup = { url: 'chrome-extension://extension-id/popup.html' }
const text = (value: string) =>
  JSON.stringify(
    buildRecordPackage({
      mode: 'subject',
      title: '세특',
      students: [{ name: '김하늘', text: value }],
    }),
  )
type Listener = (msg: object, sender: object, done: (value: any) => void) => void
let page: Listener
let external: Listener
let tabRemoved: (tabId: number) => void
let storage: Map<string, unknown>

const call = (type: string, payload: object = {}, from: object = sender('frame-a')) =>
  new Promise<any>((done) => page({ type, payload: { feature, ...payload } }, from, done))
const send = (value: string) =>
  new Promise<any>((done) =>
    external({ type: 'work:send', feature, text: value }, { origin, tab: { id: 1 } }, done),
  )
const candidate = (id: string, from = sender('frame-a')) =>
  call('transfer:candidate', { id, state: 'ready' }, from)

beforeEach(async () => {
  storage = new Map()
  vi.resetModules()
  vi.spyOn(Date, 'now').mockReturnValue(10_000)
  vi.stubGlobal('__DEV__', false)
  vi.stubGlobal('__VERSION__', 'test')
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension-id',
      onMessage: {
        addListener: (fn: Listener) => {
          page = fn
        },
      },
      onMessageExternal: {
        addListener: (fn: Listener) => {
          external = fn
        },
      },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    tabs: {
      get: async (id: number) => ({ id, url, windowId: 1 }),
      update: async () => ({}),
      sendMessage: async () => ({}),
      onRemoved: {
        addListener: (fn: typeof tabRemoved) => {
          tabRemoved = fn
        },
      },
    },
    windows: { update: async () => ({}) },
    storage: {
      local: {
        get: async (key: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(key) ? key : [key])
              .filter((k) => storage.has(k))
              .map((k) => [k, structuredClone(storage.get(k))]),
          ),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) storage.set(key, structuredClone(value))
        },
        remove: async (key: string | string[]) => {
          for (const k of Array.isArray(key) ? key : [key]) storage.delete(k)
        },
      },
    },
  })
  await import('../../src/ext/background')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('automatic web sends', () => {
  it('waits without a remembered address and hands work to only one live document', async () => {
    expect(await send(text('기록함.'))).toMatchObject({ ok: true, moved: 'unknown' })
    const { id } = await call('transfer:status')
    expect(
      await call('transfer:status', {}, { ...sender('outside'), url: 'https://other.go.kr' }),
    ).toBeNull()
    expect(await call('inbox:peek')).toBeNull()
    expect(await candidate(id)).toMatchObject({ state: 'waiting' })
    expect(await candidate(id, sender('frame-b', 2, 2))).toMatchObject({ state: 'ambiguous' })
    vi.mocked(Date.now).mockReturnValue(14_000)
    await candidate(id)
    vi.mocked(Date.now).mockReturnValue(15_100)
    const [a, b] = await Promise.all([candidate(id), candidate(id, sender('frame-b', 2, 2))])
    expect([a, b].filter((r) => r.state === 'claimed')).toHaveLength(1)
    expect(
      await call('transfer:end', { id, success: true }, sender('frame-b', 2, 2)),
    ).toMatchObject({ ok: false })
    expect(await call('transfer:end', { id, success: true })).toMatchObject({ ok: true })
    expect(storage.has(inboxKey)).toBe(false)
  })

  it('cancels before a delayed frame can claim and keeps the manual copy', async () => {
    await send(text('취소할 기록.'))
    const { id } = await call('transfer:status', {}, popup)
    await candidate(id)
    expect(await call('transfer:cancel', { id }, popup)).toMatchObject({ ok: true })
    vi.mocked(Date.now).mockReturnValue(12_000)
    expect(await candidate(id)).toMatchObject({ state: 'inactive' })
    expect(await call('inbox:peek')).toMatchObject({ requestId: id })
  })

  it('never clears or cancels a replacement from a stale preview or completion', async () => {
    await send(text('이전 기록.'))
    const { id } = await call('transfer:status')
    await send(text('새 기록.'))
    const replacement = await call('transfer:status')
    expect(replacement.id).not.toBe(id)
    await call('transfer:cancel', { id }, popup)
    await call('inbox:clear', { id })
    await call('transfer:end', { id, success: true })
    expect(await call('transfer:status')).toMatchObject({ id: replacement.id })
  })

  it('stops automatic input on timeout or destination-tab close', async () => {
    storage.set('place:neis', { origin: new URL(url).origin, path: '/input', tabId: 2 })
    await send(text('닫는 기록.'))
    const { id } = await call('transfer:status')
    expect(await call('transfer:status', {}, sender('other-tab', 3))).toBeNull()
    tabRemoved(2)
    expect(await candidate(id)).toMatchObject({ state: 'inactive' })
    await send(text('시간이 지난 기록.'))
    const next = await call('transfer:status')
    vi.mocked(Date.now).mockReturnValue(next.until + 1)
    expect(await candidate(next.id)).toMatchObject({ state: 'inactive' })
    expect(await call('inbox:peek')).toMatchObject({ requestId: next.id })
  })
})
