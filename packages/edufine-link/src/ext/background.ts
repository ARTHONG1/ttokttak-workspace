/**
 * Extension background: keeps the 화면 이름표 current, receives 품의 from the 똑딱작업실
 * web app (externally_connectable) and from the desktop app (native messaging), and
 * answers the page scripts the manifest puts on every https://*.go.kr page (the page
 * script itself shows the 똑딱 button only where K-에듀파인 is running).
 */
import { NATIVE_HOST_NAME, SCREEN_MAP_URL, WEB_APP_ORIGINS } from '../ids'
import { parsePumuiPackage } from '../pumui-package'
import { DEFAULT_SCREEN_MAP, parseScreenMap, type ScreenMap } from '../screen-map'
import { PAGE_REQUESTS, type NativeReply, type Pending } from './messages'

const PENDING_MAX_MS = 24 * 3_600_000
/** how old the stored 화면 이름표 may get before the next page asks for a fresh one */
const MAP_REFRESH_MS = 12 * 3_600_000

async function getMap(): Promise<ScreenMap> {
  const { screenMap } = await chrome.storage.local.get('screenMap')
  return (screenMap && parseScreenMap(JSON.stringify(screenMap))) || DEFAULT_SCREEN_MAP
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

async function handle(msg: { type: string; payload?: unknown }): Promise<unknown> {
  if (!(PAGE_REQUESTS as readonly string[]).includes(msg.type))
    return { ok: false, reason: '허용되지 않은 요청이에요.' }
  switch (msg.type) {
    case 'map:get':
      void refreshMapIfStale()
      return getMap()
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
  sender: { origin?: string; url?: string },
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
    return { ok: true }
  }
  return { ok: false, reason: '알 수 없는 요청이에요.' }
}

chrome.runtime.onMessage.addListener(
  (
    msg: { type: string; payload?: unknown },
    _sender: unknown,
    sendResponse: (r: unknown) => void,
  ) => {
    void handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) }))
    return true
  },
)

chrome.runtime.onMessageExternal.addListener(
  (
    msg: { type?: string; text?: unknown },
    sender: { origin?: string; url?: string },
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
