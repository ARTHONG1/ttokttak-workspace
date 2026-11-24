import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { buildRecordPackage } from '@genoffice/ttokttak-extension/record'
import { buildPumuiPackage } from '@genoffice/ttokttak-extension/package'
import { DEFAULT_SCREEN_MAP } from '@genoffice/ttokttak-extension/screen-map'
import { pumuiScreen } from '../../../packages/ttokttak-extension/tests/fixtures/fake-nexacro'
import {
  PlaywrightDirectTransferDriver,
  findDirectBrowser,
  isDirectTarget,
} from '../src/main/direct-transfer'

let browser: Browser
let context: BrowserContext
let script: string
const browserPath =
  findDirectBrowser() ??
  (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined)
beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `export { mountFakeNeis } from './fake-neis-grid'; export { makeFakeEdufine } from './fake-nexacro'`,
      resolveDir: resolve('../../packages/ttokttak-extension/tests/fixtures'),
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

async function setup(url: string): Promise<{ page: Page; driver: PlaywrightDirectTransferDriver }> {
  context = await browser.newContext()
  await context.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }),
  )
  const page = await context.newPage()
  await page.goto(url)
  await page.addScriptTag({ content: script })
  return {
    page,
    driver: new PlaywrightDirectTransferDriver(
      {
        userDataDir: 'unused',
        waitTimeoutMs: 300,
        pollMs: 25,
        ...(url.includes('neis.go.kr') ? {} : { edufineUrl: url }),
      },
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
const pumui = () =>
  buildPumuiPackage({
    title: '실험 도구 구입',
    summary: '실험에 사용합니다.',
    items: [
      {
        description: '비커',
        specification: '100ml',
        unit: '개',
        quantity: 2,
        unitPrice: 1000,
        amount: 2000,
      },
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
async function edufine(page: Page, failAddAt?: number) {
  await page.evaluate(
    (spec) => {
      const w = window as any
      w.edu = w.fixture.makeFakeEdufine(spec)
      w.nexacro = w.edu.nx
    },
    pumuiScreen(DEFAULT_SCREEN_MAP, { failAddAt }),
  )
}

describe.skipIf(!browserPath)('직접 전송 실제 Chromium 시험 (학교 서버 아님)', () => {
  it('K-에듀파인 주소가 없는 첫 요청은 브라우저를 띄우지 않는다', async () => {
    let launches = 0
    const stages: string[] = []
    const driver = new PlaywrightDirectTransferDriver({ userDataDir: 'unused' }, async () => {
      launches++
      return browser.newContext()
    })
    expect(
      await driver.send('edufine-pumui', pumui(), { onStage: (s) => stages.push(s) }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('주소') })
    expect(launches).toBe(0)
    expect(stages).toContain('failed')
  })
  it('동시 전송은 하나만 실행한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const results = await Promise.all([
      driver.send('neis-record', record()),
      driver.send('neis-record', record()),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: expect.stringContaining('진행 중') })
    expect(await page.evaluate(() => (window as any).grid.edits())).toBe(2)
  })
  it('사용자가 닫은 전용 브라우저를 다음 요청에서 다시 연다', async () => {
    let launches = 0
    const driver = new PlaywrightDirectTransferDriver(
      { userDataDir: 'unused', waitTimeoutMs: 200, pollMs: 20 },
      async () => {
        launches++
        context = await browser.newContext()
        await context.route('**/*', (route) =>
          route.fulfill({ contentType: 'text/html', body: '<html>로그인 화면</html>' }),
        )
        return context
      },
    )
    expect(await driver.send('neis-record', record())).toMatchObject({
      ok: false,
      reason: expect.stringContaining('로그인'),
    })
    await context.close()
    expect(await driver.send('neis-record', record())).toMatchObject({
      ok: false,
      reason: expect.stringContaining('로그인'),
    })
    expect(launches).toBe(2)
  })
  it('나이스에 키 입력하고 셀 값을 다시 읽는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    expect(await driver.send('neis-record', record())).toEqual({ ok: true, written: 2, next: 2 })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['관찰함.', '탐구함.'])
  })
  it('학생을 선택할 때까지 기다렸다가 한 번만 입력한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    await page.evaluate(() =>
      document
        .querySelectorAll('.cl-grid-row.cl-selected')
        .forEach((row) => row.classList.remove('cl-selected')),
    )
    const stages: string[] = []
    const work = driver.send('neis-record', record(), { onStage: (stage) => stages.push(stage) })
    await page.waitForTimeout(60)
    expect(await page.evaluate(() => (window as any).grid.edits())).toBe(0)
    await page.evaluate(() => (window as any).grid.select(0))
    expect(await work).toMatchObject({ ok: true, written: 2 })
    expect(stages).toContain('waiting-selection')
  })
  it('예산 줄이 선택되기 전에는 행 추가 함수조차 호출하지 않는다', async () => {
    const { page, driver } = await setup('https://klef.ice.go.kr/keris_ui/main.do')
    await page.evaluate(
      (spec) => {
        const w = window as any
        w.edu = w.fixture.makeFakeEdufine(spec)
        w.nexacro = w.edu.nx
      },
      pumuiScreen(DEFAULT_SCREEN_MAP, { budgetSelected: false }),
    )
    const work = driver.send('edufine-pumui', pumui())
    await page.waitForTimeout(90)
    expect(
      await page.evaluate(
        () => (window as any).edu.writes.filter((w: any) => w.op === 'call').length,
      ),
    ).toBe(0)
    await page.evaluate(() => (window as any).edu.selectBudget())
    expect(await work).toMatchObject({ ok: true, written: 1 })
    expect(
      await page.evaluate(
        () => (window as any).edu.writes.filter((w: any) => w.op === 'call').length,
      ),
    ).toBe(1)
  })
  it('대기 취소 후 선택 화면이 나타나도 아무 내용도 쓰지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    const controller = new AbortController()
    const work = driver.send('neis-record', record(), { signal: controller.signal })
    await page.waitForTimeout(50)
    controller.abort()
    await neis(page)
    expect(await work).toMatchObject({ ok: false, reason: expect.stringContaining('취소') })
    expect(await page.evaluate(() => (window as any).grid.edits())).toBe(0)
  })
  it('다른 학생 이름이면 아무 셀도 변경하지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const pkg = record()
    pkg.students[0].name = '박나래'
    expect(await driver.send('neis-record', pkg)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('이름'),
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })
  it('중간 이동 실패를 입력 완료 인원과 함께 보고한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page, true)
    expect(await driver.send('neis-record', record())).toMatchObject({
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
    expect(await driver.send('neis-record', pkg)).toMatchObject({ ok: false })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })
  it('빈 글 학생은 건너뛰고 다음 학생에게만 입력한다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const pkg = record()
    pkg.students[0].text = ''
    expect(await driver.send('neis-record', pkg)).toEqual({ ok: true, written: 1, next: 2 })
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
    expect(await driver.send('neis-record', record())).toMatchObject({ ok: false })
    expect(await page.locator('.cl-selected [role=gridcell]').last().textContent()).toBe('기존 글')
  })
  it('K-에듀파인 바인딩 데이터셋에 단위까지 입력하고 재전송을 차단한다', async () => {
    const { page, driver } = await setup('https://klef.ice.go.kr/keris_ui/main.do')
    await edufine(page)
    expect(await driver.send('edufine-pumui', pumui())).toEqual({ ok: true, written: 1, next: 1 })
    expect(await page.evaluate(() => (window as any).edu.dataset('dsPrdlstDtl').rows)).toEqual([
      { prdlstCn: '비커', stndrd: '100ml', thngUnitSeCd: '001', qty: 2, expectUntpc: 1000 },
    ])
    expect(await driver.send('edufine-pumui', pumui())).toMatchObject({ ok: false })
    expect(await page.evaluate(() => (window as any).edu.dataset('dsPrdlstDtl').rowcount)).toBe(1)
    expect(await page.evaluate(() => (window as any).edu.forbiddenCalls())).toBe(0)
  })
  it('품목 추가 실패 시 이번에 추가한 행을 되돌린다', async () => {
    const { page, driver } = await setup('https://klef.ice.go.kr/keris_ui/main.do')
    await edufine(page, 2)
    const pkg = pumui()
    pkg.items.push({ ...pkg.items[0] })
    pkg.total = 4000
    expect(await driver.send('edufine-pumui', pkg)).toMatchObject({ ok: false })
    expect(await page.evaluate(() => (window as any).edu.dataset('dsPrdlstDtl').rows)).toEqual([])
  })
  it('품의에서 쓰는 세트를 화면의 SET 코드로 바꾼다', async () => {
    const { page, driver } = await setup('https://klef.ice.go.kr/keris_ui/main.do')
    await edufine(page)
    const pkg = pumui()
    pkg.items[0].unit = '세트'
    expect(await driver.send('edufine-pumui', pkg)).toMatchObject({ ok: true })
    expect(
      await page.evaluate(() =>
        (window as any).edu.dataset('dsPrdlstDtl').getColumn(0, 'thngUnitSeCd'),
      ),
    ).toBe('017')
  })
  it('단위 코드 쓰기가 거절되면 성공으로 표시하지 않고 행을 되돌린다', async () => {
    const { page, driver } = await setup('https://klef.ice.go.kr/keris_ui/main.do')
    await edufine(page)
    await page.evaluate(() => {
      const ds = (window as any).edu.dataset('dsPrdlstDtl')
      const original = ds.setColumn.bind(ds)
      ds.setColumn = (row: number, col: string, value: unknown) =>
        col === 'thngUnitSeCd' ? false : original(row, col, value)
    })
    expect(await driver.send('edufine-pumui', pumui())).toMatchObject({ ok: false })
    expect(await page.evaluate(() => (window as any).edu.dataset('dsPrdlstDtl').rows)).toEqual([])
  })
  it('제목 입력 실패는 제목과 이번 품목을 함께 되돌린다', async () => {
    const { page, driver } = await setup('https://klef.ice.go.kr/keris_ui/main.do')
    await edufine(page)
    await page.evaluate(() => {
      ;(window as any).edu.form.divMain.form.txtareaCnsulSumrCn.set_value = (value: string) => {
        if (value) throw new Error('rejected')
      }
    })
    expect(await driver.send('edufine-pumui', pumui())).toMatchObject({ ok: false })
    expect(await page.evaluate(() => (window as any).edu.form.divMain.form.edtCnsulSj.value)).toBe(
      '',
    )
    expect(await page.evaluate(() => (window as any).edu.dataset('dsPrdlstDtl').rows)).toEqual([])
  })
  it('같은 업무의 탭이 두 개면 입력하지 않는다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    const second = await context.newPage()
    await second.goto('https://sen.neis.go.kr/other')
    await second.addScriptTag({ content: script })
    await neis(second)
    expect(await driver.send('neis-record', record())).toMatchObject({
      ok: false,
      reason: expect.stringContaining('여러 개'),
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })
  it('교외 사이트와 오픈 데이터 주소로 학생 내용을 보내지 않는다', () => {
    expect(isDirectTarget('neis-record', 'https://sen.neis.go.kr.evil.test')).toBe(false)
    expect(isDirectTarget('neis-record', 'https://open.neis.go.kr')).toBe(false)
    expect(isDirectTarget('edufine-pumui', 'http://klef.ice.go.kr')).toBe(false)
    expect(isDirectTarget('edufine-pumui', 'https://klef.ice.go.kr/keris_ui/main.do')).toBe(true)
    expect(isDirectTarget('edufine-pumui', 'https://evpn.sen.go.kr/portal/main.do')).toBe(true)
    expect(isDirectTarget('edufine-pumui', 'https://sen.neis.go.kr/')).toBe(false)
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
    expect(await driver.send('neis-record', record())).toMatchObject({ ok: true, written: 2 })
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
    expect(await driver.send('neis-record', pkg)).toEqual({
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

  it('K-에듀파인 다른 화면에 있으면 품의등록 메뉴를 자동으로 열고, 개행 정규화(\r\n)에도 롤백하지 않는다', async () => {
    const { page } = await setup('https://evpn.sen.go.kr/portal/main.do')
    const driver = new PlaywrightDirectTransferDriver(
      {
        userDataDir: 'unused',
        edufineUrl: 'https://evpn.sen.go.kr',
        waitTimeoutMs: 2_000,
        pollMs: 25,
      },
      async () => context,
    )
    await page.evaluate(
      (spec) => {
        const w = window as any
        w.edu = w.fixture.makeFakeEdufine(spec)
        const summary = w.edu.form.divMain.form.txtareaCnsulSumrCn
        summary.set_value = (v: unknown) => {
          summary.value = String(v).replace(/\n/g, '\r\n')
        }
        w.nexacro = w.edu.nx
      },
      pumuiScreen(DEFAULT_SCREEN_MAP, { startOn: 'other' }),
    )
    const pkg = buildPumuiPackage({
      title: '실험 도구 구입',
      summary: '1. 관련\n2. 실험에 사용합니다.',
      items: [
        {
          description: '비커',
          specification: '100ml',
          unit: '개',
          quantity: 2,
          unitPrice: 1000,
          amount: 2000,
        },
      ],
    })
    expect(await driver.send('edufine-pumui', pkg)).toEqual({ ok: true, written: 1, next: 1 })
    expect(await page.evaluate(() => (window as any).edu.dataset('dsPrdlstDtl').rowcount)).toBe(1)
  })

  it('K-에듀파인에서 예산 미선택이면 www.neis.go.kr로 이동하지 않고 예산 선택 안내를 그대로 돌려준다', async () => {
    const { page, driver } = await setup('https://klef.ice.go.kr/keris_ui/main.do')
    await page.evaluate(
      (spec) => {
        const w = window as any
        w.edu = w.fixture.makeFakeEdufine(spec)
        // Even if rowposition is 0 on a checkbox-based grid, row-add refuses when budgetSelected is false
        w.edu.dataset('dsBgtDtlList').rowposition = 0
        w.nexacro = w.edu.nx
      },
      pumuiScreen(DEFAULT_SCREEN_MAP, { budgetSelected: false }),
    )
    const res = await driver.send('edufine-pumui', pumui())
    expect(res).toEqual({
      ok: false,
      reason: '예산 내역에서 예산 줄을 먼저 골라 주세요.',
    })
    expect(page.url()).toBe('https://klef.ice.go.kr/keris_ui/main.do')
  })

  it('빈 브라우저에서 K-에듀파인 전송 시 나이스 주소로 보내지 않고, 방문한 교육청 origin만 기억한다', async () => {
    const { mkdtempSync, readFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'ttok-dt-place-'))
    context = await browser.newContext()
    await context.route('**/*', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>포털</body></html>' }),
    )
    const firstPage = await context.newPage()
    const d1 = new PlaywrightDirectTransferDriver(
      { userDataDir: dir, waitTimeoutMs: 150, pollMs: 20 },
      async () => context,
    )
    const first = await d1.send('edufine-pumui', pumui())
    expect(first.ok).toBe(false)
    expect(firstPage.url()).not.toContain('neis.go.kr')

    expect(d1.setStartOrigin('edufine-pumui', 'https://klef.ice.go.kr/keris_ui/main.do')).toBe(true)
    await firstPage.goto('https://klef.ice.go.kr/keris_ui/main.do?token=secret123')
    await firstPage.addScriptTag({ content: script })
    await edufine(firstPage)
    expect(await d1.send('edufine-pumui', pumui())).toMatchObject({ ok: true })
    const saved = readFileSync(join(dir, 'ttokttak-places.json'), 'utf8')
    expect(saved).not.toContain('secret123')
    expect(saved).not.toContain('keris_ui')
    await context.close()

    context = await browser.newContext()
    await context.route('**/*', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>재접속</body></html>' }),
    )
    const secondPage = await context.newPage()
    const d2 = new PlaywrightDirectTransferDriver(
      { userDataDir: dir, waitTimeoutMs: 150, pollMs: 20 },
      async () => context,
    )
    await d2.send('edufine-pumui', pumui())
    expect(secondPage.url()).toBe('https://klef.ice.go.kr/')
  })

  it('업무포털 페이지 안의 동원 iframe에 들어 있는 K-에듀파인도 중복 오탐 없이 채운다', async () => {
    context = await browser.newContext()
    await context.route('**/*', (route) => {
      const url = route.request().url()
      if (url.endsWith('/inner.do')) {
        return route.fulfill({ contentType: 'text/html', body: '<html><body>내부</body></html>' })
      }
      return route.fulfill({
        contentType: 'text/html',
        body: '<html><body><iframe src="/inner.do"></iframe></body></html>',
      })
    })
    const page = await context.newPage()
    await page.goto('https://evpn.sen.go.kr/portal.do')
    const inner = page.frames().find((f) => f.url().endsWith('/inner.do'))!
    await inner.addScriptTag({ content: script })
    await inner.evaluate((spec) => {
      const w = window as any
      w.edu = w.fixture.makeFakeEdufine(spec)
      w.nexacro = w.edu.nx
    }, pumuiScreen(DEFAULT_SCREEN_MAP))
    const driver = new PlaywrightDirectTransferDriver(
      { userDataDir: 'unused', edufineUrl: 'https://evpn.sen.go.kr' },
      async () => context,
    )
    expect(await driver.send('edufine-pumui', pumui())).toEqual({ ok: true, written: 1, next: 1 })
    expect(await inner.evaluate(() => (window as any).edu.dataset('dsPrdlstDtl').rowcount)).toBe(1)
  })

  it('전용 브라우저 프로필 잠금 충돌 시 열린 전송용 창을 닫으라고 안내한다', async () => {
    const driver = new PlaywrightDirectTransferDriver({ userDataDir: 'unused' }, async () => {
      throw new Error('Failed to create a ProcessSingleton for your profile directory')
    })
    expect(await driver.send('neis-record', record())).toEqual({
      ok: false,
      reason:
        '이미 열려 있는 전송용 브라우저 창이 프로필을 사용 중이에요. 열려 있는 전송용 Chrome 또는 Edge 창을 닫은 뒤 다시 보내 주세요.',
    })
  })

  it('나이스 표에 여러 학생 줄이 동시에 선택돼 있으면 아무 칸도 수정하지 않고 멈춘다', async () => {
    const { page, driver } = await setup('https://sen.neis.go.kr/')
    await neis(page)
    await page.evaluate(() => {
      document.querySelectorAll('.cl-grid-row').forEach((r) => r.classList.add('cl-selected'))
    })
    expect(await driver.send('neis-record', record())).toMatchObject({
      ok: false,
      reason: expect.stringContaining('여러 학생 줄'),
    })
    expect(await page.evaluate(() => (window as any).grid.texts())).toEqual(['', ''])
  })
})
