/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TrialHome } from '../src/renderer/src/TrialHome'

vi.mock('../src/renderer/src/SpecialFeatures', () => ({ SpecialFeatures: () => null }))
vi.mock('../src/renderer/src/ClassTools', () => ({ ClassTools: () => null }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let clean: (() => void) | undefined
afterEach(() => {
  clean?.()
  delete document.documentElement.dataset.edition
})

it.each(['web', 'desktop'])(
  'shows the same home and an accurate storage note on %s',
  async (edition) => {
    document.documentElement.dataset.edition = edition
    Object.assign(window, {
      aiOffice: { recents: async () => ({ entries: [] }), browse: async () => {} },
      aiOfficeTabs: { onChanged: () => () => {} },
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    clean = () => {
      act(() => root.unmount())
      host.remove()
    }
    await act(async () => root.render(createElement(TrialHome)))
    expect(host.textContent).toContain('문서 업로드')
    expect(host.textContent).toContain('똑딱업무')
    expect(host.textContent).toContain('똑딱수업')
    expect(host.querySelector('.trial-note')?.textContent).toBe(
      edition === 'web'
        ? '체험판은 문서를 잠시만 보관해요. 저장한 뒤 내려받아 두세요.'
        : '작업을 마치면 문서를 저장해 주세요.',
    )
  },
)
