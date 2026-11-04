/**
 * Runs inside every https://*.go.kr page (MAIN world). It shows the 똑딱 button only where
 * K-에듀파인 is running. Pressing it takes the 품의 waiting from the web app or 똑딱작업실
 * by itself and shows it; one press of [K-에듀파인에 채우기] fills the 품의등록 screen.
 * A paste, a file, the self-check and the diagnostic file stay folded away. It never
 * saves or submits anything in K-에듀파인.
 */
import {
  buildDiagnostic,
  runChecks,
  type DesktopState,
  type WebState,
} from '../sites/edufine/diagnose'
import { applyFill, budgetMark, planFill } from '../features/edufine-pumui/fill'
import { findNexacro, frameSurvey, type FrameWin } from '../sites/edufine/nexacro'
import {
  parsePumuiPackage,
  PUMUI_FILE_EXTENSION,
  type PumuiPackage,
} from '../features/edufine-pumui/package'
import { openPumuiMenu } from '../sites/edufine/menu'
import { detectScreen, findWorkForm, type NexacroLike } from '../sites/edufine/screen'
import { DEFAULT_SCREEN_MAP, type ScreenMap } from '../sites/edufine/screen-map'
import { PAGE_TAG, type Pending } from './messages'
import { call } from './page-channel'
import { h, mountPanel, won, type Panel } from './page-ui'

type Win = Window & { __ttokEdufineLoaded?: boolean }
const win = window as Win
/** K-에듀파인's app on this page or in a same-origin frame of it, looked up each time (it loads late) */
const nexacro = (): NexacroLike | undefined =>
  findNexacro<NexacroLike>(window as unknown as FrameWin)

const log: string[] = []
const step = (s: string): void => {
  log.push(new Date().toISOString().slice(11, 19) + ' ' + s)
  if (log.length > 300) log.shift()
}
const filled = new Set<string>()

/** how long a go.kr page is watched for K-에듀파인 (it starts after login, sometimes late) */
const WATCH_MS = 30 * 60_000
const WATCH_EVERY_MS = 1_000

async function getMap(): Promise<ScreenMap> {
  const m = (await call<ScreenMap>('map:get')) as ScreenMap | { ok: false }
  return m && (m as ScreenMap).version === 1 ? (m as ScreenMap) : DEFAULT_SCREEN_MAP
}

// While the panel waits on the teacher (a budget line to pick, a budget to load), it looks
// at the screen once a second and moves on by itself when that part of the screen changes.
let watcher: ReturnType<typeof setInterval> | undefined
const stopWatch = (): void => {
  if (watcher !== undefined) clearInterval(watcher)
  watcher = undefined
}
function watchFor(panel: Panel, mark: () => string, then: () => void): void {
  stopWatch()
  const first = mark()
  watcher = setInterval(() => {
    if (!panel.isOpen()) return stopWatch()
    if (mark() === first) return
    stopWatch()
    then()
  }, 1_000)
}

function start(): void {
  if (window.top !== window || win.__ttokEdufineLoaded) return
  win.__ttokEdufineLoaded = true
  const began = Date.now()
  const watch = (): void => {
    if (nexacro()) {
      step('시작 ' + __VERSION__)
      const panel = mountPanel(() => void open(panel))
      // remember this K-에듀파인 so [K-에듀파인으로 보내기] can bring it forward next time
      void call('edufine:seen')
      window.addEventListener('message', (e) => {
        const d = e.data
        if (e.source === window && d && d[PAGE_TAG] === 'cmd' && d.type === 'open') void open(panel)
      })
      // a send opened this tab (or brought it up while it was loading): show the 품의 now
      void call<boolean>('panel:auto').then((auto) => {
        if (auto === true) void open(panel)
      })
      return
    }
    if (Date.now() - began < WATCH_MS) setTimeout(watch, WATCH_EVERY_MS)
  }
  watch()
}

const SEND_FIRST =
  '똑딱작업실 품의서 생성에서 [K-에듀파인으로 보내기]를 누른 뒤, 이 화면의 [똑딱]을 다시 눌러 주세요.'

const isPumuiScreen = (map: ScreenMap): boolean => {
  const form = findWorkForm(nexacro(), map)
  return !!form && detectScreen(form, map).kind === 'pumui'
}

/**
 * On another K-에듀파인 screen (or right after login), open the 품의등록 menu with
 * K-에듀파인's own menu function and wait for the screen; false when it does not come.
 */
async function onPumuiScreen(panel: Panel, map: ScreenMap): Promise<boolean> {
  if (isPumuiScreen(map)) return true
  panel.show(
    h('h2', {}, '품의등록 화면을 여는 중…'),
    h('p', { class: 'sub' }, 'K-에듀파인 메뉴에서 품의등록을 열고 있어요.'),
  )
  const until = Date.now() + 20_000
  let opened = false
  while (Date.now() < until) {
    if (!opened) {
      const r = openPumuiMenu(nexacro(), map)
      if (r === 'unavailable') break
      opened = r === 'opened'
      if (opened) step('품의등록 메뉴 열기')
    }
    await new Promise((r) => setTimeout(r, 500))
    if (isPumuiScreen(map)) return true
  }
  return isPumuiScreen(map)
}

/** the 똑딱 button: find the waiting 품의 and show it, or say what to do first */
async function open(panel: Panel): Promise<void> {
  stopWatch()
  step('열기')
  const map = await getMap()
  if (!(await onPumuiScreen(panel, map))) {
    step('업무 화면 없음')
    panel.show(
      h('h2', {}, '품의등록 화면을 열어 주세요'),
      h('p', { class: 'sub' }, 'K-에듀파인에서 품의등록 화면을 연 뒤 [똑딱]을 다시 눌러 주세요.'),
      more(panel),
    )
    return
  }
  const direct = (await call<Pending | null>('pumui:peek-direct')) as Pending | null
  if (direct && direct.text) return preview(panel, direct.text, 'direct')
  panel.show(
    h('h2', {}, '품의를 찾는 중…'),
    h('p', { class: 'sub' }, '똑딱작업실에 물어보는 중이에요.'),
  )
  const r = (await call<{ ok: boolean; text?: string | null; state?: string }>(
    'pumui:take-desktop',
    undefined,
    25_000,
  )) as { ok: boolean; text?: string | null; state?: string }
  // the background keeps what it took, so it is shown and cleared like a waiting one
  if (r.ok && r.text) return preview(panel, r.text, 'direct')
  step('보낸 품의 없음 ' + (r.ok ? 'empty' : (r.state ?? '')))
  panel.show(
    h('h2', {}, '아직 받은 품의가 없어요'),
    h('div', { class: 'note' }, SEND_FIRST),
    !r.ok && r.state === 'off'
      ? h(
          'p',
          { class: 'sub' },
          '프로그램으로 만들었다면 똑딱작업실이 켜져 있어야 가져올 수 있어요.',
        )
      : null,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        { class: 'btn primary', type: 'button', onclick: () => void open(panel) },
        '다시 확인',
      ),
    ),
    other(panel),
    more(panel),
  )
}

/** folded: paste or file, for a 품의 that came another way (a K-에듀파인 PC without internet) */
function other(panel: Panel): HTMLElement {
  const area = h('textarea', {
    placeholder: '똑딱작업실에서 복사한 품의를 여기에 붙여 넣어 주세요 (Ctrl+V)',
    'aria-label': '품의 붙여 넣기',
  }) as HTMLTextAreaElement
  area.addEventListener('input', () => {
    if (area.value.trim()) void preview(panel, area.value, 'paste')
  })
  const file = h('input', {
    type: 'file',
    accept: PUMUI_FILE_EXTENSION + ',.json',
    hidden: true,
  }) as HTMLInputElement
  file.addEventListener('change', () => {
    const f = file.files?.[0]
    if (!f) return
    void f.text().then((t) => preview(panel, t, 'file'))
  })
  return h(
    'details',
    {},
    h('summary', {}, '복사했거나 파일로 받은 품의 넣기'),
    area,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        { class: 'btn', type: 'button', onclick: () => file.click() },
        '품의 파일 고르기',
      ),
    ),
    file,
  )
}

/** folded: the self-check and the diagnostic file, for when something does not work */
function more(panel: Panel): HTMLElement {
  return h(
    'details',
    {},
    h('summary', {}, '문제가 있을 때'),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => void check(panel) }, '연결 점검'),
      h(
        'button',
        { class: 'btn', type: 'button', onclick: () => void saveDiagnostic(panel) },
        '진단 파일 저장',
      ),
    ),
  )
}

const back = (panel: Panel): HTMLElement =>
  h(
    'div',
    { class: 'row' },
    h('button', { class: 'btn', type: 'button', onclick: () => void open(panel) }, '처음으로'),
  )

async function preview(
  panel: Panel,
  text: string,
  source: 'direct' | 'desktop' | 'paste' | 'file',
): Promise<void> {
  stopWatch()
  step('미리보기 ' + source)
  const parsed = parsePumuiPackage(text)
  if (!parsed.ok) {
    step('품의 거부')
    panel.show(h('h2', {}, '품의 확인'), h('div', { class: 'err' }, parsed.reason), back(panel))
    return
  }
  const map = await getMap()
  const form = findWorkForm(nexacro(), map)
  if (!form) {
    step('업무 화면 없음')
    panel.show(
      h('h2', {}, '품의 확인'),
      h('div', { class: 'err' }, 'K-에듀파인 품의등록 화면을 연 뒤 다시 눌러 주세요.'),
      back(panel),
    )
    return
  }
  const pkg: PumuiPackage = parsed.pkg
  const plan = planFill(form, map, pkg)
  step('계획: 품목 ' + plan.rows.length + ', 막힘 ' + plan.blockers.length)
  const codes = new Map(plan.rows.map((r) => [r.item, r.unitCode]))
  const table = h(
    'table',
    {},
    h(
      'tr',
      {},
      h('th', {}, '품명'),
      h('th', {}, '단위'),
      h('th', { class: 'num' }, '수량'),
      h('th', { class: 'num' }, '단가'),
    ),
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
  panel.show(
    h('h2', {}, pkg.title),
    h(
      'p',
      { class: 'sub' },
      '품목 ' +
        pkg.items.length +
        '개 · 합계 ' +
        won(pkg.total) +
        (plan.existingRows
          ? ' · 화면에 이미 ' + plan.existingRows + '줄 있음(그 뒤에 붙여요)'
          : ''),
    ),
    parsed.ageHours >= 24
      ? h(
          'div',
          { class: 'warn' },
          parsed.ageHours + '시간 전에 만든 품의예요. 최신 품의가 맞는지 확인해 주세요.',
        )
      : null,
    table,
    ...plan.blockers.map((b) => h('div', { class: 'err' }, b)),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          disabled: plan.blockers.length > 0,
          onclick: () => void fill(panel, pkg, source),
        },
        'K-에듀파인에 채우기',
      ),
      h('button', { class: 'btn', type: 'button', onclick: () => panel.hide() }, '취소'),
    ),
    h(
      'p',
      { class: 'sub' },
      '채운 뒤 화면을 확인하고 K-에듀파인 [저장]은 선생님이 직접 눌러 주세요.',
    ),
  )
  // a budget not loaded yet (or units not shown): show the 품의 again once the screen has it
  if (plan.blockers.length)
    watchFor(
      panel,
      () => {
        const now = findWorkForm(nexacro(), map)
        return now ? planFill(now, map, pkg).blockers.join('|') : '-'
      },
      () => void preview(panel, text, source),
    )
}

async function fill(panel: Panel, pkg: PumuiPackage, source: string): Promise<void> {
  stopWatch()
  step('채우기 ' + source)
  const map = await getMap()
  const form = findWorkForm(nexacro(), map)
  if (!form) {
    panel.show(
      h('h2', {}, '채우기'),
      h('div', { class: 'err' }, 'K-에듀파인 품의등록 화면을 연 뒤 다시 눌러 주세요.'),
      back(panel),
    )
    return
  }
  const res = applyFill(form, map, planFill(form, map, pkg), filled)
  if (!res.ok && res.needsBudget) {
    // K-에듀파인 adds a 품목 row only under a chosen budget line: wait for the choice, then
    // fill without another press (the teacher already pressed 채우기 once)
    step('예산 줄 기다림')
    panel.show(
      h('h2', {}, '예산 줄을 골라 주세요'),
      h(
        'div',
        { class: 'note' },
        '화면의 예산 내역에서 쓸 예산 줄을 고르면 바로 이어서 채워요. 이 창은 그대로 두세요.',
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'btn primary', type: 'button', onclick: () => void fill(panel, pkg, source) },
          'K-에듀파인에 채우기',
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => panel.hide() }, '취소'),
      ),
    )
    watchFor(
      panel,
      () => budgetMark(findWorkForm(nexacro(), map) ?? form, map),
      () => void fill(panel, pkg, source),
    )
    return
  }
  if (!res.ok) {
    step('채우기 실패 되돌림 ' + res.rolledBack)
    panel.show(h('h2', {}, '채우지 못했어요'), h('div', { class: 'err' }, res.reason), back(panel))
    return
  }
  step('채우기 성공 ' + res.added)
  if (source === 'direct') await call('pumui:clear-direct')
  panel.show(
    h('h2', {}, '채웠어요'),
    h(
      'div',
      { class: 'done' },
      '품목 ' +
        res.added +
        '줄과 제목·개요를 채웠어요(합계 ' +
        won(res.gridTotal) +
        '). 화면에서 확인한 뒤 K-에듀파인 [저장]을 눌러 주세요.',
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => panel.hide() }, '확인'),
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

async function check(panel: Panel): Promise<void> {
  stopWatch()
  step('연결 점검')
  const map = await getMap()
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
        { class: 'btn', type: 'button', onclick: () => void saveDiagnostic(panel) },
        '진단 파일 저장',
      ),
      h('button', { class: 'btn', type: 'button', onclick: () => void open(panel) }, '처음으로'),
    ),
  )
}

async function saveDiagnostic(panel: Panel): Promise<void> {
  stopWatch()
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
    back(panel),
  )
}

start()
