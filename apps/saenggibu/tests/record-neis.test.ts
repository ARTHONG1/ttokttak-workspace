import { describe, expect, it } from 'vitest'
import type { Student, StudentFields } from '../src/renderer/src/record/record-core'
import { LONG_NOTES, applyNeisClass } from '../src/renderer/src/record/record-neis'
import type { NeisClassStudent } from '../src/shared/neis-class'

/** the class list read from NEIS, put into the list the teacher already has */
let next = 0
const make = (fields: Partial<StudentFields> = {}): Student => ({
  id: 'n' + next++,
  name: '',
  level: '상',
  notes: '',
  result: '',
  ...fields,
})
const neis = (no: string, name: string, records: string[] = []): NeisClassStudent => ({
  cls: '3',
  no,
  name,
  records: records.map((text, i) => ({ date: '2026031' + i, text })),
})
const CLASS = [neis('1', '김하늘'), neis('2', '이바다'), neis('3', '박구름')]

describe('putting the NEIS class into the list', () => {
  it('fills an empty list in the NEIS order', () => {
    const out = applyNeisClass([make()], CLASS, { withRecords: false }, make)
    expect(out.students.map((s) => s.name)).toEqual(['김하늘', '이바다', '박구름'])
    expect(out).toMatchObject({ added: 3, matched: 0, kept: 0, notesFilled: 0 })
  })

  it("keeps a listed student's notes and text, matched by name whatever the spacing", () => {
    const had = make({ name: '이 바다', notes: '화분을 돌봄.', result: '성실함.' })
    const out = applyNeisClass([had], CLASS, { withRecords: false }, make)
    expect(out.students.map((s) => s.name)).toEqual(['김하늘', '이바다', '박구름'])
    expect(out.students[1]).toMatchObject({ id: had.id, notes: '화분을 돌봄.', result: '성실함.' })
    expect(out).toMatchObject({ added: 2, matched: 1 })
  })

  it('keeps a student NEIS does not list at the end, and drops empty rows', () => {
    const other = make({ name: '최나리', result: '전학 예정.' })
    const out = applyNeisClass([make(), other], CLASS, { withRecords: false }, make)
    expect(out.students.map((s) => s.name)).toEqual(['김하늘', '이바다', '박구름', '최나리'])
    expect(out.kept).toBe(1)
  })

  it('puts the 누가기록 into the notes: as they are, after notes already written, never twice', () => {
    const had = make({ name: '이바다', notes: '청소 당번을 성실히 함.' })
    const same = make({ name: '박구름', notes: '발표를 잘함.' })
    const out = applyNeisClass(
      [had, same],
      [
        neis('1', '김하늘', ['질문을 자주 함.']),
        neis('2', '이바다', ['화분을 돌봄.']),
        neis('3', '박구름', ['발표를 잘함.']),
      ],
      { withRecords: true },
      make,
    )
    expect(out.students.map((s) => s.notes)).toEqual([
      '질문을 자주 함.',
      '청소 당번을 성실히 함.\n화분을 돌봄.',
      '발표를 잘함.',
    ])
    expect(out.notesFilled).toBe(2)
  })

  it('leaves the notes alone without the 누가기록 choice', () => {
    const out = applyNeisClass(
      [make()],
      [neis('1', '김하늘', ['질문을 자주 함.'])],
      { withRecords: false },
      make,
    )
    expect(out.students[0].notes).toBe('')
  })

  it('adds only the records not yet in the notes when the class is taken again', () => {
    const first = applyNeisClass(
      [make()],
      [neis('1', '김하늘', ['질문을 자주 함.', '화분을 돌봄.'])],
      { withRecords: true },
      make,
    ).students
    const handWritten = [{ ...first[0], notes: first[0].notes + '\n발표를 잘함.' }]
    const again = applyNeisClass(
      handWritten,
      [neis('1', '김하늘', ['질문을 자주 함.', '화분을  돌봄.', '발표를 잘함.', '모둠을 이끔.'])],
      { withRecords: true },
      make,
    )
    expect(again.students[0].notes).toBe(
      '질문을 자주 함.\n화분을 돌봄.\n발표를 잘함.\n모둠을 이끔.',
    )
    expect(again.notesFilled).toBe(1)
    const unchanged = applyNeisClass(
      again.students,
      [neis('1', '김하늘', ['모둠을 이끔.'])],
      { withRecords: true },
      make,
    )
    expect(unchanged.students[0].notes).toBe(again.students[0].notes)
    expect(unchanged.notesFilled).toBe(0)
  })

  it('says when the list would hold more than one list can, rather than lose the rest', () => {
    const listed = Array.from({ length: 30 }, (_, i) => make({ name: '작년' + i }))
    const thisYear = Array.from({ length: 25 }, (_, i) => neis(String(i + 1), '올해' + i))
    const out = applyNeisClass(listed, thisYear, { withRecords: false }, make)
    expect(out).toMatchObject({ tooMany: true, kept: 30 })
    expect(out.keptNames.slice(0, 2)).toEqual(['작년0', '작년1'])
    expect(applyNeisClass([], thisYear, { withRecords: false }, make).tooMany).toBe(false)
  })

  it('names the students NEIS lists twice that the list has, matched in the list order', () => {
    const a = make({ name: '김민준', result: '첫째.' })
    const b = make({ name: '김민준', result: '둘째.' })
    const out = applyNeisClass(
      [a, b],
      [neis('3', '김민준'), neis('4', '이바다'), neis('15', '김민준')],
      { withRecords: false },
      make,
    )
    expect(out.students.map((s) => s.id)).toEqual([a.id, expect.any(String), b.id])
    expect(out.sameNames).toEqual(['김민준'])
    expect(
      applyNeisClass([], [neis('3', '김민준'), neis('15', '김민준')], { withRecords: false }, make)
        .sameNames,
    ).toEqual([])
  })

  it('counts the students whose notes grow past what the built-in AI reads at once', () => {
    const long = Array.from(
      { length: 60 },
      (_, i) => i + '번째 날 친구를 도와 교실 정리를 함께 했음.',
    )
    const out = applyNeisClass(
      [],
      [neis('1', '김하늘', long), neis('2', '이바다', ['짧은 기록.'])],
      { withRecords: true },
      make,
    )
    expect(out.students[0].notes.length).toBeGreaterThan(LONG_NOTES)
    expect(out).toMatchObject({ notesFilled: 2, longNotes: 1 })
  })
})
