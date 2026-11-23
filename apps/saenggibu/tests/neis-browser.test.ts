import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { buildRecordPackage } from '../src/shared/record-package'
import { PlaywrightNeisDriver, findBrowser, isNeisTarget } from '../src/main/neis-driver'

/**
 * 나이스로 보내기 in a real Chromium against a fake NEIS grid (tests/fixtures/fake-neis-grid.ts),
 * every page request answered locally: not a school server. Skipped when no Chrome, Edge or
 * Playwright Chromium is installed.
 */
let browser: Browser
let context: BrowserContext
let script: string
const browserPath =
  findBrowser() ?? (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined)
beforeAll(async () => {
  const result = await build({
    stdin: {
      contents:
        "export { mountFakeNeis } from './fake-neis-grid'\nexport { installFakeNeisData } from './fake-neis-data'",
      resolveDir: resolve(__dirname, 'fixtures'),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'fixture',
  })
  script = result.outputFiles[0].text
  browser = await chromium.launch({ executablePath: browserPath, headless: true })
})
afterEach(async () => {
  await context?.close()
})
afterAll(async () => {
  await browser?.close()
})

async function setup(
  url: string,
  waitTimeoutMs = 3_500,
): Promise<{ page: Page; driver: PlaywrightNeisDriver }> {
  context = await browser.newContext()
  await context.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }),
  )
  const page = await context.newPage()
  await page.goto(url)
  await page.addScriptTag({ content: script })
  return {
    page,
    driver: new PlaywrightNeisDriver(
      { userDataDir: 'unused', waitTimeoutMs, pollMs: 25 },
      async () => context,
    ),
  }
}
const record = () =>
  buildRecordPackage({
    mode: 'subject',
    title: '과학 세특',
    students: [
      { name: '김하늘', text: '관찰함.' },
      { name: '이바다', text: '탐구함.' },
    ],
  })
async function neis(page: Page, stuck = false) {
  await page.evaluate((stuck) => {
    const w = window as any
    w.grid = w.fixture.mountFakeNeis(
      document,
      [{ name: '김하늘' }, { name: '이바다' }],
      stuck ? { stuckAt: 0 } : {},
    )
    w.grid.select(0)
  }, stuck)
}

describe.skipIf(!browserPath)('나이스로 보내기 실제 Chromium 시험 (학교 서버 아님)', () => {
  it('동시 전송은 하나만 실행한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const results = await Promise.all([driver.send(record()), driver.send(record())])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: expect.stringContaining('진행 중') })
    expect(await page.evaluate(() => (window as any).grid.edits())).toBe(2)
  })

  // 나이스에서 가져오기: the 누가기록 screen's data, not what its grid draws
  it('나이스 누가기록 화면의 학급 명단과 누가기록을 읽는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await page.evaluate(() => {
      const w = window as any
      w.fixture.installFakeNeisData(window, {
        students: [
          { no: '1', name: '김하늘' },
          { no: '2', name: '이바다' },
        ],
        numbered: true,
        records: [{ no: '2', date: '20260310', text: '화분을 돌봄.' }],
      })
    })
    expect(await driver.readClass()).toEqual({
      ok: true,
      recordsFor: 'all',
      recordsRead: 1,
      unplaced: 0,
      students: [
        { cls: '3', no: '1', name: '김하늘', records: [] },
        {
          cls: '3',
          no: '2',
          name: '이바다',
          records: [{ date: '20260310', text: '화분을 돌봄.' }],
        },
      ],
    })
  })

  it('학급 명단이 없는 나이스 화면이면 누가기록 화면을 열라고 안내한다', async () => {
    const { driver } = await setup('https://sen.neis.go.kr/')
    expect(await driver.readClass()).toMatchObject({
      ok: false,
      message: expect.stringContaining('누가기록'),
    })
  })

  it('나이스가 열려 있지 않으면 로그인부터 안내한다', async () => {
    const { driver } = await setup('https://example.com/')
    expect(await driver.readClass()).toMatchObject({
      ok: false,
      message: expect.stringContaining('로그인'),
    })
  })

  it('사용자가 닫은 전용 브라우저를 다음 요청에서 다시 연다', async () => {
    let launches = 0
    const driver = new PlaywrightNeisDriver({ userDataDir: 'unused', pollMs: 25 }, async () => {
      launches++
      context = await browser.newContext()
      await context.route('**/*', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<html>로그인 화면</html>' }),
      )
      return context
    })
    const stages: string[] = []
    const sending = driver.send(record(), { onStage: (stage) => stages.push(stage) })
    await expect.poll(() => stages.at(-1)).toBe('waiting-login')
    await context.close()
    expect(await sending).toMatchObject({ ok: false, reason: expect.stringContaining('닫았어요') })
    expect(await driver.readClass()).toMatchObject({ ok: false })
    expect(launches).toBe(2)
  })

  it('시작 중 취소한 브라우저가 뒤늦게 열려도 다음 요청에서 사용하지 않는다', async () => {
    const { page } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const late = await browser.newContext()
    let finishLaunch!: (value: BrowserContext) => void
    const launch = new Promise<BrowserContext>((resolve) => {
      finishLaunch = resolve
    })
    let launches = 0
    const driver = new PlaywrightNeisDriver({ userDataDir: 'unused' }, async () =>
      ++launches === 1 ? launch : context,
    )
    const controller = new AbortController()
    try {
      const sending = driver.send(record(), { signal: controller.signal })
      controller.abort()
      expect(await sending).toMatchObject({ ok: false, reason: expect.stringContaining('취소') })
      const next = driver.send(record())
      finishLaunch(late)
      expect(await next).toMatchObject({ ok: true, written: 2 })
      expect(browser.contexts()).not.toContain(late)
      expect(launches).toBe(2)
    } finally {
      finishLaunch(late)
      await late.close()
    }
  })

  it.each([
    ['subject', '세부능력 및 특기사항'],
    ['behavior', '행동특성 및 종합의견'],
    ['activity', '창의적 체험활동 특기사항'],
  ] as const)('%s 전송은 로그인과 새 화면의 학생 선택을 이어서 기다린다', async (mode, heading) => {
    const { driver } = await setup('https://example.test/login')
    const stages: string[] = []
    const sending = driver.send({ ...record(), mode }, { onStage: (stage) => stages.push(stage) })
    await expect.poll(() => stages.at(-1)).toBe('waiting-login')
    const popup = await context.newPage()
    await popup.goto('https://sen.neis.go.kr/menu')
    await expect.poll(() => stages.at(-1)).toBe('finding-screen')
    const frameReady = popup.waitForEvent('framenavigated', (frame) =>
      frame.url().endsWith('/grid'),
    )
    await popup.evaluate(() => {
      const frame = document.createElement('iframe')
      frame.src = '/grid'
      document.body.append(frame)
    })
    const frame = await frameReady
    await frame.addScriptTag({ content: script })
    await frame.evaluate((heading) => {
      const w = window as any
      w.grid = w.fixture.mountFakeNeis(document, [{ name: '김하늘' }, { name: '이바다' }], {
        heading,
      })
    }, heading)
    await expect.poll(() => stages.at(-1)).toBe('waiting-selection')
    expect(await driver.readClass()).toMatchObject({
      ok: false,
      message: expect.stringContaining('진행 중'),
    })
    await frame.evaluate(() => (window as any).grid.select(0))
    expect(await sending).toMatchObject({ ok: true, written: 2 })
    expect(stages).toEqual([
      'browser-opening',
      'waiting-login',
      'finding-screen',
      'waiting-selection',
      'writing',
      'verifying',
      'done',
    ])
    expect(await frame.evaluate(() => (window as any).grid.texts())).toEqual(['관찰함.', '탐구함.'])
  })

  it.each(['cancel', 'timeout'])('%s 뒤에 학생을 골라도 이전 요청은 쓰지 않는다', async (stop) => {
    const { page, driver } = await setup('https://sen.neis.go.kr/', 1_200)
    const controller = new AbortController()
    await page.evaluate(() => {
      const w = window as any
      w.grid = w.fixture.mountFakeNeis(document, [{ name: '김하늘' }, { name: '이바다' }])
    })
    const stages: string[] = []
    const sending = driver.send(record(), {
      signal: controller.signal,
      onStage: (stage) => stages.push(stage),
    })
    await expect.poll(() => stages.at(-1)).toBe('waiting-selection')
    if (stop === 'cancel') controller.abort()
    expect(await sending).toMatchObject({ ok: false })
    expect(stages.at(-1)).toBe(stop === 'cancel' ? 'cancelled' : 'failed')
    await page.evaluate(() => (window as any).grid.select(0))
    expect(await page.evaluate(() => (window as any).grid.edits())).toBe(0)
    expect(await driver.send(record())).toMatchObject({ ok: true, written: 2 })
  })

  it('같은 이름이 선택되어도 다른 업무의 표는 열지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/', 500)
    await neis(page)
    expect(await driver.send({ ...record(), mode: 'behavior' })).toMatchObject({ ok: false })
    expect(await page.evaluate(() => (window as any).grid.edits())).toBe(0)
  })

  it('편집기에 쓴 글을 표가 반영하지 않으면 검증 성공으로 세지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await page.evaluate(() => {
      const w = window as any
      w.grid = w.fixture.mountFakeNeis(document, [{ name: '김하늘' }, { name: '이바다' }], {
        discard: true,
      })
      w.grid.select(0)
    })
    expect(await driver.send(record())).toMatchObject({
      ok: false,
      reason: expect.stringContaining('나이스 표에서 다시 확인하지 못했어요. 0명'),
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })

  it('검증 중 취소하면 다음 학생에게 쓰지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const controller = new AbortController()
    const result = await driver.send(record(), {
      signal: controller.signal,
      onStage: (stage) => {
        if (stage === 'verifying') controller.abort()
      },
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('취소') })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['관찰함.', ''])
  })

  it('취소된 편집 초안이 나중에 포커스를 옮길 때 반영되지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await page.evaluate(() => {
      const w = window as any
      w.grid = w.fixture.mountFakeNeis(document, [{ name: '김하늘' }, { name: '이바다' }], {
        blurCommit: true,
      })
      w.grid.select(0)
    })
    const controller = new AbortController()
    const result = await driver.send(record(), {
      signal: controller.signal,
      onStage: (stage) => {
        if (stage === 'verifying') controller.abort()
      },
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('취소') })
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })

  it('Enter 대신 포커스 이동으로 확정되는 편집기의 값도 표에서 확인한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await page.evaluate(() => {
      const w = window as any
      w.grid = w.fixture.mountFakeNeis(document, [{ name: '김하늘' }, { name: '이바다' }], {
        blurCommit: true,
      })
      w.grid.select(0)
    })
    expect(await driver.send(record())).toMatchObject({ ok: true, written: 2 })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['관찰함.', '탐구함.'])
  })

  it('나이스에 키 입력하고 셀 값을 다시 읽는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    expect(await driver.send(record())).toEqual({ ok: true, written: 2, next: 2 })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['관찰함.', '탐구함.'])
  })

  it('다른 학생 이름이면 아무 셀도 변경하지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const pkg = record()
    pkg.students[0].name = '박나래'
    expect(await driver.send(pkg)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('이름'),
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })

  it('중간 이동 실패를 입력 완료 인원과 함께 보고한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page, true)
    expect(await driver.send(record())).toMatchObject({
      ok: false,
      reason: expect.stringContaining('다음 나이스 줄'),
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['관찰함.', ''])
  })

  it('학생 이름은 부분 문자열로 맞추지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const pkg = record()
    pkg.students[0].name = '하늘'
    expect(await driver.send(pkg)).toMatchObject({ ok: false })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })

  it('빈 글 학생은 건너뛰고 다음 학생에게만 입력한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const pkg = record()
    pkg.students[0].text = ''
    expect(await driver.send(pkg)).toEqual({ ok: true, written: 1, next: 2 })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', '탐구함.'])
  })

  it('기존 셀의 다른 글을 덮어쓰지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    await page
      .locator('.cl-selected [role=gridcell]')
      .last()
      .evaluate((cell) => {
        cell.textContent = '기존 글'
      })
    expect(await driver.send(record())).toMatchObject({ ok: false })
    expect(await page.locator('.cl-selected [role=gridcell]').last().textContent()).toBe('기존 글')
  })

  it('같은 업무의 탭이 두 개면 한 화면만 남을 때까지 입력하지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const second = await context.newPage()
    await second.goto('https://sen.neis.go.kr/other')
    await second.addScriptTag({ content: script })
    await neis(second)
    let hint: string | undefined
    const sending = driver.send(record(), {
      onStage: (_stage, value) => {
        hint = value
      },
    })
    await expect.poll(() => hint).toContain('여러 개')
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
    expect(await second.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
    await second.close()
    expect(await sending).toMatchObject({ ok: true, written: 2 })
  })

  it('교외 사이트와 오픈 데이터 주소로 학생 내용을 보내지 않는다', () => {
    expect(isNeisTarget('https://sen.neis.go.kr.evil.test')).toBe(false)
    expect(isNeisTarget('https://open.neis.go.kr')).toBe(false)
  })

  it('나이스 고정열이 두 조각(.cl-selected 2개)으로 나뉜 표에서도 이름을 확인하고 입력한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await page.evaluate(() => {
      const grid = document.createElement('div')
      grid.className = 'cl-grid'
      const students = [
        { no: '1', name: '김하늘', text: '' },
        { no: '2', name: '이바다', text: '' },
      ]
      let selected = 0
      const render = () => {
        grid.replaceChildren()
        for (const label of ['번호', '성명', '과목', '세부능력 및 특기사항']) {
          const header = document.createElement('div')
          header.setAttribute('role', 'columnheader')
          header.textContent = label
          grid.append(header)
        }
        students.forEach((s, idx) => {
          // Body pane comes first in DOM, fixed name pane comes second (real eXBuilder6 split layout)
          const bodyRow = document.createElement('div')
          bodyRow.className = 'cl-grid-row' + (idx === selected ? ' cl-selected' : '')
          bodyRow.setAttribute('aria-rowindex', String(idx + 1))
          bodyRow.style.height = '24px'
          const subj = document.createElement('div')
          subj.setAttribute('role', 'gridcell')
          subj.textContent = '과학'
          const textCell = document.createElement('div')
          textCell.setAttribute('role', 'gridcell')
          textCell.setAttribute('aria-colindex', '4')
          textCell.tabIndex = -1
          textCell.textContent = s.text
          bodyRow.append(subj, textCell)

          const fixedRow = document.createElement('div')
          fixedRow.className = 'cl-grid-row' + (idx === selected ? ' cl-selected' : '')
          fixedRow.setAttribute('aria-rowindex', String(idx + 1))
          fixedRow.style.height = '24px'
          const noCell = document.createElement('div')
          noCell.setAttribute('role', 'gridcell')
          noCell.textContent = s.no
          const nameCell = document.createElement('div')
          nameCell.setAttribute('role', 'gridcell')
          nameCell.setAttribute('aria-colindex', '2')
          nameCell.textContent = s.name
          fixedRow.append(noCell, nameCell)

          grid.append(bodyRow, fixedRow)
        })
      }
      grid.addEventListener('keydown', (e) => {
        const target = e.target as HTMLElement
        const bodySelected = grid.querySelectorAll('.cl-grid-row.cl-selected')[0]
        const last = bodySelected?.querySelectorAll<HTMLElement>('[role="gridcell"]')[1]
        if (e.key === 'F2' && last) {
          const ed = document.createElement('textarea')
          ed.className = 'cl-text'
          ed.value = students[selected].text
          last.textContent = ''
          last.append(ed)
          ed.focus()
        } else if (e.key === 'Enter' && target.tagName === 'TEXTAREA' && last) {
          students[selected].text = (target as HTMLTextAreaElement).value
          target.remove()
          last.textContent = students[selected].text
          last.focus()
        } else if (e.key === 'Tab' && selected < students.length - 1) {
          selected += 1
          render()
        }
      })
      render()
      document.body.append(grid)
      ;(window as any).__splitTexts = () => students.map((s) => s.text)
    })
    expect(await driver.send(record())).toMatchObject({ ok: true, written: 2 })
    expect(await page.evaluate(() => (window as any).__splitTexts())).toEqual([
      '관찰함.',
      '탐구함.',
    ])
  })

  it('중간 학생 줄을 선택해 다시 보내면 그 학생부터 이어서 채운다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await page.evaluate(() => {
      const w = window as any
      w.grid = w.fixture.mountFakeNeis(document, [
        { name: '김하늘', text: '직접 고친 글.' },
        { name: '이바다' },
        { name: '박나래' },
      ])
      w.grid.select(1)
    })
    const pkg = buildRecordPackage({
      mode: 'subject',
      title: '과학 세특',
      students: [
        { name: '김하늘', text: '관찰함.' },
        { name: '이바다', text: '탐구함.' },
        { name: '박나래', text: '발표함.' },
      ],
    })
    expect(await driver.send(pkg)).toEqual({
      ok: true,
      written: 2,
      next: 3,
      startedFrom: 1,
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual([
      '직접 고친 글.',
      '탐구함.',
      '발표함.',
    ])
  })

  it('전용 브라우저 프로필 잠금 충돌 시 열린 전송용 창을 닫으라고 안내한다', async () => {
    const driver = new PlaywrightNeisDriver({ userDataDir: 'unused' }, async () => {
      throw new Error('Failed to create a ProcessSingleton for your profile directory')
    })
    expect(await driver.send(record())).toEqual({
      ok: false,
      reason:
        '이미 열려 있는 전송용 브라우저 창이 프로필을 사용 중이에요. 열려 있는 전송용 Chrome 또는 Edge 창을 닫은 뒤 다시 보내 주세요.',
    })
  })

  it('나이스 표에 여러 학생 줄이 동시에 선택돼 있으면 아무 칸도 수정하지 않고 멈춘다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/', 800)
    await neis(page)
    await page.evaluate(() => {
      document.querySelectorAll('.cl-grid-row').forEach((r) => r.classList.add('cl-selected'))
    })
    expect(await driver.send(record())).toMatchObject({
      ok: false,
      reason: expect.stringContaining('여러 학생 줄'),
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })
})
