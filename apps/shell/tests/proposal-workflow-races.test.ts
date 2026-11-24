/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const askAi = vi.hoisted(() => vi.fn())
vi.mock('../src/renderer/src/special-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/renderer/src/special-common')>()),
  askAi,
}))

import { SpecialFeatures } from '../src/renderer/src/SpecialFeatures'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  localStorage.clear()
  askAi.mockReset()
})

async function click(host: HTMLElement, selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button?.click())
}

describe('품의서 비동기 작업', () => {
  it('생성 도중 전체 초기화하면 늦게 온 AI 결과를 복원하지 않는다', async () => {
    let finish!: (value: string) => void
    askAi.mockImplementation(() => new Promise<string>((resolve) => (finish = resolve)))
    localStorage.setItem(
      'procurement_temp_storage',
      JSON.stringify({
        title: '학급 수업 용품 구입',
        shoppingCartText: '모나미 검정 볼펜 12개 500원 수량 2',
        estimateData: [],
        generatedArticle: null,
      }),
    )
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(SpecialFeatures, { variant: 'desktop' })))
    await click(host, '[data-testid="special-feature-proposal"]')
    await click(host, '.sf-save button:nth-child(2)')
    await click(host, '[data-testid="proposal-generate"]')
    await click(host, '.sf-text-btn')
    await act(async () =>
      finish(
        JSON.stringify({
          items: [
            { description: '볼펜', specification: '', unit: '개', quantity: 2, unitPrice: 500 },
          ],
        }),
      ),
    )
    expect(host.querySelector('[data-testid="proposal-result"]')).toBeNull()
    expect((host.querySelector('[data-testid="proposal-title"]') as HTMLInputElement).value).toBe(
      '',
    )
  })
})
