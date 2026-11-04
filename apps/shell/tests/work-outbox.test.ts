import { describe, expect, it } from 'vitest'
import { buildPumuiPackage } from '@genoffice/ttokttak-extension/package'
import { OUTBOX_MAX, OUTBOX_TTL_MS, WorkOutbox } from '../src/main/work-outbox'

const pkg = (title: string) =>
  JSON.stringify(
    buildPumuiPackage({
      title,
      summary: '',
      items: [
        {
          description: '볼펜',
          specification: '',
          unit: '개',
          quantity: 2,
          unitPrice: 500,
          amount: 1000,
        },
      ],
    }),
  )

const PUMUI = 'edufine-pumui'

describe('WorkOutbox', () => {
  it('hands out the newest 품의 once', () => {
    const box = new WorkOutbox()
    expect(box.enqueue(PUMUI, pkg('첫 번째 품의 제목'), 0)).toEqual({
      ok: true,
      title: '첫 번째 품의 제목',
    })
    box.enqueue(PUMUI, pkg('두 번째 품의 제목'), 1)
    expect(JSON.parse(box.take(PUMUI, 2)!).title).toBe('두 번째 품의 제목')
    expect(JSON.parse(box.take(PUMUI, 3)!).title).toBe('첫 번째 품의 제목')
    expect(box.take(PUMUI, 4)).toBeNull()
  })

  it('refuses anything that is not a valid 품의, and a task it does not know', () => {
    const box = new WorkOutbox()
    expect(box.enqueue(PUMUI, '볼펜 주세요', 0)).toEqual({
      ok: false,
      reason: '똑딱작업실에서 만든 품의가 아니에요.',
    })
    expect(box.enqueue('neis-x', pkg('나이스 작업 제목'), 0)).toEqual({
      ok: false,
      reason: '알 수 없는 업무예요.',
    })
    expect(box.size(PUMUI, 0)).toBe(0)
    expect(box.take('neis-x', 0)).toBeNull()
  })

  it('keeps each task to itself', () => {
    const ok = (text: string) => ({ ok: true as const, title: text })
    const box = new WorkOutbox({ a: ok, b: ok })
    box.enqueue('a', 'A1', 0)
    box.enqueue('b', 'B1', 1)
    box.enqueue('a', 'A2', 2)
    expect(box.take('b', 3)).toBe('B1')
    expect(box.take('b', 3)).toBeNull()
    expect(box.take('a', 3)).toBe('A2')
    expect(box.size('a', 3)).toBe(1)
  })

  it('forgets work after thirty minutes and keeps at most five per task', () => {
    const box = new WorkOutbox()
    for (let i = 0; i < OUTBOX_MAX + 2; i++) box.enqueue(PUMUI, pkg('품의 제목 번호 ' + i), i)
    expect(box.size(PUMUI, 10)).toBe(OUTBOX_MAX)
    expect(box.take(PUMUI, OUTBOX_TTL_MS + 100)).toBeNull()
  })

  it('gives one task a queue of its own to hand around', () => {
    const box = new WorkOutbox()
    const pumui = box.of(PUMUI)
    expect(pumui.enqueue(pkg('한 업무 대기열 제목'))).toMatchObject({ ok: true })
    expect(pumui.size()).toBe(1)
    expect(JSON.parse(box.take(PUMUI)!).title).toBe('한 업무 대기열 제목')
  })
})
