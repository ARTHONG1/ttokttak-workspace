/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TtokConvert } from '../src/renderer/src/convert/TtokConvert'
import { TtokOrganize } from '../src/renderer/src/organize/TtokOrganize'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

async function mount(component: ReturnType<typeof createElement>) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  await act(async () => root.render(component))
  return host
}

async function click(host: HTMLElement, selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button?.click())
}

const convertDoc = {
  ok: true as const,
  token: 'convert-1',
  name: '학습자료',
  extension: 'docx',
  size: 10,
  targets: [
    { format: 'pdf' as const, title: 'PDF', summary: 'PDF로', steps: ['변환'], extension: 'pdf' },
  ],
}

const organizeDoc = {
  ok: true as const,
  token: 'organize-1',
  family: 'pdf' as const,
  files: [{ id: 'file-1', name: '회의록', extension: 'pdf', size: 10 }],
  cards: [
    { action: 'split' as const, title: '나누기', summary: '나눠 저장' },
    { action: 'remove' as const, title: '쪽 지우기', summary: '쪽을 지워 저장' },
  ],
}

describe('똑딱업무 화면의 비동기 작업', () => {
  it('문서 변경 선택 중 이전 변환 카드 실행을 막는다', async () => {
    const pending = deferred<typeof convertDoc>()
    const openConvertDocument = vi
      .fn()
      .mockResolvedValueOnce(convertDoc)
      .mockImplementationOnce(() => pending.promise)
    const runConvert = vi.fn()
    Object.assign(window, {
      aiOffice: { onConvertProgress: () => () => {}, openConvertDocument, runConvert },
    })
    const host = await mount(createElement(TtokConvert, { onBack: () => {} }))
    await click(host, '[data-testid="tc-open"]')
    await click(host, '.tc-file-change')
    await click(host, '[data-testid="tc-target-pdf"]')
    expect(runConvert).not.toHaveBeenCalled()
    pending.resolve(convertDoc)
    await act(async () => {
      await pending.promise
    })
  })

  it('동일한 변환을 빠르게 두 번 실행하지 않는다', async () => {
    const pending = deferred<{ ok: false; error: string }>()
    const runConvert = vi.fn(() => pending.promise)
    Object.assign(window, {
      aiOffice: {
        onConvertProgress: () => () => {},
        openConvertDocument: async () => convertDoc,
        runConvert,
      },
    })
    const host = await mount(createElement(TtokConvert, { onBack: () => {} }))
    await click(host, '[data-testid="tc-open"]')
    const button = host.querySelector<HTMLButtonElement>('[data-testid="tc-target-pdf"]')!
    await act(async () => {
      button.click()
      button.click()
    })
    expect(runConvert).toHaveBeenCalledTimes(1)
    pending.resolve({ ok: false, error: '오류' })
    await act(async () => {
      await pending.promise
    })
  })

  it('변환 결과 저장 창을 중복으로 열지 않는다', async () => {
    const pending = deferred<string | null>()
    const saveFeatureFile = vi.fn(() => pending.promise)
    Object.assign(window, {
      aiOffice: {
        onConvertProgress: () => () => {},
        openConvertDocument: async () => convertDoc,
        runConvert: async () => ({
          ok: true,
          bytes: new Uint8Array([1]),
          fileName: '학습자료.pdf',
          extension: 'pdf',
          facts: [],
          warnings: [],
        }),
        saveFeatureFile,
      },
    })
    const host = await mount(createElement(TtokConvert, { onBack: () => {} }))
    await click(host, '[data-testid="tc-open"]')
    await click(host, '[data-testid="tc-target-pdf"]')
    const button = host.querySelector<HTMLButtonElement>('[data-testid="tc-download"]')!
    await act(async () => {
      button.click()
      button.click()
    })
    expect(saveFeatureFile).toHaveBeenCalledTimes(1)
    pending.resolve('/documents/학습자료.pdf')
    await act(async () => {
      await pending.promise
    })
  })

  it('정리 결과 저장 창을 중복으로 열지 않는다', async () => {
    const pending = deferred<string | null>()
    const saveFeatureFile = vi.fn(() => pending.promise)
    Object.assign(window, {
      aiOffice: {
        onOrganizeProgress: () => () => {},
        openOrganizeDocuments: async () => ({
          ...organizeDoc,
          cards: [{ action: 'shrink', title: '용량 줄이기', summary: '압축' }],
        }),
        runOrganize: async () => ({
          ok: true,
          bytes: new Uint8Array([1]),
          fileName: '회의록.pdf',
          extension: 'pdf',
          facts: [],
          warnings: [],
        }),
        closeOrganize: async () => {},
        saveFeatureFile,
      },
    })
    const host = await mount(createElement(TtokOrganize, { onBack: () => {} }))
    await click(host, '[data-testid="to-open"]')
    await click(host, '[data-testid="to-card-shrink"]')
    const button = host.querySelector<HTMLButtonElement>('[data-testid="to-download"]')!
    await act(async () => {
      button.click()
      button.click()
    })
    expect(saveFeatureFile).toHaveBeenCalledTimes(1)
    pending.resolve('/documents/회의록.pdf')
    await act(async () => {
      await pending.promise
    })
  })

  it('다른 정리 카드로 이동하면 먼저 요청한 쪽 목록 응답을 무시한다', async () => {
    const earlier = deferred<{
      ok: true
      word: string
      preview: 'text'
      units: { index: number; label: string; text: string }[]
    }>()
    const later = deferred<{
      ok: true
      word: string
      preview: 'text'
      units: { index: number; label: string; text: string }[]
    }>()
    const organizeUnits = vi
      .fn()
      .mockImplementationOnce(() => earlier.promise)
      .mockImplementationOnce(() => later.promise)
    Object.assign(window, {
      aiOffice: {
        onOrganizeProgress: () => () => {},
        openOrganizeDocuments: async () => organizeDoc,
        organizeUnits,
        closeOrganize: async () => {},
      },
    })
    const host = await mount(createElement(TtokOrganize, { onBack: () => {} }))
    await click(host, '[data-testid="to-open"]')
    await click(host, '[data-testid="to-card-split"]')
    await click(host, '.to-setup-actions .sf-secondary')
    await click(host, '[data-testid="to-card-remove"]')
    earlier.resolve({
      ok: true,
      word: '쪽',
      preview: 'text',
      units: [{ index: 0, label: '1쪽', text: '내용' }],
    })
    await act(async () => {
      await earlier.promise
    })
    expect(organizeUnits).toHaveBeenCalledTimes(2)
    // The latest response is allowed to populate the picker; the old response must not.
    expect(host.querySelector('[data-testid="to-unit-0"]')).toBeNull()
  })
})
