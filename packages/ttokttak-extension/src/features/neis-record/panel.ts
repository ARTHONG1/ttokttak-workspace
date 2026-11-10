/**
 * 생기부 나이스 입력 in the 똑딱 panel: takes the class's 세특 or 행발 waiting from the web app
 * or 똑딱작업실 and shows it. The teacher opens the NEIS entry screen and clicks the first
 * student's row; one press of [나이스에 채우기] then types every student's text into the
 * grid's right-end cell, row after row. It stops rather than write into the wrong row and
 * goes on from where it stopped. It never saves anything in NEIS.
 */
import type { FeatureContext } from '../../core/feature'
import { h } from '../../ext/page-ui'
import { gridSurvey, selectedRow } from '../../sites/neis/grid'
import { fillGrid, type FillOptions, type FillResult } from './fill'
import {
  NEIS_BYTE_LIMIT,
  neisBytes,
  parseRecordPackage,
  RECORD_MODE_NAME,
  writtenCount,
  type RecordPackage,
} from './package'

type Source = 'direct' | 'paste'

const SEND_FIRST =
  '똑딱작업실 생기부에서 [나이스로 보내기]를 누른 뒤, 이 화면의 [똑딱]을 다시 눌러 주세요.'

const SCREEN_NAME = {
  subject: '교과 세특(세부능력 및 특기사항)',
  behavior: '행동특성 및 종합의견',
} as const

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** a press that leaves the keyboard focus where it is in the NEIS grid */
const keepFocus = (e: Event): void => e.preventDefault()

/** the task: find the waiting work and show it, or say what to do first */
export async function openRecord(ctx: FeatureContext, work: string | null): Promise<void> {
  const { panel, step } = ctx
  step('생기부 나이스 입력')
  const waiting = work ?? (await ctx.peek())
  if (waiting) return preview(ctx, waiting, 'direct')
  panel.show(
    h('h2', {}, '보낸 작업을 찾는 중…'),
    h('p', { class: 'sub' }, '똑딱작업실에 물어보는 중이에요.'),
  )
  const r = await ctx.takeDesktop()
  // what was taken is kept, so it is shown and cleared like a waiting one
  if (r.ok && r.text) return preview(ctx, r.text, 'direct')
  step('보낸 작업 없음 ' + (r.ok ? 'empty' : (r.state ?? '')))
  panel.show(
    h('h2', {}, '아직 받은 생기부 작업이 없어요'),
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
        { class: 'btn primary', type: 'button', onclick: () => void openRecord(ctx, null) },
        '다시 확인',
      ),
    ),
    other(ctx),
    trouble(ctx),
  )
}

/** folded: a paste, for work that came another way */
function other(ctx: FeatureContext): HTMLElement {
  const area = h('textarea', {
    placeholder: '똑딱작업실 생기부에서 복사한 작업을 여기에 붙여 넣어 주세요 (Ctrl+V)',
    'aria-label': '생기부 작업 붙여 넣기',
  }) as HTMLTextAreaElement
  area.addEventListener('input', () => {
    if (area.value.trim()) void preview(ctx, area.value, 'paste')
  })
  return h('details', {}, h('summary', {}, '복사한 생기부 작업 넣기'), area)
}

/** folded: the grid's shape (no name, no text) to send when filling does not work */
function trouble(ctx: FeatureContext): HTMLElement {
  const out = h('textarea', { readOnly: true, hidden: true, 'aria-label': '화면 진단' })
  const copy = async (): Promise<void> => {
    ctx.step('화면 진단')
    const report = JSON.stringify(
      { extension: __VERSION__, at: new Date().toISOString(), grid: gridSurvey(document) },
      null,
      1,
    )
    ;(out as HTMLTextAreaElement).value = report
    out.hidden = false
    try {
      await navigator.clipboard.writeText(report)
      note.textContent = '복사했어요. 그대로 붙여 넣어 보내 주세요.'
    } catch {
      note.textContent = '아래 글을 모두 골라 복사해 보내 주세요.'
    }
  }
  const note = h('p', { class: 'sub' }, '표의 구조만 담겨요. 학생 이름과 글은 들어가지 않아요.')
  return h(
    'details',
    {},
    h('summary', {}, '문제가 있을 때'),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => void copy() }, '화면 진단 복사'),
    ),
    note,
    out,
  )
}

const back = (ctx: FeatureContext): HTMLElement =>
  h(
    'div',
    { class: 'row' },
    h('button', { class: 'btn', type: 'button', onclick: () => ctx.home() }, '처음으로'),
  )

const clip = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + '…' : text

async function preview(ctx: FeatureContext, text: string, source: Source): Promise<void> {
  const { panel, step } = ctx
  step('미리보기 ' + source)
  const parsed = parseRecordPackage(text)
  if (!parsed.ok) {
    step('작업 거부')
    panel.show(
      h('h2', {}, '생기부 작업 확인'),
      h('div', { class: 'err' }, parsed.reason),
      back(ctx),
    )
    return
  }
  const pkg = parsed.pkg
  const modeName = RECORD_MODE_NAME[pkg.mode]
  const written = writtenCount(pkg.students)
  const empty = pkg.students.length - written
  const over = pkg.students.filter((s) => neisBytes(s.text) > NEIS_BYTE_LIMIT).length
  const named = pkg.students.some((s) => s.name)

  const checkNames = h('input', { type: 'checkbox', checked: named, disabled: !named })
  const append = h('input', { type: 'radio', name: 'ttok-filled', checked: pkg.mode === 'subject' })
  const replace = h('input', {
    type: 'radio',
    name: 'ttok-filled',
    checked: pkg.mode !== 'subject',
  })
  const optionsNow = (): Omit<FillOptions, 'from'> => ({
    checkNames: (checkNames as HTMLInputElement).checked,
    whenFilled: (append as HTMLInputElement).checked ? 'append' : 'replace',
  })

  panel.show(
    h('h2', {}, pkg.title),
    h(
      'p',
      { class: 'sub' },
      modeName +
        ' · 글이 있는 학생 ' +
        written +
        '명' +
        (empty ? ' · 글이 없는 ' + empty + '명의 줄은 건너뛰어요' : ''),
    ),
    parsed.ageHours >= 24
      ? h(
          'div',
          { class: 'warn' },
          parsed.ageHours + '시간 전에 보낸 작업이에요. 최신 내용이 맞는지 확인해 주세요.',
        )
      : null,
    over
      ? h(
          'div',
          { class: 'warn' },
          over + '명의 글이 ' + NEIS_BYTE_LIMIT.toLocaleString('ko-KR') + '바이트를 넘어요.',
        )
      : null,
    h(
      'table',
      {},
      h(
        'tr',
        {},
        h('th', { class: 'num' }, '#'),
        h('th', {}, '이름'),
        h('th', {}, '글'),
        h('th', { class: 'num' }, '바이트'),
      ),
      ...pkg.students.map((s, i) =>
        h(
          'tr',
          {},
          h('td', { class: 'num' }, String(i + 1)),
          h('td', {}, s.name || '–'),
          h('td', { class: s.text ? '' : 'na' }, s.text ? clip(s.text, 22) : '건너뜀'),
          h(
            'td',
            { class: 'num' + (neisBytes(s.text) > NEIS_BYTE_LIMIT ? ' bad' : '') },
            s.text ? neisBytes(s.text).toLocaleString('ko-KR') : '',
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'note' },
      '나이스에서 ' +
        SCREEN_NAME[pkg.mode] +
        ' 입력 화면을 열고, 표에서 1번째 학생 줄을 누른 뒤 [나이스에 채우기]를 눌러 주세요. 각 줄의 맨 오른쪽 칸에 차례로 넣어요.',
    ),
    h(
      'p',
      {},
      h(
        'label',
        {},
        checkNames,
        named
          ? ' 줄에 같은 이름이 보일 때만 넣기 (다르면 멈춰요)'
          : ' 이름이 없는 작업이라 순서대로만 넣어요',
      ),
    ),
    h(
      'p',
      {},
      '칸에 이미 글이 있으면: ',
      h('label', {}, append, ' 뒤에 이어 쓰기 '),
      h('label', {}, replace, ' 새 글로 바꾸기'),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onmousedown: keepFocus,
          onclick: () => void run(ctx, pkg, { ...optionsNow(), from: 0 }, source, text, 0),
        },
        '나이스에 채우기',
      ),
      h('button', { class: 'btn', type: 'button', onclick: () => panel.hide() }, '취소'),
    ),
    h(
      'p',
      { class: 'sub' },
      '채우는 동안에는 마우스와 키보드를 만지지 마세요. 채운 뒤 화면을 확인하고 나이스 [저장]은 선생님이 직접 눌러 주세요.',
    ),
    trouble(ctx),
  )
}

async function run(
  ctx: FeatureContext,
  pkg: RecordPackage,
  options: FillOptions,
  source: Source,
  text: string,
  /** rows filled by the runs before this one */
  already: number,
): Promise<void> {
  const { panel, step } = ctx
  const modeName = RECORD_MODE_NAME[pkg.mode]
  const againLabel = (from: number, done: number): string =>
    from === 0 && done === 0 ? '나이스에 채우기' : '이어서 채우기'
  const again = (from: number, done: number): HTMLElement =>
    h(
      'button',
      {
        class: 'btn primary',
        type: 'button',
        onmousedown: keepFocus,
        onclick: () => void run(ctx, pkg, { ...options, from }, source, text, done),
      },
      againLabel(from, done),
    )
  const restart = (): HTMLElement =>
    h(
      'button',
      { class: 'btn', type: 'button', onclick: () => void preview(ctx, text, source) },
      '처음 화면으로',
    )
  const target = pkg.students[options.from]
  const targetName = options.from + 1 + '번째 학생' + (target?.name ? '(' + target.name + ')' : '')
  if (!selectedRow(document)) {
    step('선택된 줄 없음')
    panel.show(
      h('h2', {}, '학생 줄을 먼저 눌러 주세요'),
      h(
        'div',
        { class: 'note' },
        '나이스 표에서 ' + targetName + '의 줄을 한 번 누른 뒤 아래 버튼을 눌러 주세요.',
      ),
      h('div', { class: 'row' }, again(options.from, already), restart()),
      trouble(ctx),
    )
    return
  }
  step('채우기 ' + source + ' ' + options.from + '부터')
  let stop = false
  const line = h('p', {}, '준비 중…')
  panel.show(
    h('h2', {}, '나이스에 채우는 중…'),
    line,
    h('div', { class: 'warn' }, '끝날 때까지 마우스와 키보드를 만지지 마세요.'),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onmousedown: keepFocus,
          onclick: () => {
            stop = true
          },
        },
        '멈추기',
      ),
    ),
  )
  let result: FillResult
  try {
    result = await fillGrid(document, pkg.students, options, {
      wait,
      shouldStop: () => stop,
      panelHost: panel.root.host,
      progress: (i, s) => {
        line.textContent = i + 1 + ' / ' + pkg.students.length + (s.name ? ' · ' + s.name : '')
      },
    })
  } catch (e) {
    step('채우기 오류 ' + String(e))
    panel.show(
      h('h2', {}, '채우지 못했어요'),
      h('div', { class: 'err' }, '나이스 화면에 넣는 중에 문제가 생겼어요. 화면을 확인해 주세요.'),
      h('div', { class: 'row' }, restart()),
      trouble(ctx),
    )
    return
  }
  const done = already + result.written
  if (!result.stop) {
    step('채우기 성공 ' + done)
    if (source === 'direct') await ctx.clear()
    panel.show(
      h('h2', {}, '채웠어요'),
      h(
        'div',
        { class: 'done' },
        done +
          '명의 ' +
          modeName +
          '을 나이스 표에 넣었어요. 화면에서 확인한 뒤 나이스 [저장]을 눌러 주세요.',
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => panel.hide() }, '확인'),
      ),
    )
    return
  }
  step('멈춤 ' + result.stop.reason + ' ' + result.next)
  const next = pkg.students[result.next]
  const nextName = result.next + 1 + '번째 학생' + (next?.name ? '(' + next.name + ')' : '')
  panel.show(
    h('h2', {}, done > 0 ? done + '명까지 넣고 멈췄어요' : '넣지 않고 멈췄어요'),
    h('div', { class: result.stop.reason === 'stopped' ? 'note' : 'err' }, result.stop.message),
    h(
      'div',
      { class: 'note' },
      '나이스 표에서 ' +
        nextName +
        '의 줄을 누른 뒤 [' +
        againLabel(result.next, done) +
        ']를 누르면 그 학생부터 넣어요.',
    ),
    result.stop.reason === 'name'
      ? h(
          'p',
          { class: 'sub' },
          '줄은 맞는데 이름 표시가 달라서 멈춘 것이라면, [처음 화면으로]에서 「같은 이름이 보일 때만 넣기」를 끄고 다시 해 주세요.',
        )
      : null,
    h('div', { class: 'row' }, again(result.next, done), restart()),
    trouble(ctx),
  )
}
