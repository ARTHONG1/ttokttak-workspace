import { describe, expect, it } from 'vitest'
import { PumuiOutbox } from '../../src/main/pumui-outbox'
import { createPumuiTools } from '../../src/main/mcp/tools/pumui-tools'

const args = {
  title: '과학실 실험 도구 구입',
  summary: '1. 관련:\n2. 구입하고자 합니다.',
  items: [
    { description: '비커 500ml', specification: '유리', unit: '개', quantity: 4, unitPrice: 3000 },
    { description: '배송비', unit: '식', quantity: 1, unitPrice: 3000 },
  ],
}

describe('pumui MCP tools', () => {
  it('checks the 품의 and holds it for the extension', async () => {
    const box = new PumuiOutbox()
    const [send, status] = createPumuiTools(box)
    expect(await send.handler(args)).toMatchObject({ held: true, items: 2, total: 15000 })
    expect(await status.handler({})).toEqual({ waiting: 1 })
    const pkg = JSON.parse(box.take()!)
    expect(pkg.items[0]).toMatchObject({ description: '비커 500ml', amount: 12000 })
  })

  it('refuses a 품의 the extension would refuse', async () => {
    const [send] = createPumuiTools(new PumuiOutbox())
    expect(() => send.handler({ ...args, title: '짧음' })).toThrow(
      '품의 제목은 5자 이상이어야 해요.',
    )
  })

  it('tells the agent it neither sends nor fills anything', () => {
    const [send] = createPumuiTools(new PumuiOutbox())
    expect(send.description).toContain('nothing is sent anywhere')
    expect(send.description).toContain('saving and approval stay with the teacher')
  })
})
