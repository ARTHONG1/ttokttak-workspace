/** the toolbar popup: nothing to set, only how to use it and whether a 품의 is waiting */
import type { Pending } from './messages'

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
}

void init()
