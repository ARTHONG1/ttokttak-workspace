// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { fillGrid, type FillOptions } from '../../../src/features/neis-record/fill'
import { mountFakeNeis } from '../../fixtures/fake-neis-grid'

const wait = (): Promise<void> => Promise.resolve()
const options = (over: Partial<FillOptions> = {}): FillOptions => ({
  checkNames: true,
  whenFilled: 'append',
  from: 0,
  ...over,
})

const CLASS = [{ name: '김하늘' }, { name: '이바다' }, { name: '박나래' }, { name: '최우주' }]
const WORK = [
  { name: '김하늘', text: '탐구에 적극적임.' },
  { name: '이바다', text: '관찰 일지를 꼼꼼히 씀.' },
  { name: '박나래', text: '발표를 잘함.' },
]

beforeEach(() => {
  document.body.replaceChildren()
})

describe('filling the NEIS grid', () => {
  it('types each text into its row, from the selected row down', async () => {
    const fake = mountFakeNeis(document, CLASS)
    fake.select(0)
    const seen: number[] = []
    const result = await fillGrid(document, WORK, options(), {
      wait,
      progress: (i) => seen.push(i),
    })
    expect(result).toEqual({ written: 3, passed: 0, next: 3, stop: null })
    expect(fake.texts()).toEqual(['탐구에 적극적임.', '관찰 일지를 꼼꼼히 씀.', '발표를 잘함.', ''])
    expect(seen).toEqual([0, 1, 2])
    // it stays on the last student's row
    expect(fake.selected()).toBe(2)
  })

  it('writes after a text that is already there, or instead of it', async () => {
    const rows = [{ name: '김하늘', text: '성실함.' }, { name: '이바다' }]
    const one = [{ name: '김하늘', text: '탐구에 적극적임.' }]
    let fake = mountFakeNeis(document, rows)
    fake.select(0)
    await fillGrid(document, one, options({ whenFilled: 'append' }), { wait })
    expect(fake.texts()[0]).toBe('성실함. 탐구에 적극적임.')

    document.body.replaceChildren()
    fake = mountFakeNeis(document, rows)
    fake.select(0)
    await fillGrid(document, one, options({ whenFilled: 'replace' }), { wait })
    expect(fake.texts()[0]).toBe('탐구에 적극적임.')
  })

  it('passes over a student without a text and keeps the rows after it in step', async () => {
    const fake = mountFakeNeis(document, [
      CLASS[0],
      { name: '이바다', text: '지난 학기 글.' },
      CLASS[2],
      CLASS[3],
    ])
    fake.select(0)
    const work = [WORK[0], { name: '이바다', text: '' }, WORK[2]]
    const result = await fillGrid(document, work, options({ whenFilled: 'replace' }), { wait })
    expect(result).toMatchObject({ written: 2, passed: 1, stop: null })
    // the row passed over keeps what it had
    expect(fake.texts()).toEqual(['탐구에 적극적임.', '지난 학기 글.', '발표를 잘함.', ''])
  })

  it("stops before it writes into another student's row", async () => {
    const fake = mountFakeNeis(document, CLASS)
    // the teacher clicked the second student, the work starts with the first
    fake.select(1)
    const result = await fillGrid(document, WORK, options(), { wait })
    expect(result).toMatchObject({ written: 0, next: 0, stop: { reason: 'name' } })
    expect(fake.texts()).toEqual(['', '', '', ''])
  })

  it('fills in order without the name check when the teacher turns it off', async () => {
    const fake = mountFakeNeis(document, CLASS)
    fake.select(1)
    const result = await fillGrid(document, WORK.slice(0, 2), options({ checkNames: false }), {
      wait,
    })
    expect(result.stop).toBeNull()
    expect(fake.texts()).toEqual(['', '탐구에 적극적임.', '관찰 일지를 꼼꼼히 씀.', ''])
  })

  it('stops when the grid does not move on, and says where to go on', async () => {
    const fake = mountFakeNeis(document, CLASS, { stuckAt: 0 })
    fake.select(0)
    const result = await fillGrid(document, WORK, options(), { wait })
    expect(result).toMatchObject({ written: 1, next: 1, stop: { reason: 'stuck' } })
    // the second text did not go on top of the first student's
    expect(fake.texts()).toEqual(['탐구에 적극적임.', '', '', ''])
  })

  it('goes on from a student on the row the teacher selects', async () => {
    const fake = mountFakeNeis(document, CLASS)
    fake.select(1)
    const result = await fillGrid(document, WORK, options({ from: 1 }), { wait })
    expect(result).toEqual({ written: 2, passed: 0, next: 3, stop: null })
    expect(fake.texts()).toEqual(['', '관찰 일지를 꼼꼼히 씀.', '발표를 잘함.', ''])
  })

  it('stops without a selected row, when no editor opens, and when told to', async () => {
    mountFakeNeis(document, CLASS)
    expect(await fillGrid(document, WORK, options(), { wait })).toMatchObject({
      written: 0,
      stop: { reason: 'no-row' },
    })

    document.body.replaceChildren()
    let fake = mountFakeNeis(document, CLASS, { noEditorAt: 1 })
    fake.select(0)
    expect(await fillGrid(document, WORK, options(), { wait })).toMatchObject({
      written: 1,
      next: 1,
      stop: { reason: 'no-editor' },
    })

    document.body.replaceChildren()
    fake = mountFakeNeis(document, CLASS)
    fake.select(0)
    let asked = 0
    const result = await fillGrid(document, WORK, options(), {
      wait,
      shouldStop: () => ++asked > 2,
    })
    expect(result).toMatchObject({ written: 2, next: 2, stop: { reason: 'stopped' } })
    expect(fake.texts()).toEqual(['탐구에 적극적임.', '관찰 일지를 꼼꼼히 씀.', '', ''])
  })
})
