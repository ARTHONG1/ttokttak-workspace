import { describe, expect, it } from 'vitest'
import { EXTENSION_ID } from '@genoffice/ttokttak-extension/ids'
import { parseRecordPackage } from '@genoffice/ttokttak-extension/record'
import { emptyInfo, type Student, type Work } from '../src/renderer/src/record/record-core'
import {
  NO_RECORD_EXTENSION,
  recordPackageFromWork,
  recordSendProblem,
  sendRecord,
} from '../src/renderer/src/record/record-send'

const student = (name: string, result: string): Student => ({
  id: name || 'x',
  name,
  level: '상',
  notes: '',
  result,
})

const work = (students: Student[]): Work => ({
  length: 'medium',
  instructions: '',
  info: { ...emptyInfo(), subject: '과학' },
  students,
})

const CLASS = work([
  student('김하늘', '탐구에 적극적으로 참여함.'),
  student('이바다', ''),
  student('박나래', '관찰 일지를 꼼꼼히 기록함.'),
  student('', ''),
])

describe('생기부 → 생기부 꾸러미', () => {
  it('keeps the list order, with a student without a text in place', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    const pkg = recordPackageFromWork('subject', CLASS, now)
    expect(parseRecordPackage(JSON.stringify(pkg), now)).toMatchObject({ ok: true })
    expect(pkg.mode).toBe('subject')
    expect(pkg.title).toBe('과학 세특 · 3명')
    expect(pkg.students).toEqual([
      { name: '김하늘', text: '탐구에 적극적으로 참여함.' },
      { name: '이바다', text: '' },
      { name: '박나래', text: '관찰 일지를 꼼꼼히 기록함.' },
    ])
  })

  it('names what to fix before sending', () => {
    expect(recordSendProblem('subject', CLASS)).toBeNull()
    expect(recordSendProblem('behavior', work([student('김하늘', '')]))).toMatch(/보낼 글이 없어요/)
    expect(
      recordSendProblem(
        'behavior',
        work([student('김하늘', '가'), student('이바다', '가'.repeat(501))]),
      ),
    ).toMatch(/^2번 학생의 글이 1,500바이트를 넘어요/)
  })

  it('is a NEIS package the senders accept', () => {
    const text = JSON.stringify(recordPackageFromWork('behavior', CLASS))
    const parsed = parseRecordPackage(text, new Date())
    expect(parsed.ok && parsed.pkg.title).toBe('행발 · 3명')
    expect(parseRecordPackage('{"kind":"ttokttak.pumui"}', new Date())).toMatchObject({ ok: false })
  })
})

describe('sendRecord', () => {
  const text = JSON.stringify(recordPackageFromWork('subject', CLASS))

  it('uses the desktop driver without an extension', async () => {
    const calls: string[][] = []
    const extension: unknown[] = []
    const out = await sendRecord(text, {
      web: false,
      directTransfer: async (feature, t) => {
        calls.push(['send', feature, t])
        return { ok: true, route: 'direct', message: '입력 완료', written: 2, next: 3 }
      },
      runtime: { sendMessage: (...args: unknown[]) => void extension.push(args) },
    })
    expect(calls).toEqual([['send', 'neis-record', text]])
    expect(extension).toEqual([])
    expect(out).toMatchObject({ ok: true, route: 'direct', message: '입력 완료' })
  })

  it("passes on the desktop app's refusal", async () => {
    const out = await sendRecord(text, {
      web: false,
      directTransfer: async () => ({ ok: false, route: 'direct', message: '알 수 없는 업무예요.' }),
    })
    expect(out).toEqual({ ok: false, route: 'direct', message: '알 수 없는 업무예요.' })
  })

  const runtime = (reply: unknown) => {
    const seen: unknown[] = []
    return {
      seen,
      rt: {
        sendMessage(id: string, msg: unknown, cb: (r: unknown) => void) {
          seen.push([id, msg])
          cb(reply)
        },
      },
    }
  }

  it('never falls back to the extension when desktop support is missing', async () => {
    const { rt, seen } = runtime({ ok: true })
    expect(await sendRecord(text, { web: false, runtime: rt })).toMatchObject({
      ok: false,
      route: 'direct',
    })
    expect(seen).toEqual([])
  })

  it('hands the work to the extension in the web edition', async () => {
    const { rt, seen } = runtime({ ok: true, moved: 'focused' })
    const out = await sendRecord(text, { web: true, runtime: rt })
    expect(seen).toEqual([[EXTENSION_ID, { type: 'work:send', feature: 'neis-record', text }]])
    expect(out).toMatchObject({ ok: true, route: 'extension' })
    expect(out.message).toContain('나이스 화면으로 옮겼어요')
  })

  it('says so when NEIS was never opened, when there is no extension, and when it is an old one', async () => {
    const unknown = await sendRecord(text, {
      web: true,
      runtime: runtime({ ok: true, moved: 'unknown' }).rt,
    })
    expect(unknown.message).toContain('한 번 열어 두면')
    expect(await sendRecord(text, { web: true })).toEqual({
      ok: false,
      route: 'none',
      message: NO_RECORD_EXTENSION,
    })
    const old = await sendRecord(text, {
      web: true,
      runtime: runtime({
        ok: false,
        reason: '이 확장이 모르는 업무예요. 확장을 업데이트해 주세요.',
      }).rt,
    })
    expect(old.message).toContain('0.7.0 이상으로 업데이트')
  })
})
