/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpecialFeatures } from '../src/renderer/src/SpecialFeatures'
import { SchoolRecord } from '../src/renderer/src/record/SchoolRecord'
import { TtokSign } from '../src/renderer/src/sign/TtokSign'
import { SESSIONS_KEY } from '../src/renderer/src/record/record-core'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.restoreAllMocks()
  localStorage.clear()
})

async function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  await act(async () => root.render(element))
  return host
}

async function click(host: HTMLElement, selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button?.click())
}

describe('똑딱업무 저장값 및 저장소 오류', () => {
  it('품의서 저장값에 잘못된 행이 있으면 안전한 행만 불러온다', async () => {
    localStorage.setItem(
      'procurement_temp_storage',
      JSON.stringify({
        title: '학급 용품 구입',
        shoppingCartText: '볼펜 수량 2 가격 500',
        estimateData: [
          null,
          {
            description: '볼펜',
            specification: '',
            unit: '개',
            quantity: 2,
            unitPrice: 500,
            amount: 1000,
          },
        ],
        generatedArticle: '품의서 본문',
      }),
    )
    const host = await mount(createElement(SpecialFeatures, { variant: 'desktop' }))
    await click(host, '[data-testid="special-feature-proposal"]')
    await click(host, '.sf-save button:nth-child(2)')
    expect(host.querySelectorAll('[data-testid="proposal-table"] tbody tr')).toHaveLength(1)
    expect(host.querySelector('[data-testid="proposal-total"]')?.textContent).toBe('1,000')
  })

  it('품의서 저장소 접근이 차단되어도 불러오기 화면이 유지된다', async () => {
    const host = await mount(createElement(SpecialFeatures, { variant: 'desktop' }))
    await click(host, '[data-testid="special-feature-proposal"]')
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === 'procurement_temp_storage') throw new Error('access denied')
      return getItem.call(this, key)
    })
    await click(host, '.sf-save button:nth-child(2)')
    expect(host.querySelector('[data-testid="proposal-title"]')).not.toBeNull()
    expect(host.querySelector('[role="status"]')?.textContent).toContain('읽지 못했어요')
  })

  it('생기부 저장소가 차단되어도 새 작업을 열 수 있다', async () => {
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === SESSIONS_KEY) throw new Error('access denied')
      return getItem.call(this, key)
    })
    const host = await mount(createElement(SchoolRecord, { onBack: () => {} }))
    expect(host.textContent).toContain('생기부')
  })

  it('똑딱서명은 크기가 잘못된 저장 그림을 복원하지 않는다', async () => {
    localStorage.setItem(
      'ttokttak-sign:pictures',
      JSON.stringify([{ id: 'bad', url: 'data:image/png;base64,AAAA', width: 0, height: -5 }]),
    )
    const host = await mount(createElement(TtokSign, { onBack: () => {} }))
    expect(host.querySelectorAll('[data-testid="ts-picture"]')).toHaveLength(0)
  })
})
