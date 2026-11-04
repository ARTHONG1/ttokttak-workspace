/**
 * Extension background: keeps the 화면 이름표 current, receives 품의 from the 똑딱작업실
 * web app (externally_connectable) and from the desktop app (native messaging), and
 * answers the page scripts the manifest puts on every https://*.go.kr page (the page
 * script itself shows the 똑딱 button only where K-에듀파인 is running).
 */
import { NATIVE_HOST_NAME, SCREEN_MAP_URL, WEB_APP_ORIGINS } from '../core/ids'
import { parsePumuiPackage } from '../features/edufine-pumui/package'
import { DEFAULT_SCREEN_MAP, parseScreenMap, type ScreenMap } from '../sites/edufine/screen-map'
import {
  PAGE_REQUESTS,
  POPUP_REQUESTS,
  type EdufinePlace,
  type Moved,
  type NativeReply,
  type Pending,
} from './messages'

const PENDING_MAX_MS = 24 * 3_600_000
/** how old the stored 화면 이름표 may get before the next page asks for a fresh one */
const MAP_REFRESH_MS = 12 * 3_600_000
/** after a send opens or brings K-에듀파인 forward, its page opens the 똑딱 panel by itself
 * when K-에듀파인 is ready within this time (a login can come first) */
const AUTO_OPEN_MS = 15 * 60_000

async function getMap(): Promise<ScreenMap> {
  const { screenMap } = await chrome.storage.local.get('screenMap')
  const stored = screenMap && parseScreenMap(JSON.stringify(screenMap))
  if (!stored) return DEFAULT_SCREEN_MAP
  // a table from before the menu part (stored, or served by an older web app) keeps the
  // built-in menu names, so the 품의등록 screen still opens by itself
  return stored.menu ? stored : { ...stored, menu: DEFAULT_SCREEN_MAP.menu }
}

/** fetches the 화면 이름표 the web app serves; keeps the one it has when that fails */
async function refreshMap(): Promise<void> {
  try {
    const res = await fetch(SCREEN_MAP_URL, { cache: 'no-store' })
    const map = res.ok ? parseScreenMap(await res.text()) : null
    if (map) await chrome.storage.local.set({ screenMap: map })
  } catch {
    /* offline or the web app is down: the stored or built-in 이름표 stays */
  }
  await chrome.storage.local.set({ screenMapCheckedAt: Date.now() })
}

async function refreshMapIfStale(): Promise<void> {
  const { screenMapCheckedAt } = await chrome.storage.local.get('screenMapCheckedAt')
  if (Date.now() - Number(screenMapCheckedAt ?? 0) > MAP_REFRESH_MS) await refreshMap()
}

function native(message: unknown): Promise<NativeReply> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        message,
        (reply: NativeReply | undefined) => {
          const err = chrome.runtime.lastError
          if (err) {
            const missing = /not found|forbidden|not allowed|specified native messaging host/i.test(
              String(err.message),
            )
            resolve({ ok: false, state: missing ? 'missing' : 'off', reason: String(err.message) })
            return
          }
          resolve(reply ?? { ok: false, state: 'off', reason: '응답 없음' })
        },
      )
    } catch (e) {
      resolve({ ok: false, state: 'missing', reason: String(e) })
    }
  })
}

const fromPopup = (sender: { url?: string }): boolean =>
  String(sender.url ?? '').startsWith('chrome-extension://' + chrome.runtime.id + '/popup.html')

/** a K-에듀파인 page the extension may remember: https on go.kr (127.0.0.1 in the test build) */
function placeOf(url: string | undefined): EdufinePlace | null {
  try {
    const u = new URL(String(url))
    const ok =
      (u.protocol === 'https:' && u.hostname.endsWith('.go.kr')) ||
      (__DEV__ && u.hostname === '127.0.0.1')
    return ok ? { origin: u.origin, path: u.pathname } : null
  } catch {
    return null
  }
}

/**
 * [K-에듀파인으로 보내기] in the browser: bring the tab where K-에듀파인 ran last forward and
 * open its 똑딱 panel, or open that address in a new tab (the panel opens once K-에듀파인 is
 * ready, after a login). Without a remembered place there is nowhere to go yet. The tab the
 * request came from (the web app, or the desktop app's /edufine/go page) is never the target;
 * the /edufine/go page is closed once the move is done.
 */
async function goToEdufine(fromTabId: number | undefined, closeFrom: boolean): Promise<Moved> {
  const { edufinePlace, edufineTabId } = (await chrome.storage.local.get([
    'edufinePlace',
    'edufineTabId',
  ])) as {
    edufinePlace?: EdufinePlace
    edufineTabId?: number
  }
  if (!edufinePlace) return 'unknown'
  type Tab = { id: number; windowId: number; url?: string }
  const isPlace = (t: Tab | undefined): t is Tab =>
    !!t && t.id !== fromTabId && !!t.url && new URL(t.url).origin === edufinePlace.origin
  // the very tab K-에듀파인 ran in last, else any tab on that address
  const last: Tab | undefined =
    edufineTabId === undefined
      ? undefined
      : await chrome.tabs.get(edufineTabId).catch(() => undefined)
  const host = new URL(edufinePlace.origin)
  const tab = isPlace(last)
    ? last
    : (
        (await chrome.tabs.query({ url: host.protocol + '//' + host.hostname + '/*' })) as Tab[]
      ).find(isPlace)
  let moved: Moved
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'panel:open' })
    } catch {
      // the page is still loading or was opened before the extension: it opens on ready
      await chrome.storage.local.set({ autoOpenUntil: Date.now() + AUTO_OPEN_MS })
    }
    moved = 'focused'
  } else {
    await chrome.storage.local.set({ autoOpenUntil: Date.now() + AUTO_OPEN_MS })
    await chrome.tabs.create({ url: edufinePlace.origin + edufinePlace.path })
    moved = 'opened'
  }
  if (closeFrom && fromTabId !== undefined)
    await chrome.tabs.remove(fromTabId).catch(() => undefined)
  return moved
}

async function handle(
  msg: { type: string; payload?: unknown },
  sender: { url?: string; tab?: { id?: number } },
): Promise<unknown> {
  const popup = (POPUP_REQUESTS as readonly string[]).includes(msg.type) && fromPopup(sender)
  if (!popup && !(PAGE_REQUESTS as readonly string[]).includes(msg.type))
    return { ok: false, reason: '허용되지 않은 요청이에요.' }
  switch (msg.type) {
    case 'map:get':
      void refreshMapIfStale()
      return getMap()
    case 'edufine:seen': {
      // the page found K-에듀파인 running: remember where, from the sender's own address
      const place = placeOf(sender.url)
      if (place)
        await chrome.storage.local.set({ edufinePlace: place, edufineTabId: sender.tab?.id })
      return { ok: Boolean(place) }
    }
    case 'panel:auto': {
      const { autoOpenUntil } = await chrome.storage.local.get('autoOpenUntil')
      if (!(Number(autoOpenUntil ?? 0) > Date.now())) return false
      await chrome.storage.local.remove('autoOpenUntil')
      return true
    }
    case 'place:get': {
      const { edufinePlace } = await chrome.storage.local.get('edufinePlace')
      return edufinePlace ?? null
    }
    case 'pumui:peek-direct': {
      const { pending } = (await chrome.storage.local.get('pending')) as { pending?: Pending }
      if (!pending || Date.now() - pending.receivedAt > PENDING_MAX_MS) return null
      return pending
    }
    case 'pumui:clear-direct':
      await chrome.storage.local.remove('pending')
      return { ok: true }
    case 'pumui:take-desktop': {
      // 똑딱작업실 hands a 품의 over once (its queue drops it), so it is kept here like one
      // from the web app until it is filled: a look and [취소] does not lose it
      const reply = await native({ type: 'take' })
      if (reply.ok && reply.text && parsePumuiPackage(reply.text).ok) {
        const pending: Pending = { text: reply.text, from: 'desktop', receivedAt: Date.now() }
        await chrome.storage.local.set({ pending })
      }
      return reply
    }
    case 'desktop:ping':
      return native({ type: 'ping' })
    case 'web:state': {
      const { lastWebContact } = await chrome.storage.local.get('lastWebContact')
      return { state: lastWebContact ? 'ok' : 'unknown' }
    }
  }
  return { ok: false, reason: '알 수 없는 요청이에요.' }
}

async function handleExternal(
  msg: { type?: string; text?: unknown },
  sender: { origin?: string; url?: string; tab?: { id?: number } },
): Promise<unknown> {
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : '')
  const allowed =
    WEB_APP_ORIGINS.includes(origin) || (__DEV__ && origin.startsWith('http://127.0.0.1'))
  if (!allowed) return { ok: false, reason: '허용되지 않은 곳에서 온 요청이에요.' }
  await chrome.storage.local.set({ lastWebContact: Date.now() })
  if (msg.type === 'ping') return { ok: true, version: __VERSION__ }
  if (msg.type === 'pumui:send') {
    const parsed = parsePumuiPackage(String(msg.text ?? ''))
    if (!parsed.ok) return { ok: false, reason: parsed.reason }
    const pending: Pending = { text: String(msg.text), from: 'web', receivedAt: Date.now() }
    await chrome.storage.local.set({ pending })
    return { ok: true, moved: await goToEdufine(sender.tab?.id, false) }
  }
  if (msg.type === 'edufine:go') {
    // the desktop app's helper page: 똑딱작업실 holds the 품의, the panel takes it from there
    return { ok: true, moved: await goToEdufine(sender.tab?.id, true) }
  }
  return { ok: false, reason: '알 수 없는 요청이에요.' }
}

chrome.runtime.onMessage.addListener(
  (
    msg: { type: string; payload?: unknown },
    sender: { url?: string; tab?: { id?: number } },
    sendResponse: (r: unknown) => void,
  ) => {
    void handle(msg, sender).then(sendResponse, (e) =>
      sendResponse({ ok: false, reason: String(e) }),
    )
    return true
  },
)

chrome.runtime.onMessageExternal.addListener(
  (
    msg: { type?: string; text?: unknown },
    sender: { origin?: string; url?: string; tab?: { id?: number } },
    sendResponse: (r: unknown) => void,
  ) => {
    void handleExternal(msg, sender).then(sendResponse, (e) =>
      sendResponse({ ok: false, reason: String(e) }),
    )
    return true
  },
)

// earlier versions registered the page scripts at run time for the addresses the teacher
// typed; the manifest declares them now, so drop those registrations and the old settings
chrome.runtime.onInstalled.addListener(() => {
  void chrome.scripting.unregisterContentScripts().catch(() => undefined)
  void chrome.storage.local.remove('settings')
  void refreshMap()
})
chrome.runtime.onStartup.addListener(() => void refreshMapIfStale())
