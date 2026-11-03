/** request/reply from the page (MAIN world) to the bridge (isolated world) */
import { PAGE_TAG, type PageRequest } from './messages'

const pending = new Map<string, (v: unknown) => void>()
let seq = 0

window.addEventListener('message', (e) => {
  const d = e.data
  if (e.source !== window || !d || d[PAGE_TAG] !== 'res') return
  const done = pending.get(d.id)
  if (done) {
    pending.delete(d.id)
    done(d.resp)
  }
})

export function call<T = unknown>(type: PageRequest, payload?: unknown, timeoutMs = 15_000): Promise<T | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    const id = Date.now() + '-' + ++seq
    pending.set(id, resolve as (v: unknown) => void)
    window.postMessage({ [PAGE_TAG]: 'req', id, type, payload }, location.origin)
    setTimeout(() => {
      if (pending.delete(id)) resolve({ ok: false, reason: '확장 프로그램이 응답하지 않아요. 화면을 새로 고쳐(F5) 주세요.' })
    }, timeoutMs)
  })
}

