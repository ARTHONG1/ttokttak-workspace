/** the toolbar popup: K-에듀파인 address, real fill on/off, connection, 화면 이름표 */
import { originFrom } from '../origin'
import type { Settings } from './messages'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const send = (type: string, payload?: unknown): Promise<any> =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage({ type, payload }, (r: unknown) =>
      resolve(r ?? { ok: false, reason: chrome.runtime.lastError?.message }),
    ),
  )

function say(id: string, text: string, ok = true): void {
  const el = $(id)
  el.textContent = text
  el.className = ok ? 'msg ok' : 'msg bad'
}

function renderOrigins(s: Settings): void {
  const list = $('origins')
  list.replaceChildren()
  for (const o of s.origins) {
    const li = document.createElement('li')
    const rm = document.createElement('button')
    rm.textContent = '빼기'
    rm.type = 'button'
    rm.onclick = async () => renderOrigins((await send('origin:remove', o)).settings)
    li.append(o + ' ', rm)
    list.append(li)
  }
  if (!s.origins.length) list.textContent = '아직 없어요.'
}

async function init(): Promise<void> {
  $('version').textContent = 'v' + __VERSION__
  const s: Settings = await send('settings:get')
  renderOrigins(s)
  const fill = $<HTMLInputElement>('fill')
  fill.checked = s.fillEnabled
  fill.onchange = async () => {
    await send('settings:set', { fillEnabled: fill.checked })
    say(
      'fill-msg',
      fill.checked ? '이제 미리보기에서 [채우기]를 누를 수 있어요.' : '미리보기만 보여 줘요.',
    )
  }
  $('allow').onclick = async () => {
    // the same rule the background applies: https and a go.kr host (the extension may ask for nothing else)
    const origin = originFrom($<HTMLInputElement>('origin').value, __DEV__)
    if (!origin) {
      say(
        'origin-msg',
        'K-에듀파인 주소를 확인해 주세요. ○○.go.kr로 끝나는 주소만 넣을 수 있어요.',
        false,
      )
      return
    }
    const granted = await chrome.permissions
      .request({ origins: [origin + '/*'] })
      .catch(() => false)
    if (!granted) {
      say('origin-msg', '권한을 허용해야 K-에듀파인 화면에서 동작해요.', false)
      return
    }
    const r = await send('origin:add', origin)
    if (!r.ok) return say('origin-msg', r.reason, false)
    renderOrigins(r.settings)
    say(
      'origin-msg',
      '허용했어요. K-에듀파인 화면을 새로 고치면(F5) 오른쪽 아래에 [똑딱] 버튼이 생겨요.',
    )
  }
  const ping = await send('desktop:ping')
  $('desktop').textContent = ping.ok
    ? '연결됨'
    : ping.state === 'off'
      ? '똑딱작업실이 꺼져 있어요'
      : '설치 안 됨 또는 연결 등록 안 됨(웹 앱만 쓰면 괜찮아요)'
  const web = await send('web:state')
  $('web').textContent = web.state === 'ok' ? '연결된 적 있음' : '아직 없음'
  const map = await send('map:get')
  $('map').textContent = map.revision
  $('map-file-pick').onclick = () => $<HTMLInputElement>('map-file').click()
  $('map-file').onchange = async () => {
    const f = $<HTMLInputElement>('map-file').files?.[0]
    if (!f) return
    const r = await send('map:set', await f.text())
    if (r.ok) $('map').textContent = r.revision
    say(
      'map-msg',
      r.ok ? '화면 이름표를 바꿨어요. K-에듀파인 화면을 새로 고쳐 주세요.' : r.reason,
      r.ok,
    )
  }
  $('map-refresh').onclick = async () => {
    const r = await send('map:refresh')
    if (r.ok) $('map').textContent = r.revision
    say('map-msg', r.ok ? '최신 화면 이름표를 받았어요.' : r.reason, r.ok)
  }
  $('map-reset').onclick = async () => {
    const r = await send('map:reset')
    $('map').textContent = r.revision
    say('map-msg', '기본 화면 이름표로 돌렸어요.')
  }
}

void init()
