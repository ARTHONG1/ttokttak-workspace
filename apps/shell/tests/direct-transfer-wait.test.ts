import { describe, expect, it } from 'vitest'
import type { BrowserContext } from 'playwright-core'
import { waitForTransferFrame } from '../src/main/direct-transfer-wait'

const context = { pages: () => [{ isClosed: () => false }] } as unknown as BrowserContext

describe('직접 전송 대기와 취소', () => {
  it('멈춘 화면 검사도 취소하면 즉시 종료한다', async () => {
    const controller = new AbortController()
    const stages: string[] = []
    const work = waitForTransferFrame(context, () => new Promise(() => {}), {
      signal: controller.signal,
      timeoutMs: 2000,
      pollMs: 1000,
      onStage: (stage) => stages.push(stage),
    })
    setTimeout(() => controller.abort(), 20)
    expect(await work).toMatchObject({ cancelled: true })
    expect(stages).toContain('cancelled')
  }, 1500)

  it('멈춘 화면 검사 중에도 시간 제한이 적용된다', async () => {
    const started = Date.now()
    const result = await waitForTransferFrame(context, () => new Promise(() => {}), {
      timeoutMs: 35,
      pollMs: 1000,
    })
    expect(result).toMatchObject({ reason: expect.stringContaining('대기 시간') })
    expect(Date.now() - started).toBeLessThan(700)
  }, 1500)
})
