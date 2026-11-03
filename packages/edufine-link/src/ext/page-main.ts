/**
 * Runs inside the K-에듀파인 page (MAIN world) on the origins the teacher allowed. It
 * shows the 똑딱 button; from there the teacher takes a 품의 (from 똑딱작업실, the web app,
 * a paste or a file), sees the preview and fills the 품의등록 screen, runs the self-check
 * or saves a diagnostic file. It never saves or submits anything in K-에듀파인.
 */
import { buildDiagnostic, runChecks, type DesktopState, type WebState } from '../diagnose'
import { applyFill, planFill } from '../fill'
import { findNexacro, frameSurvey, type FrameWin } from '../nexacro'
import { parsePumuiPackage, PUMUI_FILE_EXTENSION, type PumuiPackage } from '../pumui-package'
import { findWorkForm, type NexacroLike } from '../screen'
import { DEFAULT_SCREEN_MAP, type ScreenMap } from '../screen-map'
import type { Pending, Settings } from './messages'
import { call } from './page-channel'
import { h, mountPanel, won, type Panel } from './page-ui'

type Win = Window & { __ttokEdufineLoaded?: boolean }
const win = window as Win
/** K-에듀파인's app on this page or in a same-origin frame of it, looked up each time (it loads late) */
const nexacro = (): NexacroLike | undefined => findNexacro<NexacroLike>(window as unknown as FrameWin)

const log: string[] = []
const step = (s: string): void => {
  log.push(new Date().toISOString().slice(11, 19) + ' ' + s)
  if (log.length > 300) log.shift()
}
const filled = new Set<string>()

async function getMap(): Promise<ScreenMap> {
  const m = (await call<ScreenMap>('map:get')) as ScreenMap | { ok: false }
  return m && (m as ScreenMap).version === 1 ? (m as ScreenMap) : DEFAULT_SCREEN_MAP
}

async function getSettings(): Promise<Settings> {
  const s = (await call<Settings>('settings:get')) as Settings
  return s && typeof s.fillEnabled === 'boolean' ? s : { fillEnabled: false, origins: [] }
}

function start(): void {
  if (window.top !== window || win.__ttokEdufineLoaded) return
  win.__ttokEdufineLoaded = true
  step('시작 ' + __VERSION__)
  const panel = mountPanel(() => home(panel))
}

function home(panel: Panel): void {
  step('메뉴 열기')
  panel.show(
    h('h2', {}, '똑딱 에듀파인 연결'),
    h('p', { class: 'sub' }, '똑딱작업실에서 만든 품의를 이 품의등록 화면에 채워요. 저장과 결재는 선생님이 직접 해요.'),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => void choose(panel) }, '똑딱 품의 넣기'),
      h('button', { class: 'btn', type: 'button', onclick: () => void check(panel) }, '연결 점검'),
      h('button', { class: 'btn', type: 'button', onclick: () => void saveDiagnostic(panel) }, '진단 파일 저장'),
    ),
  )
}

async function choose(panel: Panel): Promise<void> {
  step('품의 고르기')
  const direct = (await call<Pending | null>('pumui:peek-direct')) as Pending | null
  const area = h('textarea', {
    placeholder: '똑딱작업실에서 복사한 품의를 여기에 붙여 넣어 주세요 (Ctrl+V)',
    'aria-label': '품의 붙여 넣기',
  }) as HTMLTextAreaElement
  area.addEventListener('input', () => {
    if (area.value.trim()) void preview(panel, area.value, 'paste')
  })
  const file = h('input', { type: 'file', accept: PUMUI_FILE_EXTENSION + ',.json', hidden: true }) as HTMLInputElement
  file.addEventListener('change', () => {
    const f = file.files?.[0]
    if (!f) return
    void f.text().then((t) => preview(panel, t, 'file'))
  })
  panel.show(
    h('h2', {}, '품의 가져오기'),
    direct && direct.text
      ? h(
          'div',
          { class: 'note' },
          (direct.from === 'web' ? '웹 앱' : '똑딱작업실') + '에서 보낸 품의가 기다리고 있어요. ',
          h('button', { class: 'btn primary', type: 'button', onclick: () => void preview(panel, direct.text, 'direct') }, '이 품의 보기'),
        )
      : null,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => void fromDesktop(panel) }, '똑딱작업실에서 받기'),
      h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, '파일에서 넣기'),
    ),
    area,
    file,
  )
  area.focus()
}

async function fromDesktop(panel: Panel): Promise<void> {
  step('프로그램에서 받기')
  const r = (await call<{ ok: boolean; text?: string | null; reason?: string; state?: string }>('pumui:take-desktop', undefined, 25_000)) as {
    ok: boolean
    text?: string | null
    reason?: string
    state?: string
  }
  if (!r.ok) {
    step('프로그램 연결 실패 ' + (r.state ?? ''))
    const hint =
      r.state === 'missing'
        ? '이 PC에 똑딱작업실이 설치돼 있지 않거나 연결 등록이 안 됐어요. 똑딱작업실을 설치(또는 다시 설치)해 주세요.'
        : r.state === 'off'
          ? '똑딱작업실을 켠 뒤 다시 눌러 주세요.'
          : '똑딱작업실이 답하지 않아요. 처음 연결할 때는 PC 보안 검사 때문에 오래 걸릴 수 있어요. 한 번 더 눌러 주세요.'
    panel.show(h('h2', {}, '품의 가져오기'), h('div', { class: 'err' }, hint), back(panel))
    return
  }
  if (!r.text) {
    panel.show(h('h2', {}, '품의 가져오기'), h('div', { class: 'note' }, '똑딱작업실에 보낼 품의가 없어요. 똑딱작업실에서 [K-에듀파인으로 보내기]를 먼저 눌러 주세요.'), back(panel))
    return
  }
  await preview(panel, r.text, 'desktop')
}

const back = (panel: Panel): HTMLElement =>
  h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => home(panel) }, '처음으로'))

async function preview(panel: Panel, text: string, source: 'direct' | 'desktop' | 'paste' | 'file'): Promise<void> {
  step('미리보기 ' + source)
  const parsed = parsePumuiPackage(text)
  if (!parsed.ok) {
    step('품의 거부')
    panel.show(h('h2', {}, '품의 확인'), h('div', { class: 'err' }, parsed.reason), back(panel))
    return
  }
  const map = await getMap()
  const settings = await getSettings()
  const form = findWorkForm(nexacro(), map)
  if (!form) {
    step('업무 화면 없음')
    panel.show(h('h2', {}, '품의 확인'), h('div', { class: 'err' }, 'K-에듀파인 품의등록 화면을 연 뒤 다시 눌러 주세요.'), back(panel))
    return
  }
  const pkg: PumuiPackage = parsed.pkg
  const plan = planFill(form, map, pkg)
  step('계획: 품목 ' + plan.rows.length + ', 막힘 ' + plan.blockers.length)
  const codes = new Map(plan.rows.map((r) => [r.item, r.unitCode]))
  const table = h(
    'table',
    {},
    h('tr', {}, h('th', {}, '품명'), h('th', {}, '단위'), h('th', { class: 'num' }, '수량'), h('th', { class: 'num' }, '단가')),
    ...pkg.items.map((it) =>
      h(
        'tr',
        {},
        h('td', {}, it.description),
        h('td', { class: codes.has(it) ? 'ok' : 'bad' }, it.unit + (codes.has(it) ? '' : ' ✕')),
        h('td', { class: 'num' }, String(it.quantity)),
        h('td', { class: 'num' }, won(it.unitPrice)),
      ),
    ),
  )
  const canFill = plan.blockers.length === 0 && settings.fillEnabled
  panel.show(
    h('h2', {}, pkg.title),
    h('p', { class: 'sub' }, '품목 ' + pkg.items.length + '개 · 합계 ' + won(pkg.total) + (plan.existingRows ? ' · 화면에 이미 ' + plan.existingRows + '줄 있음(그 뒤에 붙여요)' : '')),
    parsed.ageHours >= 24 ? h('div', { class: 'warn' }, parsed.ageHours + '시간 전에 만든 품의예요. 최신 품의가 맞는지 확인해 주세요.') : null,
    table,
    ...plan.blockers.map((b) => h('div', { class: 'err' }, b)),
    !settings.fillEnabled
      ? h('div', { class: 'note' }, '지금은 미리보기 모드예요. 내용을 확인하셨다면 크롬 오른쪽 위 확장 프로그램 아이콘 → 똑딱 에듀파인 연결 → [실제로 채우기]를 켜 주세요.')
      : null,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', disabled: !canFill, onclick: () => void fill(panel, pkg, source) }, '채우기'),
      h('button', { class: 'btn', type: 'button', onclick: () => home(panel) }, '취소'),
    ),
  )
}

async function fill(panel: Panel, pkg: PumuiPackage, source: string): Promise<void> {
  step('채우기 ' + source)
  const map = await getMap()
  const form = findWorkForm(nexacro(), map)
  if (!form) {
    panel.show(h('h2', {}, '채우기'), h('div', { class: 'err' }, 'K-에듀파인 품의등록 화면을 연 뒤 다시 눌러 주세요.'), back(panel))
    return
  }
  const res = applyFill(form, map, planFill(form, map, pkg), filled)
  if (!res.ok) {
    step('채우기 실패 되돌림 ' + res.rolledBack)
    panel.show(h('h2', {}, '채우지 못했어요'), h('div', { class: 'err' }, res.reason), back(panel))
    return
  }
  step('채우기 성공 ' + res.added)
  if (source === 'direct') await call('pumui:clear-direct')
  panel.show(
    h('h2', {}, '채웠어요'),
    h('div', { class: 'done' }, '품목 ' + res.added + '줄과 제목·개요를 채웠어요(합계 ' + won(res.gridTotal) + '). 화면에서 확인한 뒤 K-에듀파인 [저장]을 눌러 주세요.'),
    back(panel),
  )
}

async function connectionStates(): Promise<{ desktop: DesktopState; web: WebState }> {
  // the first native host start can wait on the PC's security scan
  const d = (await call<{ ok: boolean; state?: string }>('desktop:ping', undefined, 20_000)) as { ok: boolean; state?: string }
  const w = (await call<{ state: WebState }>('web:state')) as { state?: WebState }
  const desktop: DesktopState = d.ok ? 'ok' : d.state === 'missing' ? 'missing' : d.state === 'off' ? 'off' : 'unknown'
  return { desktop, web: w.state ?? 'unknown' }
}

async function check(panel: Panel): Promise<void> {
  step('연결 점검')
  const map = await getMap()
  const states = await connectionStates()
  const checks = runChecks({ hostPermission: true, pageScript: true, nx: nexacro(), map, ...states })
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
          h('td', { class: c.ok === null ? 'na' : c.ok ? 'ok' : 'bad' }, c.ok === null ? '–' : c.ok ? '✓' : '✕'),
          h('td', {}, c.label, c.hint ? h('div', { class: 'sub' }, c.hint) : null),
        ),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => void saveDiagnostic(panel) }, '진단 파일 저장'),
      h('button', { class: 'btn', type: 'button', onclick: () => home(panel) }, '처음으로'),
    ),
  )
}

async function saveDiagnostic(panel: Panel): Promise<void> {
  step('진단 파일 저장')
  const map = await getMap()
  const states = await connectionStates()
  const nx = nexacro()
  const checks = runChecks({ hostPermission: true, pageScript: true, nx, map, ...states })
  const diag = buildDiagnostic({
    nx,
    map,
    checks,
    log,
    origin: location.origin,
    extensionVersion: __VERSION__,
    now: new Date(),
    frames: frameSurvey(window as unknown as FrameWin),
  })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const url = URL.createObjectURL(new Blob([JSON.stringify(diag, null, 1)], { type: 'application/json' }))
  const a = h('a', { href: url, download: '똑딱-에듀파인-진단-' + stamp + '.json' }) as HTMLAnchorElement
  panel.root.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  panel.show(
    h('h2', {}, '진단 파일을 저장했어요'),
    h('p', { class: 'sub' }, '다운로드 폴더의 「똑딱-에듀파인-진단-…json」 파일을 보내 주세요. 화면 구조만 들어 있고 금액·이름·품명은 들어 있지 않아요.'),
    back(panel),
  )
}

start()

