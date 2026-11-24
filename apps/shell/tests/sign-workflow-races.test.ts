/** @vitest-environment jsdom */
import { StrictMode, act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pdfApi = vi.hoisted(() => ({ getDocument: vi.fn() }))
const signatureApi = vi.hoisted(() => ({
  readSignPdf: vi.fn().mockResolvedValue({ pageCount: 1 }),
  stampSignatures: vi.fn(),
}))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfApi.getDocument,
}))
vi.mock('../src/renderer/src/sign/sign-stamp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/renderer/src/sign/sign-stamp')>()),
  ...signatureApi,
}))

import { TtokSign } from '../src/renderer/src/sign/TtokSign'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver = class {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
} as unknown as typeof IntersectionObserver

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  localStorage.clear()
  pdfApi.getDocument.mockReset()
  signatureApi.readSignPdf.mockClear()
  signatureApi.stampSignatures.mockReset()
  Reflect.deleteProperty(window, 'aiOffice')
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function mount(strict = false) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  const content = createElement(TtokSign, { onBack: () => {} })
  await act(async () => root.render(strict ? createElement(StrictMode, null, content) : content))
  return host
}

function fakePdf() {
  const destroy = vi.fn().mockResolvedValue(undefined)
  const pdf = {
    numPages: 1,
    loadingTask: { destroy },
    getPage: vi.fn().mockResolvedValue({
      getViewport: () => ({ width: 595, height: 842 }),
      render: () => ({ cancel: vi.fn(), promise: Promise.resolve() }),
    }),
  }
  return { pdf, destroy }
}

function mockOpen() {
  const openSignDocument = vi.fn().mockResolvedValue({
    ok: true,
    name: '보고서.pdf',
    converted: false,
    bytes: new Uint8Array([1, 2, 3]),
  })
  Object.defineProperty(window, 'aiOffice', {
    configurable: true,
    value: {
      openSignDocument,
      saveFeatureFile: vi.fn().mockResolvedValue('/documents/보고서_서명.pdf'),
    },
  })
  return openSignDocument
}

describe('똑딱서명 비동기 작업 보호', () => {
  it('PDF 쪽을 그리지 못하면 오류를 알리고 해당 쪽을 다시 그릴 수 있다', async () => {
    const { pdf, destroy } = fakePdf()
    const render = vi
      .fn()
      .mockImplementationOnce(() => ({
        cancel: vi.fn(),
        promise: Promise.reject(new Error('canvas failed')),
      }))
      .mockReturnValue({ cancel: vi.fn(), promise: Promise.resolve() })
    pdf.getPage.mockResolvedValue({
      getViewport: () => ({ width: 595, height: 842 }),
      render,
    })
    pdfApi.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
    mockOpen()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const host = await mount()
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click(),
      )
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        '이 쪽을 표시하지 못했어요.',
      )
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-testid="ts-page-retry"]')?.click(),
      )
      expect(render).toHaveBeenCalledTimes(2)
      expect(host.querySelector('[data-testid="ts-page-retry"]')).toBeNull()
    } finally {
      warn.mockRestore()
    }
  })

  it('서명 그림 저장 창을 빠르게 두 번 열지 않는다', async () => {
    localStorage.setItem(
      'ttokttak-sign:pictures',
      JSON.stringify([
        { id: 'picture-1', url: 'data:image/png;base64,AAAA', width: 100, height: 30 },
      ]),
    )
    mockOpen()
    const pending = deferred<string | null>()
    const saveFeatureFile = vi.fn(() => pending.promise)
    window.aiOffice.saveFeatureFile = saveFeatureFile
    const host = await mount()
    const button = host.querySelector<HTMLButtonElement>('[data-testid="ts-picture-download"]')!
    await act(async () => {
      button.click()
      button.click()
    })
    expect(saveFeatureFile).toHaveBeenCalledTimes(1)
    pending.resolve('/documents/서명.png')
    await act(async () => {
      await pending.promise
    })
  })

  it('저장한 PDF를 열지 못하면 오류를 보여 준다', async () => {
    localStorage.setItem(
      'ttokttak-sign:pictures',
      JSON.stringify([
        { id: 'picture-1', url: 'data:image/png;base64,AAAA', width: 100, height: 30 },
      ]),
    )
    const { pdf, destroy } = fakePdf()
    pdfApi.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
    mockOpen()
    const openPath = vi.fn().mockRejectedValue(new Error('open failed'))
    Object.assign(window.aiOffice, { openPath })
    signatureApi.stampSignatures.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const host = await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="ts-picture"]')?.click(),
    )
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-save"]')?.click())
    const openButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.ts-saved button'),
    ).find((button) => button.textContent?.includes('열어 보기'))
    expect(openButton).toBeDefined()
    await act(async () => openButton?.click())
    expect(openPath).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('저장한 문서를 열지 못했어요.')
  })

  it('저장한 PDF가 없어 열기 요청이 거절되면 오류를 보여 준다', async () => {
    localStorage.setItem(
      'ttokttak-sign:pictures',
      JSON.stringify([
        { id: 'picture-1', url: 'data:image/png;base64,AAAA', width: 100, height: 30 },
      ]),
    )
    const { pdf, destroy } = fakePdf()
    pdfApi.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
    mockOpen()
    const openPath = vi.fn().mockResolvedValue(false)
    Object.assign(window.aiOffice, { openPath })
    signatureApi.stampSignatures.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const host = await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="ts-picture"]')?.click(),
    )
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-save"]')?.click())
    const openButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.ts-saved button'),
    ).find((button) => button.textContent?.includes('열어 보기'))
    await act(async () => openButton?.click())
    expect(openPath).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('저장한 문서를 열지 못했어요.')
  })

  it('StrictMode의 effect 재실행 후에도 문서를 열 수 있다', async () => {
    const { pdf, destroy } = fakePdf()
    pdfApi.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
    mockOpen()
    const host = await mount(true)
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    expect(pdfApi.getDocument).toHaveBeenCalledTimes(1)
    expect(host.querySelectorAll('.ts-page')).toHaveLength(1)
  })

  it('문서 검증 중 화면 이탈 시 뒤늦은 PDF 로딩을 시작하지 않는다', async () => {
    const delayed = deferred<{ pageCount: number }>()
    signatureApi.readSignPdf.mockReturnValueOnce(delayed.promise)
    mockOpen()
    const host = await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    cleanup?.()
    cleanup = undefined
    await act(async () => delayed.resolve({ pageCount: 1 }))
    expect(pdfApi.getDocument).not.toHaveBeenCalled()
  })

  it('PDF 로딩 중 화면을 나가면 로딩 작업을 즉시 정리한다', async () => {
    const delayed = deferred<ReturnType<typeof fakePdf>['pdf']>()
    const { destroy } = fakePdf()
    pdfApi.getDocument.mockReturnValue({ promise: delayed.promise, destroy })
    mockOpen()
    const host = await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    cleanup?.()
    cleanup = undefined
    expect(destroy).toHaveBeenCalledTimes(1)
    await act(async () => delayed.resolve(fakePdf().pdf))
  })

  it('서명 PDF 생성 중 화면 이탈 시 파일 저장 창을 열지 않는다', async () => {
    localStorage.setItem(
      'ttokttak-sign:pictures',
      JSON.stringify([
        { id: 'picture-1', url: 'data:image/png;base64,AAAA', width: 100, height: 30 },
      ]),
    )
    const { pdf, destroy } = fakePdf()
    pdfApi.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
    mockOpen()
    const saveFeatureFile = window.aiOffice.saveFeatureFile as ReturnType<typeof vi.fn>
    const delayed = deferred<Uint8Array>()
    signatureApi.stampSignatures.mockReturnValue(delayed.promise)
    const host = await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="ts-picture"]')?.click(),
    )
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-save"]')?.click())
    cleanup?.()
    cleanup = undefined
    await act(async () => delayed.resolve(new Uint8Array([1, 2, 3])))
    expect(saveFeatureFile).not.toHaveBeenCalled()
  })

  it('문서 열기 중 화면을 벗어나면 늦게 열린 PDF도 정리한다', async () => {
    const delayed = deferred<ReturnType<typeof fakePdf>['pdf']>()
    const { pdf, destroy } = fakePdf()
    pdfApi.getDocument.mockReturnValue({ promise: delayed.promise, destroy })
    mockOpen()
    const host = await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    cleanup?.()
    cleanup = undefined
    await act(async () => delayed.resolve(pdf))
    expect(destroy).toHaveBeenCalled()
  })

  it('서명 저장 중 그림을 지우면 이전 배치의 저장 완료 표시를 남기지 않는다', async () => {
    localStorage.setItem(
      'ttokttak-sign:pictures',
      JSON.stringify([
        { id: 'picture-1', url: 'data:image/png;base64,AAAA', width: 100, height: 30 },
      ]),
    )
    const { pdf, destroy } = fakePdf()
    pdfApi.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
    mockOpen()
    const delayed = deferred<Uint8Array>()
    signatureApi.stampSignatures.mockReturnValue(delayed.promise)
    const host = await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-open"]')?.click())
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="ts-picture"]')?.click(),
    )
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="ts-save"]')?.click())
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="이 서명 그림 지우기"]')?.click(),
    )
    await act(async () => delayed.resolve(new Uint8Array([1, 2, 3])))
    expect(host.querySelector('.ts-saved')).toBeNull()
  })
})
