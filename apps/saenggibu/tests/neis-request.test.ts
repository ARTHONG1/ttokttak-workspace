import { describe, expect, it } from 'vitest'
import { neisRequest, isNeisTarget, type NeisDriver } from '../src/main/neis-driver'
import { buildRecordPackage } from '../src/shared/record-package'
import { recordPackageFromWork, recordSendProblem } from '../src/renderer/src/record/record-send'
import { emptyInfo, type Work } from '../src/renderer/src/record/record-core'

const pkg = (students: { name: string; text: string }[]) =>
  JSON.stringify(buildRecordPackage({ mode: 'behavior', title: '행발', students }))
const driver = (seen: unknown[] = []): NeisDriver => ({
  send: async (p) => (
    seen.push(p),
    { ok: true, written: p.students.length, next: p.students.length }
  ),
})

describe('나이스로 보내기', () => {
  it("fills the students through the app's own browser driver", async () => {
    const seen: unknown[] = []
    const out = await neisRequest(
      pkg([
        { name: '김하늘', text: '친구를 잘 도와줌.' },
        { name: '이바다', text: '발표를 잘함.' },
      ]),
      driver(seen),
    )
    expect(out).toMatchObject({ ok: true, route: 'direct', written: 2 })
    expect(out.message).toContain('2명을 채웠어요')
    expect(seen).toHaveLength(1)
  })

  it('needs every name, once each, and NEIS-sized texts', async () => {
    const d = driver()
    expect(await neisRequest(pkg([{ name: '', text: '가' }]), d)).toMatchObject({ ok: false })
    expect(
      await neisRequest(
        pkg([
          { name: '김하늘', text: '가' },
          { name: '김 하늘', text: '나' },
        ]),
        d,
      ),
    ).toMatchObject({ ok: false })
    expect(await neisRequest(pkg([{ name: '김하늘', text: '가'.repeat(501) }]), d)).toMatchObject({
      ok: false,
    })
    expect(await neisRequest('{', d)).toMatchObject({ ok: false })
  })

  it('types only into HTTPS NEIS work hosts', () => {
    expect(isNeisTarget('https://sen.neis.go.kr/x')).toBe(true)
    expect(isNeisTarget('http://sen.neis.go.kr/x')).toBe(false)
    expect(isNeisTarget('https://open.neis.go.kr/')).toBe(false)
    expect(isNeisTarget('https://neis.go.kr.example.com/')).toBe(false)
  })

  it("keeps an empty student's row in place and says when nothing can go", () => {
    const work: Work = {
      info: emptyInfo(),
      length: 'normal',
      instructions: '',
      students: [
        { id: 'a', name: '김하늘', level: '상', notes: '', result: '' },
        { id: 'b', name: '이바다', level: '상', notes: '', result: '발표를 잘함.' },
      ],
    } as unknown as Work
    expect(recordPackageFromWork('behavior', work).students.map((s) => s.name)).toEqual([
      '김하늘',
      '이바다',
    ])
    expect(recordSendProblem('behavior', { ...work, students: [work.students[0]!] })).toContain(
      '보낼 글이 없어요',
    )
  })
})

describe('나이스로 보내기: 창체', () => {
  const activityWork = (school: 'elementary' | 'high', result: string): Work =>
    ({
      info: { ...emptyInfo(), schoolLevel: school, area: 'career', activityContent: '진로 탐색' },
      length: 'medium',
      instructions: '',
      students: [{ id: 'a', name: '김하늘', level: '상', notes: '', result }],
    }) as Work

  it('sends a long 초등 창체 entry (no cap) and stops a 중·고 one over 1,500 bytes', async () => {
    const long = '가'.repeat(600)
    expect(recordSendProblem('activity', activityWork('elementary', long))).toBeNull()
    expect(recordSendProblem('activity', activityWork('high', long))).toContain('1,500바이트')
    const text = JSON.stringify(recordPackageFromWork('activity', activityWork('elementary', long)))
    expect(await neisRequest(text, driver())).toMatchObject({ ok: true, written: 1 })
  })
})
