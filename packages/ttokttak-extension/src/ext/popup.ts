/** the toolbar popup: nothing to set, only how to use it, a waiting 품의 and the K-에듀파인 it knows */
import type { EdufinePlace, Pending } from './messages'

const send = (type: string): Promise<unknown> =>
  new Promise((resolve) => chrome.runtime.sendMessage({ type }, (r: unknown) => resolve(r ?? null)))

async function init(): Promise<void> {
  ;(document.getElementById('version') as HTMLElement).textContent = 'v' + __VERSION__
  const pending = (await send('pumui:peek-direct')) as Pending | null
  const waiting = document.getElementById('waiting') as HTMLElement
  if (pending && pending.text) {
    let title = ''
    try {
      title = String(JSON.parse(pending.text).title ?? '')
    } catch {
      /* shown without its title */
    }
    waiting.textContent =
      '웹 앱에서 보낸 품의' +
      (title ? ' 「' + title + '」' : '') +
      '가 기다리고 있어요. K-에듀파인 품의등록 화면에서 [똑딱]을 누르세요.'
    waiting.hidden = false
  }
  const place = (await send('place:get')) as EdufinePlace | null
  ;(document.getElementById('place') as HTMLElement).textContent =
    place && place.origin
      ? 'K-에듀파인(' +
        new URL(place.origin).hostname +
        ')을 기억했어요. [K-에듀파인으로 보내기]를 누르면 그 화면으로 바로 옮겨요.'
      : 'K-에듀파인을 한 번 열면 주소를 기억해서, 다음부터 [K-에듀파인으로 보내기]가 그 화면으로 바로 옮겨요.'
}

void init()
