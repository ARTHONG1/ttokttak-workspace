/**
 * 에듀파인 품의 in the 똑딱 panel: takes the 품의 waiting from the web app or 똑딱작업실 and
 * shows it; one press of [K-에듀파인에 채우기] fills the 품의등록 screen. It opens the
 * 품의등록 screen by itself and goes on by itself once a budget line is picked. A paste and
 * a file stay folded away. It never saves or submits anything in K-에듀파인.
 */
import type { FeatureContext } from '../../core/feature'
import { edufineMap, nexacro } from '../../ext/edufine'
import { h, won, type Panel } from '../../ext/page-ui'
import { openPumuiMenu } from '../../sites/edufine/menu'
import { detectScreen, findWorkForm } from '../../sites/edufine/screen'
import type { ScreenMap } from '../../sites/edufine/screen-map'
import { applyFill, budgetMark, planFill } from './fill'
import { parsePumuiPackage, PUMUI_FILE_EXTENSION, type PumuiPackage } from './package'

/** 품목 rows already filled on this page, so a second press does not add them again */
const filled = new Set<string>()

// While the panel waits on the teacher (a budget line to pick, a budget to load), it looks
// at the screen once a second and moves on by itself when that part of the screen changes.
// It stops when the panel closes or shows anything else (the home, the self-check).
let watcher: ReturnType<typeof setInterval> | undefined
const stopWatch = (): void => {
  if (watcher !== undefined) clearInterval(watcher)
  watcher = undefined
}
function watchFor(panel: Panel, mark: () => string, then: () => void): void {
  stopWatch()
  const first = mark()
  const shown = panel.shown
  watcher = setInterval(() => {
    if (!panel.isOpen() || panel.shown !== shown) return stopWatch()
    if (mark() === first) return
    stopWatch()
    then()
  }, 1_000)
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
async function onPumuiScreen(ctx: FeatureContext, map: ScreenMap): Promise<boolean> {
  if (isPumuiScreen(map)) return true
  ctx.panel.show(
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
      if (opened) ctx.step('품의등록 메뉴 열기')
    }
    await new Promise((r) => setTimeout(r, 500))
    if (isPumuiScreen(map)) return true
  }
  return isPumuiScreen(map)
}

/** the task: find the waiting 품의 and show it, or say what to do first */
export async function openPumui(ctx: FeatureContext, work: string | null): Promise<void> {
  stopWatch()
  const { panel, step } = ctx
  step('에듀파인 품의')
  const map = await edufineMap()
  if (!(await onPumuiScreen(ctx, map))) {
    step('업무 화면 없음')
    panel.show(
      h('h2', {}, '품의등록 화면을 열어 주세요'),
      h('p', { class: 'sub' }, 'K-에듀파인에서 품의등록 화면을 연 뒤 [똑딱]을 다시 눌러 주세요.'),
      ctx.trouble(),
    )
    return
  }
  const waiting = work ?? (await ctx.peek())
  if (waiting) return preview(ctx, waiting, 'direct')
  panel.show(
    h('h2', {}, '품의를 찾는 중…'),
    h('p', { class: 'sub' }, '똑딱작업실에 물어보는 중이에요.'),
  )
  const r = await ctx.takeDesktop()
  // what was taken is kept, so it is shown and cleared like a waiting one
  if (r.ok && r.text) return preview(ctx, r.text, 'direct')
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
        { class: 'btn primary', type: 'button', onclick: () => void openPumui(ctx, null) },
        '다시 확인',
      ),
    ),
    other(ctx),
    ctx.trouble(),
  )
}

/** folded: paste or file, for a 품의 that came another way (a K-에듀파인 PC without internet) */
function other(ctx: FeatureContext): HTMLElement {
  const area = h('textarea', {
    placeholder: '똑딱작업실에서 복사한 품의를 여기에 붙여 넣어 주세요 (Ctrl+V)',
    'aria-label': '품의 붙여 넣기',
  }) as HTMLTextAreaElement
  area.addEventListener('input', () => {
    if (area.value.trim()) void preview(ctx, area.value, 'paste')
  })
  const file = h('input', {
    type: 'file',
    accept: PUMUI_FILE_EXTENSION + ',.json',
    hidden: true,
  }) as HTMLInputElement
  file.addEventListener('change', () => {
    const f = file.files?.[0]
    if (!f) return
    void f.text().then((t) => preview(ctx, t, 'file'))
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

const back = (ctx: FeatureContext): HTMLElement =>
  h(
    'div',
    { class: 'row' },
    h('button', { class: 'btn', type: 'button', onclick: () => ctx.home() }, '처음으로'),
  )

async function preview(
  ctx: FeatureContext,
  text: string,
  source: 'direct' | 'paste' | 'file',
): Promise<void> {
  stopWatch()
  const { panel, step } = ctx
  step('미리보기 ' + source)
  const parsed = parsePumuiPackage(text)
  if (!parsed.ok) {
    step('품의 거부')
    panel.show(h('h2', {}, '품의 확인'), h('div', { class: 'err' }, parsed.reason), back(ctx))
    return
  }
  const map = await edufineMap()
  const form = findWorkForm(nexacro(), map)
  if (!form) {
    step('업무 화면 없음')
    panel.show(
      h('h2', {}, '품의 확인'),
      h('div', { class: 'err' }, 'K-에듀파인 품의등록 화면을 연 뒤 다시 눌러 주세요.'),
      back(ctx),
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
          onclick: () => void fill(ctx, pkg, source),
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
      () => void preview(ctx, text, source),
    )
}

async function fill(ctx: FeatureContext, pkg: PumuiPackage, source: string): Promise<void> {
  stopWatch()
  const { panel, step } = ctx
  step('채우기 ' + source)
  const map = await edufineMap()
  const form = findWorkForm(nexacro(), map)
  if (!form) {
    panel.show(
      h('h2', {}, '채우기'),
      h('div', { class: 'err' }, 'K-에듀파인 품의등록 화면을 연 뒤 다시 눌러 주세요.'),
      back(ctx),
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
          { class: 'btn primary', type: 'button', onclick: () => void fill(ctx, pkg, source) },
          'K-에듀파인에 채우기',
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => panel.hide() }, '취소'),
      ),
    )
    watchFor(
      panel,
      () => budgetMark(findWorkForm(nexacro(), map) ?? form, map),
      () => void fill(ctx, pkg, source),
    )
    return
  }
  if (!res.ok) {
    step('채우기 실패 되돌림 ' + res.rolledBack)
    panel.show(h('h2', {}, '채우지 못했어요'), h('div', { class: 'err' }, res.reason), back(ctx))
    return
  }
  step('채우기 성공 ' + res.added)
  if (source === 'direct') await ctx.clear()
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
