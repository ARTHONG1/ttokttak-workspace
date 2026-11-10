/**
 * Extension background: keeps the 화면 이름표 current, receives work for each task from
 * the 똑딱작업실 web app (externally_connectable) and from the desktop app (native
 * messaging) into that task's 받은 작업함, and answers the page scripts the manifest puts on
 * every https://*.go.kr page (the page script shows the 똑딱 button only on a known site).
 */
import type { SiteId } from '../core/feature'
import { NATIVE_HOST_NAME, SCREEN_MAP_URL, WEB_APP_ORIGINS } from '../core/ids'
import { freshEntry, inboxKey, migrateInbox, type InboxEntry } from '../core/inbox'
import { migratePlaces, placeKey, readPlace, type Place } from '../core/places'
import { featureInfo } from '../core/registry'
import { parsePumuiPackage } from '../features/edufine-pumui/package'
import { parseRecordPackage } from '../features/neis-record/package'
import { DEFAULT_SCREEN_MAP, parseScreenMap, type ScreenMap } from '../sites/edufine/screen-map'
import { PAGE_REQUESTS, POPUP_REQUESTS, type Moved, type NativeReply } from './messages'

/** how old the stored 화면 이름표 may get before the next page asks for a fresh one */
const MAP_REFRESH_MS = 12 * 3_600_000
/** after a send opens or brings K-에듀파인 forward, its page opens the 똑딱 panel by itself
 * when K-에듀파인 is ready within this time (a login can come first) */
const AUTO_OPEN_MS = 15 * 60_000

/** each task's check of its work text: nothing else is kept, shown or filled */
const CHECKS: Readonly<
  Record<string, (text: string) => { ok: true } | { ok: false; reason: string }>
> = {
  'edufine-pumui': (t) => parsePumuiPackage(t),
  'neis-record': (t) => parseRecordPackage(t),
}
/** what came from the web app or the desktop app before work carried a task name */
const PUMUI = 'edufine-pumui'
const UNKNOWN_TASK = '이 확장이 모르는 업무예요. 확장을 업데이트해 주세요.'
const SITES: readonly SiteId[] = ['edufine', 'neis']

/** the task a request names, when this extension has it */
function taskOf(feature: unknown): string | null {
  return typeof feature === 'string' && featureInfo(feature) && CHECKS[feature] ? feature : null
}

const siteOf = (payload: unknown): SiteId | null => {
  const s = (payload as { site?: unknown } | null)?.site
  return SITES.find((x) => x === s) ?? null
}

/**
 * 0.4.0 kept one waiting 품의 and one K-에듀파인 address under other keys; move them over
 * before any request is answered, so an update loses neither.
 */
async function migrate(): Promise<void> {
  const stored = (await chrome.storage.local.get([
    'pending',
    'edufinePlace',
    'edufineTabId',
    inboxKey(PUMUI),
    placeKey('edufine'),
  ])) as Record<string, unknown>
  const changes = [migrateInbox(stored), migratePlaces(stored)]
  const set = Object.assign({}, ...changes.map((c) => c.set)) as Record<string, unknown>
  const remove = changes.flatMap((c) => c.remove)
  if (Object.keys(set).length) await chrome.storage.local.set(set)
  if (remove.length) await chrome.storage.local.remove(remove)
}

/** keep the latest work for a task (a second send replaces the first) */
async function keep(task: string, text: string, from: InboxEntry['from']): Promise<void> {
  const entry: InboxEntry = { text, from, receivedAt: Date.now() }
  await chrome.storage.local.set({ [inboxKey(task)]: entry })
}

async function placeFor(site: SiteId): Promise<Place | null> {
  const key = placeKey(site)
  const stored = (await chrome.storage.local.get(key)) as Record<string, unknown>
  return readPlace(stored[key])
}

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

/** a site page the extension may remember: https on go.kr (127.0.0.1 in the test build) */
function placeOf(url: string | undefined): Place | null {
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
 * [K-에듀파인으로 보내기] in the browser: bring the tab where the task's site ran last forward
 * and open its 똑딱 panel, or open that address in a new tab (the panel opens once the site
 * is ready, after a login). Without a remembered place there is nowhere to go yet. The tab
 * the request came from (the web app, or the desktop app's /go page) is never the target;
 * the /go page is closed once the move is done.
 */
async function goToSite(
  site: SiteId,
  fromTabId: number | undefined,
  closeFrom: boolean,
): Promise<Moved> {
  const place = await placeFor(site)
  if (!place) return 'unknown'
  type Tab = { id: number; windowId: number; url?: string }
  const isPlace = (t: Tab | undefined): t is Tab =>
    !!t && t.id !== fromTabId && !!t.url && new URL(t.url).origin === place.origin
  // the very tab the site ran in last, else any tab on that address
  const last: Tab | undefined =
    place.tabId === undefined
      ? undefined
      : await chrome.tabs.get(place.tabId).catch(() => undefined)
  const host = new URL(place.origin)
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
    await chrome.tabs.create({ url: place.origin + place.path })
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
  await migrate()
  const payload = msg.payload as { feature?: unknown } | undefined
  switch (msg.type) {
    case 'map:get':
      void refreshMapIfStale()
      return getMap()
    case 'site:seen': {
      // the page found a site running: remember where, from the sender's own address
      const site = siteOf(msg.payload)
      const place = placeOf(sender.url)
      if (site && place) {
        const tabId = sender.tab?.id
        await chrome.storage.local.set({
          [placeKey(site)]: typeof tabId === 'number' ? { ...place, tabId } : place,
        })
      }
      return { ok: Boolean(site && place) }
    }
    case 'panel:auto': {
      const { autoOpenUntil } = await chrome.storage.local.get('autoOpenUntil')
      if (!(Number(autoOpenUntil ?? 0) > Date.now())) return false
      await chrome.storage.local.remove('autoOpenUntil')
      return true
    }
    case 'place:get': {
      const place = await placeFor(siteOf(msg.payload) ?? 'edufine')
      return place && { origin: place.origin, path: place.path }
    }
    case 'inbox:peek': {
      const task = taskOf(payload?.feature)
      if (!task) return null
      const stored = (await chrome.storage.local.get(inboxKey(task))) as Record<string, unknown>
      return freshEntry(stored[inboxKey(task)], Date.now())
    }
    case 'inbox:clear': {
      const task = taskOf(payload?.feature)
      if (task) await chrome.storage.local.remove(inboxKey(task))
      return { ok: true }
    }
    case 'work:take-desktop': {
      // 똑딱작업실 hands work over once (its queue drops it), so it is kept here like work
      // from the web app until the task is done: a look and [취소] does not lose it. An app
      // from before task names (0.15.5) ignores the name and hands over its 품의, which only
      // 에듀파인 품의's check lets in.
      const task = taskOf(payload?.feature)
      if (!task) return { ok: false, state: 'off', reason: UNKNOWN_TASK }
      const reply = await native({ type: 'take', feature: task })
      if (reply.ok && reply.text && CHECKS[task](reply.text).ok)
        await keep(task, reply.text, 'desktop')
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
  msg: { type?: string; text?: unknown; feature?: unknown },
  sender: { origin?: string; url?: string; tab?: { id?: number } },
): Promise<unknown> {
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : '')
  const allowed =
    WEB_APP_ORIGINS.includes(origin) || (__DEV__ && origin.startsWith('http://127.0.0.1'))
  if (!allowed) return { ok: false, reason: '허용되지 않은 곳에서 온 요청이에요.' }
  await migrate()
  await chrome.storage.local.set({ lastWebContact: Date.now() })
  if (msg.type === 'ping') return { ok: true, version: __VERSION__ }
  // [K-에듀파인으로 보내기] in the web app; pumui:send is the name from before task names
  if (msg.type === 'work:send' || msg.type === 'pumui:send') {
    const task = taskOf(msg.type === 'pumui:send' ? PUMUI : msg.feature)
    if (!task) return { ok: false, reason: UNKNOWN_TASK }
    const text = String(msg.text ?? '')
    const checked = CHECKS[task](text)
    if (!checked.ok) return { ok: false, reason: checked.reason }
    await keep(task, text, 'web')
    return { ok: true, moved: await goToSite(featureInfo(task)!.site, sender.tab?.id, false) }
  }
  // the desktop app's /go page (edufine:go from /edufine/go): the app holds the work, the
  // panel takes it from there
  if (msg.type === 'go' || msg.type === 'edufine:go') {
    const task = taskOf(msg.type === 'edufine:go' ? PUMUI : msg.feature)
    if (!task) return { ok: false, reason: UNKNOWN_TASK }
    return { ok: true, moved: await goToSite(featureInfo(task)!.site, sender.tab?.id, true) }
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
    msg: { type?: string; text?: unknown; feature?: unknown },
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
  void migrate()
  void refreshMap()
})
chrome.runtime.onStartup.addListener(() => void refreshMapIfStale())
