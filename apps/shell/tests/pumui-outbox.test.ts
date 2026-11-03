import { describe, expect, it } from 'vitest'
import { buildPumuiPackage } from '@genoffice/edufine-link/package'
import { OUTBOX_MAX, OUTBOX_TTL_MS, PumuiOutbox } from '../src/main/pumui-outbox'

const pkg = (title: string) =>
  JSON.stringify(
    buildPumuiPackage({
      title,
      summary: '',
      items: [{ description: '볼펜', specification: '', unit: '개', quantity: 2, unitPrice: 500, amount: 1000 }],
    }),
  )

describe('PumuiOutbox', () => {
  it('hands out the newest 품의 once', () => {
    const box = new PumuiOutbox()
    expect(box.enqueue(pkg('첫 번째 품의 제목'), 0)).toEqual({ ok: true, title: '첫 번째 품의 제목' })
    box.enqueue(pkg('두 번째 품의 제목'), 1)
    expect(JSON.parse(box.take(2)!).title).toBe('두 번째 품의 제목')
    expect(JSON.parse(box.take(3)!).title).toBe('첫 번째 품의 제목')
    expect(box.take(4)).toBeNull()
  })

  it('refuses anything that is not a valid 품의', () => {
    const box = new PumuiOutbox()
    expect(box.enqueue('볼펜 주세요', 0)).toEqual({ ok: false, reason: '똑딱작업실에서 만든 품의가 아니에요.' })
    expect(box.size(0)).toBe(0)
  })

  it('forgets 품의 after thirty minutes and keeps at most five', () => {
    const box = new PumuiOutbox()
    for (let i = 0; i < OUTBOX_MAX + 2; i++) box.enqueue(pkg('품의 제목 번호 ' + i), i)
    expect(box.size(10)).toBe(OUTBOX_MAX)
    expect(box.take(OUTBOX_TTL_MS + 100)).toBeNull()
  })
})

