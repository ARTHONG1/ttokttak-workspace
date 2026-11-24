/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSIONS_KEY } from '../src/renderer/src/record/record-core'

const askRecordAi = vi.hoisted(() => vi.fn())
const sendRecord = vi.hoisted(() => vi.fn())
vi.mock('../src/renderer/src/record/record-ai', () => ({
  askRecordAi,
  cancelRecordAi: vi.fn(),
  studentsAtOnce: vi.fn().mockResolvedValue(1),
  rewordWithAi: vi.fn(),
}))
vi.mock('../src/renderer/src/record/record-send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/renderer/src/record/record-send')>()),
  sendRecord,
}))

import { SchoolRecord } from '../src/renderer/src/record/SchoolRecord'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  localStorage.clear()
  askRecordAi.mockReset()
  sendRecord.mockReset()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'execCommand')
})

async function click(host: HTMLElement, selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button?.click())
}

describe('생기부 작성과 저장 작업 전환', () => {
  it('나이스 전송 중 글을 수정하면 과거 전송 안내를 현재 글에 표시하지 않는다', async () => {
    let finish!: (outcome: { ok: true; route: 'direct'; message: string }) => void
    sendRecord.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(SchoolRecord, { onBack: () => {} })))
    await click(host, '[data-testid="record-tab-behavior"]')
    const setResult = async (value: string) => {
      const result = host.querySelector<HTMLTextAreaElement>('[data-testid="record-result"]')!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
        setter.call(result, value)
        result.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await setResult('첫 번째 작성 내용')
    await click(host, '[data-testid="record-send"]')
    expect(sendRecord).toHaveBeenCalledTimes(1)
    await setResult('나중에 수정한 내용')
    await act(async () => finish({ ok: true, route: 'direct', message: '전송 성공' }))
    expect(host.querySelector('[data-testid="record-send-note"]')).toBeNull()
    expect(host.textContent).toContain('나이스에서 이전 내용의 전송 여부를 확인해 주세요.')
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="record-result"]')?.value).toBe(
      '나중에 수정한 내용',
    )
    await click(host, '[data-testid="record-send"]')
    await act(async () => finish({ ok: true, route: 'direct', message: '두 번째 전송 성공' }))
    expect(host.querySelector('[data-testid="record-send-note"]')).not.toBeNull()
    await setResult('전송 완료 후 다시 수정한 내용')
    expect(host.querySelector('[data-testid="record-send-note"]')).toBeNull()
  })

  it('학생별 복사가 실패하면 성공 안내 대신 오류를 보여 준다', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) },
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(SchoolRecord, { onBack: () => {} })))
    await click(host, '[data-testid="record-tab-behavior"]')
    const result = host.querySelector<HTMLTextAreaElement>('[data-testid="record-result"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(result, '친구들의 의견을 존중함.')
      result.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const copy = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.sr-student-head button'),
    ).find((button) => button.textContent?.trim() === '복사')!
    await act(async () => copy.click())
    expect(host.textContent).toContain('복사하지 못했어요.')
    expect(host.textContent).not.toContain('복사했어요.')
  })

  it('학생 수를 그대로 두고 입력칸을 벗어나도 진행 중인 생성이 유지된다', async () => {
    let finish!: (text: string) => void
    askRecordAi.mockImplementation(() => new Promise<string>((resolve) => (finish = resolve)))
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(SchoolRecord, { onBack: () => {} })))
    await click(host, '[data-testid="record-tab-behavior"]')
    const notes = host.querySelector<HTMLTextAreaElement>('[data-testid="record-notes"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(notes, '모둠 활동에서 서로 돕는 태도를 보임')
      notes.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(host, '[data-testid="record-generate-one"]')
    expect(askRecordAi).toHaveBeenCalledTimes(1)
    const count = host.querySelector<HTMLInputElement>('[data-testid="record-count"]')!
    await act(async () => {
      count.focus()
      count.blur()
    })
    await act(async () => finish('상대방의 의견을 존중하며 활동에 참여함.'))
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="record-result"]')?.value).toBe(
      '상대방의 의견을 존중하며 활동에 참여함.',
    )
  })

  it('AI 생성 중 교사가 관찰 기록을 수정하면 이전 입력의 응답을 반영하지 않는다', async () => {
    let finish!: (text: string) => void
    askRecordAi.mockImplementation(() => new Promise<string>((resolve) => (finish = resolve)))
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(SchoolRecord, { onBack: () => {} })))
    await click(host, '[data-testid="record-tab-behavior"]')
    const setText = async (selector: string, value: string) => {
      const area = host.querySelector<HTMLTextAreaElement>(selector)!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
        setter.call(area, value)
        area.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await setText('[data-testid="record-notes"]', '모둠활동에 성실하게 참여함')
    await click(host, '[data-testid="record-generate-one"]')
    expect(askRecordAi).toHaveBeenCalledTimes(1)
    await setText('[data-testid="record-notes"]', '교사가 다시 관찰한 내용을 추가함')
    await act(async () => finish('이전에 요청한 AI 문장'))
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="record-notes"]')?.value).toBe(
      '교사가 다시 관찰한 내용을 추가함',
    )
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="record-result"]')?.value).toBe('')
    expect(host.textContent).toContain('입력한 내용이 수정되어 이전 AI 응답을 반영하지 않았어요.')
  })

  it('CSV를 연속 선택하면 마지막으로 선택한 파일만 적용한다', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(SchoolRecord, { onBack: () => {} })))
    const csv = host.querySelector<HTMLInputElement>('[data-testid="record-csv-file"]')!
    let firstResolve!: (value: ArrayBuffer) => void
    let secondResolve!: (value: ArrayBuffer) => void
    const first = new Promise<ArrayBuffer>((resolve) => (firstResolve = resolve))
    const second = new Promise<ArrayBuffer>((resolve) => (secondResolve = resolve))
    const select = async (name: string, promise: Promise<ArrayBuffer>) => {
      const file = new File([], name, { type: 'text/csv' })
      Object.defineProperty(file, 'arrayBuffer', { value: () => promise })
      Object.defineProperty(csv, 'files', { configurable: true, value: [file] })
      await act(async () => csv.dispatchEvent(new Event('change', { bubbles: true })))
    }
    const encoded = (name: string) =>
      new TextEncoder().encode('이름,관찰 기록\n' + name + ',성실하게 참여함').buffer
    await select('first.csv', first)
    await select('second.csv', second)
    await act(async () => firstResolve(encoded('먼저선택')))
    await act(async () => secondResolve(encoded('나중선택')))
    expect(host.querySelector<HTMLInputElement>('[data-testid="record-name"]')?.value).toBe(
      '나중선택',
    )
  })

  it('AI 생성 중 같은 학생 ID의 저장 작업을 열면 이전 생성 결과가 섞이지 않는다', async () => {
    let finish!: (text: string) => void
    askRecordAi.mockImplementation(() => new Promise<string>((resolve) => (finish = resolve)))
    localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify([
        {
          id: 'saved-work',
          mode: 'behavior',
          title: '행발 · 1명',
          savedAt: '2026-11-20T00:00:00Z',
          work: {
            length: 'medium',
            instructions: '',
            info: {},
            students: [
              {
                id: 'same-id',
                name: '학생',
                level: '상',
                notes: '협력적인 활동을 보임',
                result: '',
              },
            ],
          },
        },
      ]),
    )
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(SchoolRecord, { onBack: () => {} })))
    const restore = async () => {
      await click(host, '[data-testid="record-open-list"]')
      await click(host, '[data-testid="record-session"] .sf-primary')
    }
    await restore()
    await click(host, '[data-testid="record-generate-one"]')
    expect(askRecordAi).toHaveBeenCalledTimes(1)
    await restore()
    await act(async () => finish('이전 작업의 AI 생성 결과'))
    const result = host.querySelector<HTMLTextAreaElement>('[data-testid="record-result"]')
    expect(result?.value).toBe('')
  })
})
