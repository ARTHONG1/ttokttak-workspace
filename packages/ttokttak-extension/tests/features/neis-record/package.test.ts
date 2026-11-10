import { describe, expect, it } from 'vitest'
import {
  buildRecordPackage,
  neisBytes,
  parseRecordPackage,
  writtenCount,
} from '../../../src/features/neis-record/package'

const now = new Date('2026-11-10T01:00:00Z')
const students = [
  { name: '김하늘', text: '탐구에 적극적으로 참여함.' },
  { name: '이바다', text: '' },
  { name: '', text: '관찰 일지를 꼼꼼히 기록함.' },
  { name: '한별', text: '' },
]

describe('record package', () => {
  it('round-trips through text', () => {
    const pkg = buildRecordPackage({ mode: 'subject', title: '과학 세특 · 2명', students, now })
    expect(pkg).toMatchObject({
      kind: 'ttokttak.neis-record',
      version: 1,
      mode: 'subject',
      createdAt: now.toISOString(),
    })
    const back = parseRecordPackage(JSON.stringify(pkg), new Date('2026-11-10T03:00:00Z'))
    expect(back).toEqual({ ok: true, pkg, ageHours: 2 })
  })

  it('keeps a student without a text in place, and drops the ones after the last text', () => {
    const pkg = buildRecordPackage({ mode: 'subject', title: 't', students, now })
    expect(pkg.students.map((s) => s.name)).toEqual(['김하늘', '이바다', ''])
    expect(writtenCount(pkg.students)).toBe(2)
  })

  it('puts a text on one line, as NEIS keeps it', () => {
    const pkg = buildRecordPackage({
      mode: 'behavior',
      title: '행발',
      students: [{ name: ' 김하늘 ', text: ' 배려심이 깊음.\n 책임감이 강함. ' }],
      now,
    })
    expect(pkg.students).toEqual([{ name: '김하늘', text: '배려심이 깊음. 책임감이 강함.' }])
  })

  it('refuses what is not a record package', () => {
    const good = buildRecordPackage({ mode: 'behavior', title: '행발', students, now })
    const refuse = (change: Record<string, unknown>) =>
      parseRecordPackage(JSON.stringify({ ...good, ...change }), now)
    expect(parseRecordPackage('안녕', now).ok).toBe(false)
    expect(parseRecordPackage('{"kind":"ttokttak.pumui"}', now).ok).toBe(false)
    expect(refuse({ version: 2 })).toMatchObject({ ok: false, reason: /업데이트/ })
    expect(refuse({ mode: 'other' }).ok).toBe(false)
    expect(refuse({ students: [] })).toMatchObject({ ok: false, reason: /한 명도/ })
    expect(refuse({ students: [{ name: '김하늘', text: '' }] })).toMatchObject({
      ok: false,
      reason: /글이 있는 학생/,
    })
    expect(refuse({ students: [{ name: 1, text: '가' }] }).ok).toBe(false)
    expect(
      refuse({ students: Array.from({ length: 61 }, () => ({ name: '', text: '가' })) }),
    ).toMatchObject({ ok: false, reason: /60명/ })
    expect(refuse({ createdAt: 'x' }).ok).toBe(false)
    expect(parseRecordPackage('x'.repeat(100_001), now)).toMatchObject({
      ok: false,
      reason: /커요/,
    })
  })

  it('counts bytes as NEIS does', () => {
    expect(neisBytes('탐구에 적극적으로 참여함.')).toBe(36)
    expect(neisBytes('a\n가')).toBe(6)
  })
})
