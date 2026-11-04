/** the toolbar popup: nothing to set; the tasks of 똑딱작업실, any waiting work and the K-에듀파인 it knows */
import { FEATURES } from '../core/registry'
import type { EdufinePlace, Pending } from './messages'
import { h } from './page-ui'

const send = (type: string): Promise<unknown> =>
  new Promise((resolve) => chrome.runtime.sendMessage({ type }, (r: unknown) => resolve(r ?? null)))

/** a step with its [buttons] drawn bold */
const stepLine = (s: string): HTMLElement =>
  h(
    'li',
    {},
    ...s.split(/(\[[^\]]+\])/).map((part) => (part.startsWith('[') ? h('b', {}, part) : part)),
  )

async function waiting(id: string): Promise<Pending | null> {
  if (id !== 'edufine-pumui') return null
  const p = (await send('pumui:peek-direct')) as Pending | null
  return p && p.text ? p : null
}

const titleOf = (text: string): string => {
  try {
    return String(JSON.parse(text).title ?? '')
  } catch {
    return ''
  }
}

async function init(): Promise<void> {
  ;(document.getElementById('version') as HTMLElement).textContent = 'v' + __VERSION__
  const list = document.getElementById('features') as HTMLElement
  for (const f of FEATURES) {
    const w = await waiting(f.id)
    const title = w ? titleOf(w.text) : ''
    list.append(
      h(
        'section',
        { class: 'task' },
        h('h2', {}, f.title),
        h('ol', {}, ...f.steps.map(stepLine)),
        w
          ? h(
              'p',
              { class: 'waiting' },
              (w.from === 'desktop' ? '프로그램' : '웹 앱') +
                '에서 보낸 작업이 기다리고 있어요' +
                (title ? ': 「' + title + '」' : '') +
                '. K-에듀파인 화면에서 [똑딱]을 누르세요.',
            )
          : null,
      ),
    )
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
