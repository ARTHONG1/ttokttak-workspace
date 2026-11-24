/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { copyText } from '../src/renderer/src/special-common'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'execCommand')
})

it('클립보드 권한이 없고 대체 복사도 실패하면 실패를 알리고 임시 입력칸을 지운다', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) },
  })
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn().mockReturnValue(false),
  })
  await expect(copyText('생기부 내용')).rejects.toThrow()
  expect(document.querySelector('textarea')).toBeNull()
})
