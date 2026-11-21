import { afterEach, describe, expect, it } from 'vitest'
import { classResult, readClassInPage, recordsToNotes } from '../src/shared/neis-class'
import { fakeNeisData, type FakeNeisDataOptions } from './fixtures/fake-neis-data'

/**
 * 나이스에서 가져오기: the class list and its 누가기록 read from the data of an open NEIS
 * screen (a fake one here), never from what the grid happens to draw.
 */
const g = globalThis as unknown as { window?: unknown }
const onPage = (options: FakeNeisDataOptions) => {
  g.window = { cpr: fakeNeisData(options) }
  return readClassInPage()
}
afterEach(() => {
  delete g.window
})

const CLASS = [
  { no: '1', name: '김하늘' },
  { no: '2', name: '이바다' },
  { no: '3', name: '박구름' },
]

describe('reading a NEIS screen', () => {
  it('says so when the page is no NEIS screen', () => {
    g.window = {}
    expect(readClassInPage()).toEqual({ ok: false, kind: 'no-platform' })
  })

  it('says so when no open screen holds a class list', () => {
    expect(onPage({ students: [] })).toEqual({ ok: false, kind: 'no-class' })
  })

  it('reads the class in its order, with each number once and no unnamed row', () => {
    const page = onPage({
      students: [...CLASS, { no: '3', name: '박구름' }, { no: '4', name: '' }],
    })
    expect(page).toMatchObject({
      ok: true,
      students: [
        { cls: '3', no: '1', name: '김하늘' },
        { cls: '3', no: '2', name: '이바다' },
        { cls: '3', no: '3', name: '박구름' },
      ],
      records: [],
      recordsFor: 'none',
    })
  })

  it('finds the data through the grids when it is not looked up by id', () => {
    expect(onPage({ students: CLASS, gridsOnly: true })).toMatchObject({
      ok: true,
      students: [{ name: '김하늘' }, { name: '이바다' }, { name: '박구름' }],
    })
  })

  it("reads the whole class's 누가기록 when each record names its student", () => {
    const page = onPage({
      students: CLASS,
      numbered: true,
      records: [
        { no: '2', date: '20260402', text: '모둠 토의를 이끔.' },
        { no: '1', date: '20260315', text: '질문을 자주 함.' },
        { no: '2', date: '20260310', text: '화분을 돌봄.' },
        { no: '9', date: '20260310', text: '다른 반 학생.' },
      ],
    })
    expect(page).toMatchObject({ ok: true, recordsFor: 'all' })
    const result = classResult(page)
    expect(result).toMatchObject({
      ok: true,
      recordsRead: 3,
      recordsFor: 'all',
      unplaced: 1,
      students: [
        { no: '1', name: '김하늘', records: [{ date: '20260315', text: '질문을 자주 함.' }] },
        {
          no: '2',
          name: '이바다',
          records: [
            { date: '20260310', text: '화분을 돌봄.' },
            { date: '20260402', text: '모둠 토의를 이끔.' },
          ],
        },
        { no: '3', name: '박구름', records: [] },
      ],
    })
  })

  it('gives records without a number to the student selected in the class list', () => {
    const page = onPage({
      students: CLASS,
      selected: 1,
      records: [{ date: '20260310', text: '화분을 돌봄.' }],
    })
    const result = classResult(page)
    expect(result).toMatchObject({ ok: true, recordsFor: 'selected', recordsRead: 1, unplaced: 0 })
    if (result.ok) expect(result.students[1].records).toHaveLength(1)
  })

  it('leaves out records it cannot give to a student, and counts them', () => {
    const result = classResult(
      onPage({ students: CLASS, records: [{ date: '20260310', text: '화분을 돌봄.' }] }),
    )
    expect(result).toMatchObject({ ok: true, recordsRead: 0, unplaced: 1 })
  })

  it("leaves out a record of another class's student with the same number", () => {
    const result = classResult(
      onPage({
        students: CLASS,
        numbered: true,
        records: [
          { cls: '3', no: '1', date: '20260310', text: '질문을 자주 함.' },
          { cls: '5', no: '1', date: '20260311', text: '다른 반 학생.' },
        ],
      }),
    )
    expect(result).toMatchObject({ ok: true, recordsRead: 1, unplaced: 1 })
    if (result.ok)
      expect(result.students[0].records).toEqual([{ date: '20260310', text: '질문을 자주 함.' }])
  })
})

describe('one class only', () => {
  it('reads nothing from a list that mixes classes, and says so', () => {
    const page = onPage({
      students: [
        { cls: '3', no: '1', name: '김하늘' },
        { cls: '5', no: '1', name: '정다운' },
      ],
    })
    expect(page).toEqual({ ok: false, kind: 'many-classes' })
    expect(classResult(page)).toMatchObject({
      ok: false,
      message: expect.stringContaining('여러 반'),
    })
  })

  it('reads the class when another open screen lists the same class, or part of it', () => {
    const page = onPage({
      students: CLASS,
      otherScreens: [{ students: CLASS }, { students: [CLASS[1]] }],
    })
    expect(page).toMatchObject({ ok: true, students: CLASS.map((s) => ({ cls: '3', ...s })) })
  })

  it('picks no class when the open screens list different classes, and says so', () => {
    const other = [
      { cls: '5', no: '1', name: '정다운' },
      { cls: '5', no: '2', name: '한결' },
      { cls: '5', no: '3', name: '오늘' },
      { cls: '5', no: '4', name: '나래' },
    ]
    const page = onPage({ students: CLASS, otherScreens: [{ students: other }] })
    expect(page).toEqual({ ok: false, kind: 'many-lists' })
    expect(classResult(page)).toMatchObject({
      ok: false,
      message: expect.stringContaining('누가기록 화면 하나만'),
    })
    // the same when neither screen names its class
    const unnamed = (s: { no: string; name: string }) => ({ ...s, cls: '' })
    expect(
      onPage({
        students: CLASS.map(unnamed),
        otherScreens: [{ students: other.map(unnamed) }],
      }),
    ).toEqual({ ok: false, kind: 'many-lists' })
  })

  it("takes the 누가기록 screen's list (dsStu) over a list of another name", () => {
    const page = onPage({
      students: CLASS,
      otherScreens: [{ id: 'dsOther', students: [{ cls: '5', no: '1', name: '정다운' }] }],
    })
    expect(page).toMatchObject({ ok: true, students: [{ name: '김하늘' }, {}, {}] })
  })
})

describe('누가기록 as observation notes', () => {
  it('are the records in date order, one a line, each once', () => {
    expect(
      recordsToNotes([
        { date: '20260402', text: '모둠 토의를 이끔.' },
        { date: '20260310', text: ' 화분을 돌봄. ' },
        { date: '20260311', text: '화분을 돌봄.' },
      ]),
    ).toBe('화분을 돌봄.\n모둠 토의를 이끔.')
  })
})
