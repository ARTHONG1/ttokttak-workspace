/**
 * Extension background: keeps the settings and the 화면 이름표, receives 품의 from the
 * 똑딱작업실 web app (externally_connectable) and from the desktop app (native messaging),
 * and registers the page scripts on the K-에듀파인 origins the teacher allowed.
 */
import { NATIVE_HOST_NAME, SCREEN_MAP_URL, WEB_APP_ORIGINS } from '../ids'
import { originFrom } from '../origin'
import { parsePumuiPackage } from '../pumui-package'
import { DEFAULT_SCREEN_MAP, parseScreenMap, type ScreenMap } from '../screen-map'
import { DEFAULT_SETTINGS, PAGE_REQUESTS, POPUP_REQUESTS, type NativeReply, type Pending, type Settings } from './messages'

const SCRIPT_IDS = ['ttok-edufine-main', 'ttok-edufine-bridge']
const DEV_ORIGINS = __DEV__ ? ['http://127.0.0.1'] : []
const PENDING_MAX_MS = 24 * 3_600_000

async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) }
}

async function getMap(): Promise<ScreenMap> {
  const { screenMap } = await chrome.storage.local.get('screenMap')
  return (screenMap && parseScreenMap(JSON.stringify(screenMap))) || DEFAULT_SCREEN_MAP
}

async function registerScripts(): Promise<void> {
  const { origins } = await getSettings()
  const matches = [...origins, ...DEV_ORIGINS].map((o) => o + '/*')
  try {
    await chrome.scripting.unregisterContentScripts({ ids: SCRIPT_IDS })
  } catch {
    /* none registered yet */
  }
  if (!matches.length) return
  await chrome.scripting.registerContentScripts([
    { id: SCRIPT_IDS[0], matches, js: ['page-main.js'], world: 'MAIN', runAt: 'document_idle', persistAcrossSessions: true },
    { id: SCRIPT_IDS[1], matches, js: ['page-bridge.js'], runAt: 'document_start', persistAcrossSessions: true },
  ])
}

function native(message: unknown): Promise<NativeReply> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (reply: NativeReply | undefined) => {
        const err = chrome.runtime.lastError
        if (err) {
          const missing = /not found|forbidden|not allowed|specified native messaging host/i.test(String(err.message))
          resolve({ ok: false, state: missing ? 'missing' : 'off', reason: String(err.message) })
          return
        }
        resolve(reply ?? { ok: false, state: 'off', reason: '응답 없음' })
      })
    } catch (e) {
      resolve({ ok: false, state: 'missing', reason: String(e) })
    }
  })
}

const fromPopup = (sender: { url?: string }): boolean => String(sender.url ?? '').startsWith('chrome-extension://' + chrome.runtime.id + '/popup.html')

async function handle(msg: { type: string; payload?: unknown }, sender: { url?: string; tab?: unknown }): Promise<unknown> {
  const page = (PAGE_REQUESTS as readonly string[]).includes(msg.type)
  const popup = (POPUP_REQUESTS as readonly string[]).includes(msg.type)
  if (!page && !(popup && fromPopup(sender))) return { ok: false, reason: '허용되지 않은 요청이에요.' }
  switch (msg.type) {
    case 'map:get':
      return getMap()
    case 'settings:get':
      return getSettings()
    case 'pumui:peek-direct': {
      const { pending } = (await chrome.storage.local.get('pending')) as { pending?: Pending }
      if (!pending || Date.now() - pending.receivedAt > PENDING_MAX_MS) return null
      return pending
    }
    case 'pumui:clear-direct':
      await chrome.storage.local.remove('pending')
      return { ok: true }
    case 'pumui:take-desktop':
      return native({ type: 'take' })
    case 'desktop:ping':
      return native({ type: 'ping' })
    case 'web:state': {
      const { lastWebContact } = await chrome.storage.local.get('lastWebContact')
      return { state: lastWebContact ? 'ok' : 'unknown' }
    }
    case 'settings:set': {
      const s = await getSettings()
      const p = (msg.payload ?? {}) as Partial<Settings>
      if (typeof p.fillEnabled === 'boolean') s.fillEnabled = p.fillEnabled
      await chrome.storage.local.set({ settings: s })
      return s
    }
    case 'origin:add': {
      const origin = originFrom(String(msg.payload ?? ''), __DEV__)
      if (!origin) return { ok: false, reason: 'K-에듀파인 주소(…go.kr)를 넣어 주세요.' }
      const granted = await chrome.permissions.contains({ origins: [origin + '/*'] })
      if (!granted) return { ok: false, reason: '주소 권한이 허용되지 않았어요.' }
      const s = await getSettings()
      if (!s.origins.includes(origin)) s.origins.push(origin)
      await chrome.storage.local.set({ settings: s })
      await registerScripts()
      return { ok: true, settings: s }
    }
    case 'origin:remove': {
      const s = await getSettings()
      s.origins = s.origins.filter((o) => o !== msg.payload)
      await chrome.storage.local.set({ settings: s })
      await registerScripts()
      try {
        await chrome.permissions.remove({ origins: [String(msg.payload) + '/*'] })
      } catch {
        /* already gone */
      }
      return { ok: true, settings: s }
    }
    case 'map:set': {
      const map = parseScreenMap(String(msg.payload ?? ''))
      if (!map) return { ok: false, reason: '화면 이름표 파일이 아니에요.' }
      await chrome.storage.local.set({ screenMap: map })
      return { ok: true, revision: map.revision }
    }
    case 'map:refresh': {
      try {
        const res = await fetch(SCREEN_MAP_URL, { cache: 'no-store' })
        const map = res.ok ? parseScreenMap(await res.text()) : null
        if (!map) return { ok: false, reason: '웹 앱에서 화면 이름표를 받지 못했어요.' }
        await chrome.storage.local.set({ screenMap: map })
        return { ok: true, revision: map.revision }
      } catch {
        return { ok: false, reason: '웹 앱에 연결하지 못했어요. 인터넷이 안 되는 PC라면 [파일 넣기]를 써 주세요.' }
      }
    }
    case 'map:reset':
      await chrome.storage.local.remove('screenMap')
      return { ok: true, revision: DEFAULT_SCREEN_MAP.revision }
  }
  return { ok: false, reason: '알 수 없는 요청이에요.' }
}

async function handleExternal(msg: { type?: string; text?: unknown }, sender: { origin?: string; url?: string }): Promise<unknown> {
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : '')
  const allowed = WEB_APP_ORIGINS.includes(origin) || (__DEV__ && origin.startsWith('http://127.0.0.1'))
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

chrome.runtime.onMessage.addListener((msg: { type: string; payload?: unknown }, sender: { url?: string }, sendResponse: (r: unknown) => void) => {
  void handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) }))
  return true
})

chrome.runtime.onMessageExternal.addListener((msg: { type?: string; text?: unknown }, sender: { origin?: string; url?: string }, sendResponse: (r: unknown) => void) => {
  void handleExternal(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) }))
  return true
})

chrome.runtime.onInstalled.addListener(() => void registerScripts())
chrome.runtime.onStartup.addListener(() => void registerScripts())

