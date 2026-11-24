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
import { isNeisHost } from '../sites/neis/grid'
import {
  PAGE_REQUESTS,
  POPUP_REQUESTS,
  type CandidateReply,
  type CandidateState,
  type Moved,
  type NativeReply,
  type TransferStatus,
} from './messages'

/** how old the stored 화면 이름표 may get before the next page asks for a fresh one */
const MAP_REFRESH_MS = 12 * 3_600_000
/** after a send opens or brings K-에듀파인 forward, its page opens the 똑딱 panel by itself
 * when K-에듀파인 is ready within this time (a login can come first) */
const AUTO_OPEN_MS = 15 * 60_000
const TRANSFER_MS = 10 * 60_000
const CANDIDATE_TTL_MS = 3_000
const CANDIDATE_SETTLE_MS = 900
const OWNER_LEASE_MS = 8_000

type Sender = {
  url?: string
  documentId?: string
  documentLifecycle?: string
  tab?: { id?: number; openerTabId?: number }
}
type Owner = NonNullable<NonNullable<InboxEntry['automatic']>['owner']>
type Candidate = { state: CandidateState; seen: number; since: number; tabId: number }
const candidates = new Map<string, Map<string, Candidate>>()

// Chrome storage has no compare-and-swap. Funnel inbox checks and writes through one queue.
let inboxQueue = Promise.resolve()
function withInbox<T>(run: () => Promise<T>): Promise<T> {
  const result = inboxQueue.then(run)
  inboxQueue = result.then(
    () => {},
    () => {},
  )
  return result
}

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
async function keep(task: string, entry: InboxEntry): Promise<void> {
  await chrome.storage.local.set({ [inboxKey(task)]: entry })
}

async function inbox(task: string): Promise<InboxEntry | null> {
  const key = inboxKey(task)
  const entry = freshEntry((await chrome.storage.local.get(key))[key], Date.now())
  if (entry && !entry.requestId) {
    entry.requestId = crypto.randomUUID()
    await keep(task, entry)
  }
  return entry
}

function activeTransfer(entry: InboxEntry | null): InboxEntry['automatic'] {
  const automatic = entry?.automatic
  const now = Date.now()
  return automatic &&
    automatic.until > now &&
    (!automatic.owner || automatic.owner.leaseUntil > now)
    ? automatic
    : undefined
}

async function disarm(task: string, entry: InboxEntry): Promise<void> {
  if (entry.requestId) candidates.delete(entry.requestId)
  delete entry.automatic
  await keep(task, entry)
}

function transferOwner(
  task: string,
  sender: Sender,
  automatic: NonNullable<InboxEntry['automatic']>,
): Omit<Owner, 'leaseUntil'> | null {
  const tabId = sender.tab?.id
  if (tabId === undefined || tabId === automatic.sourceTabId || !sender.documentId) return null
  if (sender.documentLifecycle && sender.documentLifecycle !== 'active') return null
  if (
    automatic.tabId !== undefined &&
    tabId !== automatic.tabId &&
    sender.tab?.openerTabId !== automatic.tabId
  )
    return null
  const place = placeOf(sender.url)
  if (!place) return null
  const host = new URL(place.origin).hostname
  const allowed =
    (__DEV__ && host === '127.0.0.1') ||
    (featureInfo(task)?.site === 'neis'
      ? isNeisHost(host)
      : host.startsWith('klef.') || /^\/keris_ui(?:\/|$)/i.test(place.path))
  return allowed ? { tabId, documentId: sender.documentId } : null
}

async function transferMessage(
  type: string,
  task: string,
  payload: { id?: unknown; state?: unknown; success?: unknown },
  sender: Sender,
): Promise<TransferStatus | CandidateReply | { ok: boolean; leaseUntil?: number } | null> {
  const entry = await inbox(task)
  const automatic = activeTransfer(entry)
  const id = entry?.requestId
  const owner = automatic && transferOwner(task, sender, automatic)
  const popup = fromPopup(sender)
  const owns =
    owner &&
    automatic?.owner?.documentId === owner.documentId &&
    automatic.owner.tabId === owner.tabId
  if (type === 'transfer:status') {
    if (!id || !automatic || (!owner && !popup)) return null
    const status: TransferStatus = { id, until: automatic.until, writing: !!automatic.owner }
    if (owner && !automatic.owner && task === 'neis-record') {
      const record = parseRecordPackage(entry.text)
      if (record.ok)
        status.record = { mode: record.pkg.mode, firstName: record.pkg.students[0].name }
    }
    return status
  }
  const current = entry && id && payload.id === id && automatic
  if (type === 'transfer:renew') {
    if (!current || !owns || !automatic.owner || automatic.owner.cancelled) return { ok: false }
    automatic.owner.leaseUntil = Math.min(automatic.until, Date.now() + OWNER_LEASE_MS)
    await keep(task, entry)
    return { ok: true, leaseUntil: automatic.owner.leaseUntil }
  }
  if (type === 'transfer:cancel' || type === 'transfer:end') {
    const permitted =
      type === 'transfer:end' ? owns : owns || (!automatic?.owner && (popup || owner))
    if (!current || !permitted) return { ok: false }
    if (type === 'transfer:end' && payload.success === true && !automatic?.owner?.cancelled) {
      candidates.delete(id)
      await chrome.storage.local.remove(inboxKey(task))
    } else if (type === 'transfer:cancel' && automatic?.owner) {
      // Keep the writing lock until the owner exits its guarded loop and reports the result.
      automatic.owner.cancelled = true
      await keep(task, entry)
      return { ok: true }
    } else {
      await disarm(task, entry)
    }
    return { ok: true }
  }
  if (!current || !owner || automatic.owner) return { state: 'inactive' }
  const state = payload.state
  if (
    state !== 'absent' &&
    state !== 'menu' &&
    state !== 'waiting' &&
    state !== 'blocked' &&
    state !== 'ready'
  )
    return { state: 'inactive' }
  const now = Date.now()
  const tabs = candidates.get(id) ?? new Map<string, Candidate>()
  candidates.set(id, tabs)
  for (const [doc, candidate] of tabs) if (now - candidate.seen > CANDIDATE_TTL_MS) tabs.delete(doc)
  const previous = tabs.get(owner.documentId)
  if (state === 'absent') tabs.delete(owner.documentId)
  else
    tabs.set(owner.documentId, {
      state,
      seen: now,
      since: previous?.state === state ? previous.since : now,
      tabId: owner.tabId,
    })
  const screens = [...tabs.values()].filter((candidate) => candidate.state !== 'menu')
  if (screens.length > 1 || screens.some((candidate) => candidate.state === 'blocked'))
    return { state: 'ambiguous' }
  if (
    state === 'absent' ||
    !previous ||
    now - previous.since < CANDIDATE_SETTLE_MS ||
    previous.state !== state
  )
    return { state: 'waiting' }
  if (state === 'menu' && tabs.size === 1) return { state: 'menu' }
  if (state !== 'ready') return { state: 'waiting' }
  const leaseUntil = Math.min(automatic.until, now + OWNER_LEASE_MS)
  automatic.owner = { ...owner, leaseUntil }
  await keep(task, entry)
  candidates.delete(id)
  return { state: 'claimed', text: entry.text, leaseUntil }
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
  if (__DEV__) return
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
  sender.url === 'chrome-extension://' + chrome.runtime.id + '/popup.html'

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
  task?: string,
): Promise<{ moved: Moved; tabId?: number }> {
  const place = await placeFor(site)
  // Keep the reservation even on a first visit, before any site address is known.
  if (task) await chrome.storage.local.set({ ['autoOpen:' + task]: Date.now() + AUTO_OPEN_MS })
  if (!place) return { moved: 'unknown' }
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
  let tabId: number | undefined
  if (tab) {
    tabId = tab.id
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
    if (task) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'panel:open' })
      } catch {
        // The page is still loading or was opened before the extension: it opens on ready.
      }
    }
    moved = 'focused'
  } else {
    tabId = (await chrome.tabs.create({ url: place.origin + place.path })).id
    moved = 'opened'
  }
  if (closeFrom && fromTabId !== undefined)
    await chrome.tabs.remove(fromTabId).catch(() => undefined)
  return { moved, tabId }
}

async function handle(msg: { type: string; payload?: unknown }, sender: Sender): Promise<unknown> {
  const popup = (POPUP_REQUESTS as readonly string[]).includes(msg.type) && fromPopup(sender)
  if (!popup && !(PAGE_REQUESTS as readonly string[]).includes(msg.type))
    return { ok: false, reason: '허용되지 않은 요청이에요.' }
  await withInbox(migrate)
  const payload = (msg.payload ?? {}) as {
    feature?: unknown
    id?: unknown
    state?: unknown
    success?: unknown
  }
  switch (msg.type) {
    case 'map:get':
      void refreshMapIfStale()
      return getMap()
    case 'site:seen': {
      // the page found a site running: remember where, from the sender's own address
      const site = siteOf(msg.payload)
      const tabId = sender.tab?.id
      const browserTab =
        typeof tabId === 'number' ? await chrome.tabs.get(tabId).catch(() => undefined) : undefined
      // The work UI can live inside an iframe. Remember the browser tab the teacher
      // actually visits, so reopening does not navigate to a detached inner frame.
      const place = placeOf(browserTab?.url) ?? placeOf(sender.url)
      if (site && place) {
        await chrome.storage.local.set({
          [placeKey(site)]: typeof tabId === 'number' ? { ...place, tabId } : place,
        })
      }
      return { ok: Boolean(site && place) }
    }
    case 'panel:auto': {
      const site = siteOf(msg.payload)
      if (!site) return false
      const tasks = Object.keys(CHECKS).filter((task) => featureInfo(task)?.site === site)
      const keys = tasks.map((task) => 'autoOpen:' + task)
      const stored = await chrome.storage.local.get([...keys, 'autoOpenUntil'])
      const active = keys.filter((key) => Number(stored[key] ?? 0) > Date.now())
      if (active.length) {
        await chrome.storage.local.remove(active)
        return true
      }
      // One-time migration from older extensions, where only 품의 used this key.
      if (site === 'edufine' && Number(stored.autoOpenUntil ?? 0) > Date.now()) {
        await chrome.storage.local.remove('autoOpenUntil')
        return true
      }
      return false
    }
    case 'place:get': {
      const place = await placeFor(siteOf(msg.payload) ?? 'edufine')
      return place && { origin: place.origin, path: place.path }
    }
    case 'inbox:peek': {
      const task = taskOf(payload?.feature)
      if (!task) return null
      return withInbox(async () => {
        const entry = await inbox(task)
        return activeTransfer(entry) && !fromPopup(sender) ? null : entry
      })
    }
    case 'inbox:current':
    case 'inbox:clear': {
      const task = taskOf(payload?.feature)
      if (!task || typeof payload.id !== 'string') return { ok: false }
      return withInbox(async () => {
        const entry = await inbox(task)
        const ok = entry?.requestId === payload.id && !activeTransfer(entry)
        if (ok && msg.type === 'inbox:clear') await chrome.storage.local.remove(inboxKey(task))
        return { ok }
      })
    }
    case 'transfer:status':
    case 'transfer:candidate':
    case 'transfer:cancel':
    case 'transfer:renew':
    case 'transfer:end': {
      const task = taskOf(payload.feature)
      return task ? withInbox(() => transferMessage(msg.type, task, payload, sender)) : null
    }
    case 'work:take-desktop': {
      // 똑딱작업실 hands work over once (its queue drops it), so it is kept here like work
      // from the web app until the task is done: a look and [취소] does not lose it. An app
      // from before task names (0.15.5) ignores the name and hands over its 품의, which only
      // 에듀파인 품의's check lets in.
      const task = taskOf(payload?.feature)
      if (!task) return { ok: false, state: 'off', reason: UNKNOWN_TASK }
      const before = await withInbox(() => inbox(task))
      if (before) {
        return activeTransfer(before)
          ? { ok: false, state: 'busy' }
          : { ok: true, text: before.text, requestId: before.requestId }
      }
      const reply = await native({ type: 'take', feature: task })
      if (!reply.ok || !reply.text || !CHECKS[task](reply.text).ok)
        return reply.ok ? { ok: true } : reply
      const text = reply.text
      return withInbox(async () => {
        if (await inbox(task)) return { ok: false, state: 'busy' }
        const requestId = crypto.randomUUID()
        await keep(task, { text, from: 'desktop', receivedAt: Date.now(), requestId })
        return { ...reply, requestId }
      })
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
  let url: URL
  try {
    url = new URL(sender.origin ?? sender.url ?? '')
  } catch {
    return { ok: false, reason: '허용되지 않은 곳에서 온 요청이에요.' }
  }
  const allowed = __DEV__
    ? url.protocol === 'http:' && url.hostname === '127.0.0.1'
    : WEB_APP_ORIGINS.includes(url.origin)
  if (!allowed) return { ok: false, reason: '허용되지 않은 곳에서 온 요청이에요.' }
  await withInbox(migrate)
  await chrome.storage.local.set({ lastWebContact: Date.now() })
  if (msg.type === 'ping') return { ok: true, version: __VERSION__ }
  // [K-에듀파인으로 보내기] in the web app; pumui:send is the name from before task names
  if (msg.type === 'work:send' || msg.type === 'pumui:send') {
    const task = taskOf(msg.type === 'pumui:send' ? PUMUI : msg.feature)
    if (!task) return { ok: false, reason: UNKNOWN_TASK }
    const text = String(msg.text ?? '')
    const checked = CHECKS[task](text)
    if (!checked.ok) return { ok: false, reason: checked.reason }
    return withInbox(async () => {
      const previous = await inbox(task)
      const active = activeTransfer(previous)
      if (active?.owner) {
        return { ok: false, reason: '이 업무를 입력 중이에요. 업무 화면에서 결과를 확인해 주세요.' }
      }
      const site = featureInfo(task)!.site
      const same = previous?.text === text && active
      if (same && active.tabId !== undefined) {
        const tab = await chrome.tabs.get(active.tabId).catch(() => undefined)
        if (tab) {
          await chrome.tabs.update(tab.id, { active: true })
          await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
          return { ok: true, moved: 'focused' }
        }
      }
      if (previous?.requestId) candidates.delete(previous.requestId)
      const route = await goToSite(site, sender.tab?.id, false).catch(() => ({
        moved: 'unknown' as const,
        tabId: undefined,
      }))
      const now = Date.now()
      await keep(task, {
        text,
        from: 'web',
        receivedAt: now,
        requestId: same ? previous.requestId : crypto.randomUUID(),
        automatic: {
          until: same ? active.until : now + TRANSFER_MS,
          tabId: route.tabId,
          sourceTabId: sender.tab?.id,
        },
      })
      return { ok: true, moved: route.moved }
    })
  }
  // the desktop app's /go page (edufine:go from /edufine/go): the app holds the work, the
  // panel takes it from there
  if (msg.type === 'go' || msg.type === 'edufine:go') {
    const task = taskOf(msg.type === 'edufine:go' ? PUMUI : msg.feature)
    if (!task) return { ok: false, reason: UNKNOWN_TASK }
    const { moved } = await goToSite(featureInfo(task)!.site, sender.tab?.id, true, task)
    return { ok: true, moved }
  }
  return { ok: false, reason: '알 수 없는 요청이에요.' }
}

chrome.runtime.onMessage.addListener(
  (
    msg: { type: string; payload?: unknown },
    sender: Sender,
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
  void withInbox(migrate)
  void refreshMap()
})
chrome.runtime.onStartup.addListener(() => void refreshMapIfStale())
chrome.tabs.onRemoved.addListener((tabId: number) => {
  void withInbox(async () => {
    for (const task of Object.keys(CHECKS)) {
      const entry = await inbox(task)
      const automatic = entry?.automatic
      if (entry && automatic && (automatic.tabId === tabId || automatic.owner?.tabId === tabId)) {
        await disarm(task, entry)
      }
    }
    for (const group of candidates.values()) {
      for (const [doc, candidate] of group) if (candidate.tabId === tabId) group.delete(doc)
    }
  }).catch(() => undefined)
})
