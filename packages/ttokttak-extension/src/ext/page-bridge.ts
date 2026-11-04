/**
 * Isolated-world bridge: the page script cannot use chrome.*, so its requests come here
 * by postMessage and go on to the background. Only PAGE_REQUESTS pass. The one thing the
 * background sends the other way is "open the 똑딱 panel" after a send brought this tab up.
 */
import { PAGE_REQUESTS, PAGE_TAG } from './messages'

const allowed = new Set<string>(PAGE_REQUESTS)

chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type === 'panel:open')
    window.postMessage({ [PAGE_TAG]: 'cmd', type: 'open' }, location.origin)
})

window.addEventListener('message', (e) => {
  const d = e.data
  if (e.source !== window || !d || d[PAGE_TAG] !== 'req' || !allowed.has(d.type)) return
  const reply = (resp: unknown) =>
    window.postMessage({ [PAGE_TAG]: 'res', id: d.id, resp }, location.origin)
  try {
    chrome.runtime.sendMessage({ type: d.type, payload: d.payload }, (resp: unknown) => {
      const err = chrome.runtime.lastError
      reply(err ? { ok: false, reason: err.message } : resp)
    })
  } catch (err) {
    reply({
      ok: false,
      reason: '확장 프로그램과 연결이 끊겼어요. 화면을 새로 고쳐(F5) 주세요. (' + String(err) + ')',
    })
  }
})
