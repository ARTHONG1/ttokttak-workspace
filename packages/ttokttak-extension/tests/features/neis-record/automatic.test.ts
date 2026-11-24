// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { fillProtectedGrid, probeRecord } from '../../../src/features/neis-record/automatic'
import { mountFakeNeis } from '../../fixtures/fake-neis-grid'

const students = [
  { name: '김하늘', text: '탐구에 참여함.' },
  { name: '이바다', text: '기록함.' },
]
const headers = {
  subject: '세부능력 및 특기사항',
  behavior: '행동특성 및 종합의견',
  activity: '특기사항(자율활동)',
}
const wait = async (): Promise<void> => {}

function screen(label: string, existing = '') {
  return mountFakeNeis(document, [{ name: '김하늘', text: existing }, { name: '이바다' }], {
    column: label,
  })
}

beforeEach(() => document.body.replaceChildren())

it.each(['subject', 'behavior', 'activity'] as const)(
  'waits for the %s column and exact first student, then verifies committed rows',
  async (mode) => {
    const fake = screen(headers[mode])
    expect(probeRecord(document, mode, students[0].name).state).toBe('waiting')
    fake.select(1)
    expect(probeRecord(document, mode, students[0].name).state).toBe('waiting')
    fake.select(0)
    const ready = probeRecord(document, mode, students[0].name)
    expect(ready.state).toBe('ready')
    if (ready.state !== 'ready') throw new Error('expected ready')
    expect(
      await fillProtectedGrid(document, mode, ready.target, students, () => true, wait),
    ).toMatchObject({ ok: true, written: 2 })
    expect(fake.texts()).toEqual(['탐구에 참여함.', '기록함.'])
  },
)

it('rejects the wrong column, competing grids, partial names and existing text', async () => {
  const fake = screen(headers.behavior, '기존 글')
  fake.select(0)
  expect(probeRecord(document, 'subject', '김하늘').state).toBe('absent')
  expect(probeRecord(document, 'behavior', '하늘').state).toBe('waiting')
  const ready = probeRecord(document, 'behavior', '김하늘')
  if (ready.state !== 'ready') throw new Error('expected ready')
  expect(
    await fillProtectedGrid(document, 'behavior', ready.target, students, () => true, wait),
  ).toMatchObject({ ok: false, written: 0 })
  expect(fake.edits()).toBe(0)
  screen(headers.behavior).select(0)
  expect(probeRecord(document, 'behavior', '김하늘').state).toBe('blocked')
})

it('never types after cancellation or selection change while the editor opens', async () => {
  const fake = screen(headers.subject)
  fake.select(0)
  const ready = probeRecord(document, 'subject', '김하늘')
  if (ready.state !== 'ready') throw new Error('expected ready')
  let active = true
  expect(
    await fillProtectedGrid(
      document,
      'subject',
      ready.target,
      students,
      () => active,
      async () => {
        active = false
        fake.select(1)
      },
    ),
  ).toMatchObject({ ok: false, written: 0 })
  expect(fake.edits()).toBe(0)
  expect(fake.texts()).toEqual(['', ''])
})

it('reports only verified writes when the grid discards the commit', async () => {
  const fake = screen(headers.subject)
  fake.select(0)
  fake.grid.addEventListener(
    'keydown',
    (event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        const editor = event.target as HTMLTextAreaElement
        editor.value = '화면이 다른 값으로 바꿈.'
      }
    },
    true,
  )
  const ready = probeRecord(document, 'subject', '김하늘')
  if (ready.state !== 'ready') throw new Error('expected ready')
  expect(
    await fillProtectedGrid(document, 'subject', ready.target, students, () => true, wait),
  ).toMatchObject({ ok: false, written: 0 })
  expect(fake.texts()[1]).toBe('')
})
