import { describe, expect, it } from 'vitest'
import { EXTENSION_ID } from '@genoffice/ttokttak-extension/ids'
import { parsePumuiPackage } from '@genoffice/ttokttak-extension/package'
import {
  NO_EXTENSION,
  pumuiPackageFromWork,
  sendPumui,
  workProblem,
  type WorkRow,
} from '../src/renderer/src/pumui-send'

const rows: WorkRow[] = [
  {
    description: '모나미 153 볼펜',
    specification: '흑색 12개입',
    unit: '세트',
    quantity: 5,
    unitPrice: 3600,
    amount: 18000,
  },
  {
    description: '배송비',
    specification: '',
    unit: '개',
    quantity: 1,
    unitPrice: 3000,
    amount: 3000,
  },
]
const work = {
  title: '교무실 사무용품 구입',
  estimateData: rows,
  generatedArticle: '1. 관련:\n2. 구입하고자 합니다.',
}

describe('품의 목록 → 품의 패키지', () => {
  it('carries the 기안문 as the summary and every row, delivery fee included', () => {
    const pkg = pumuiPackageFromWork(work, new Date('2026-11-03T00:00:00Z'))
    const parsed = parsePumuiPackage(JSON.stringify(pkg), new Date('2026-11-03T00:00:00Z'))
    expect(parsed).toMatchObject({ ok: true })
    expect(pkg.summary).toBe(work.generatedArticle)
    expect(pkg.items.map((i) => i.description)).toEqual(['모나미 153 볼펜', '배송비'])
    expect(pkg.total).toBe(21000)
  })

  it('names what to fix before sending', () => {
    expect(workProblem('짧은제목', rows)).toBe('품의 제목을 5자 이상 입력해주세요.')
    expect(workProblem(work.title, [])).toBe('품의 목록이 비어 있어요.')
    expect(workProblem(work.title, [{ ...rows[0], amount: 17000 }])).toBe(
      '1번째 줄의 금액이 수량×단가와 달라요. 수량이나 단가를 고쳐 주세요.',
    )
    expect(workProblem(work.title, rows)).toBeNull()
  })
})

describe('sendPumui', () => {
  const text = JSON.stringify(pumuiPackageFromWork(work))

  it('holds the 품의 in the desktop app', async () => {
    const sent: string[] = []
    let opened = 0
    const out = await sendPumui(text, {
      web: false,
      pumuiSend: async (t) => (sent.push(t), { ok: true, title: 'x' }),
      openEdufine: async () => void (opened += 1),
    })
    expect(out).toMatchObject({ ok: true, route: 'desktop' })
    // then the browser is brought to K-에듀파인, and only one button is left to press there
    expect(opened).toBe(1)
    expect(out.message).toContain('K-에듀파인으로 옮겼어요')
    expect(out.message).toContain('[K-에듀파인에 채우기]')
    expect(sent).toEqual([text])
  })

  it('does not open the browser when the app could not hold the 품의', async () => {
    let opened = 0
    const out = await sendPumui(text, {
      web: false,
      pumuiSend: async () => ({ ok: false, reason: '품의를 읽지 못했어요.' }),
      openEdufine: async () => void (opened += 1),
    })
    expect(out).toEqual({ ok: false, route: 'desktop', message: '품의를 읽지 못했어요.' })
    expect(opened).toBe(0)
  })

  it('tells the web app user where the extension took them', async () => {
    const answer = (reply: unknown) => ({
      sendMessage: (_i: string, _m: unknown, cb: (r: unknown) => void) => cb(reply),
    })
    const said = async (reply: unknown) =>
      (await sendPumui(text, { web: true, runtime: answer(reply) })).message
    expect(await said({ ok: true, moved: 'focused' })).toContain('K-에듀파인 화면으로 옮겼어요')
    expect(await said({ ok: true, moved: 'opened' })).toContain('새 탭으로 열었어요')
    expect(await said({ ok: true, moved: 'unknown' })).toContain('한 번 열어 두면')
    // an extension older than the move says nothing about it
    expect(await said({ ok: true })).toContain('[똑딱]을 누르면 바로 보여요')
  })

  it('gives the 품의 to the extension from the web app, never to the server queue', async () => {
    const calls: unknown[] = []
    const runtime = {
      sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => (
        calls.push([id, msg]),
        cb({ ok: true })
      ),
    }
    let queued = false
    const out = await sendPumui(text, {
      web: true,
      runtime,
      pumuiSend: async () => ((queued = true), { ok: true, title: '' }),
    })
    expect(out).toMatchObject({ ok: true, route: 'extension' })
    expect(calls).toEqual([[EXTENSION_ID, { type: 'pumui:send', text }]])
    expect(queued).toBe(false)
  })

  it('says the extension is missing when the browser has none or it does not answer', async () => {
    expect(await sendPumui(text, { web: true })).toEqual({
      ok: false,
      route: 'none',
      message: NO_EXTENSION,
    })
    const silent = { sendMessage: () => {} }
    expect(await sendPumui(text, { web: true, runtime: silent, timeoutMs: 10 })).toEqual({
      ok: false,
      route: 'none',
      message: NO_EXTENSION,
    })
    const failing = {
      sendMessage: (_i: string, _m: unknown, cb: (r: unknown) => void) => cb(undefined),
      lastError: { message: 'Could not establish connection' },
    }
    expect(await sendPumui(text, { web: true, runtime: failing })).toMatchObject({
      ok: false,
      message: NO_EXTENSION,
    })
  })

  it('passes on the extension refusing a 품의', async () => {
    const runtime = {
      sendMessage: (_i: string, _m: unknown, cb: (r: unknown) => void) =>
        cb({ ok: false, reason: '합계가 품목 금액의 합과 달라요.' }),
    }
    expect(await sendPumui(text, { web: true, runtime })).toEqual({
      ok: false,
      route: 'none',
      message: '합계가 품목 금액의 합과 달라요.',
    })
  })
})
