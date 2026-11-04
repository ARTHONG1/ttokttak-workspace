/**
 * The folded 「문제가 있을 때」 part every task shows: the self-check and the diagnostic
 * file. The file holds the screen's structure only, never an amount, a name or an item.
 */
import {
  buildDiagnostic,
  runChecks,
  type DesktopState,
  type WebState,
} from '../sites/edufine/diagnose'
import { frameSurvey, type FrameWin } from '../sites/edufine/nexacro'
import { edufineMap, nexacro } from './edufine'
import { call } from './page-channel'
import { h, type Panel } from './page-ui'

export interface TroubleEnv {
  panel: Panel
  log: readonly string[]
  step(s: string): void
  home(): void
}

export function troubleTools(env: TroubleEnv): HTMLElement {
  return h(
    'details',
    {},
    h('summary', {}, '문제가 있을 때'),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => void check(env) }, '연결 점검'),
      h(
        'button',
        { class: 'btn', type: 'button', onclick: () => void saveDiagnostic(env) },
        '진단 파일 저장',
      ),
    ),
  )
}

async function connectionStates(): Promise<{ desktop: DesktopState; web: WebState }> {
  // the first native host start can wait on the PC's security scan
  const d = (await call<{ ok: boolean; state?: string }>('desktop:ping', undefined, 20_000)) as {
    ok: boolean
    state?: string
  }
  const w = (await call<{ state: WebState }>('web:state')) as { state?: WebState }
  const desktop: DesktopState = d.ok
    ? 'ok'
    : d.state === 'missing'
      ? 'missing'
      : d.state === 'off'
        ? 'off'
        : 'unknown'
  return { desktop, web: w.state ?? 'unknown' }
}

async function check(env: TroubleEnv): Promise<void> {
  const { panel, step } = env
  step('연결 점검')
  // shown at once: whatever the task was waiting for on screen stops here
  panel.show(h('h2', {}, '연결 점검 중…'))
  const map = await edufineMap()
  const states = await connectionStates()
  const checks = runChecks({
    hostPermission: true,
    pageScript: true,
    nx: nexacro(),
    map,
    ...states,
  })
  step('점검 ' + checks.map((c) => c.id + ':' + (c.ok === null ? '-' : c.ok ? 'o' : 'x')).join(' '))
  panel.show(
    h('h2', {}, '연결 점검'),
    h('p', { class: 'sub' }, '화면 이름표: ' + map.revision),
    h(
      'table',
      {},
      ...checks.map((c) =>
        h(
          'tr',
          {},
          h(
            'td',
            { class: c.ok === null ? 'na' : c.ok ? 'ok' : 'bad' },
            c.ok === null ? '–' : c.ok ? '✓' : '✕',
          ),
          h('td', {}, c.label, c.hint ? h('div', { class: 'sub' }, c.hint) : null),
        ),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        { class: 'btn', type: 'button', onclick: () => void saveDiagnostic(env) },
        '진단 파일 저장',
      ),
      h('button', { class: 'btn', type: 'button', onclick: () => env.home() }, '처음으로'),
    ),
  )
}

async function saveDiagnostic(env: TroubleEnv): Promise<void> {
  const { panel, step } = env
  step('진단 파일 저장')
  panel.show(h('h2', {}, '진단 파일을 만드는 중…'))
  const map = await edufineMap()
  const states = await connectionStates()
  const nx = nexacro()
  const checks = runChecks({ hostPermission: true, pageScript: true, nx, map, ...states })
  const diag = buildDiagnostic({
    nx,
    map,
    checks,
    log: [...env.log],
    origin: location.origin,
    extensionVersion: __VERSION__,
    now: new Date(),
    frames: frameSurvey(window as unknown as FrameWin),
  })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(diag, null, 1)], { type: 'application/json' }),
  )
  const a = h('a', {
    href: url,
    download: '똑딱-에듀파인-진단-' + stamp + '.json',
  }) as HTMLAnchorElement
  panel.root.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  panel.show(
    h('h2', {}, '진단 파일을 저장했어요'),
    h(
      'p',
      { class: 'sub' },
      '다운로드 폴더의 「똑딱-에듀파인-진단-…json」 파일을 보내 주세요. 화면 구조만 들어 있고 금액·이름·품명은 들어 있지 않아요.',
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => env.home() }, '처음으로'),
    ),
  )
}
