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
      aiOffice: {
        recents: async () => ({ entries: [] }),
        browse: async () => {},
        notices: async () => ({
          popups: [],
          promos: [
            {
              id: 'book',
              title: '교실로 ON 제미나이',
              text: '교실에서 Gemini 바로 쓰기',
              linkUrl: 'https://example.com/book',
              linkLabel: '책 보기',
              imageSrc: null,
            },
          ],
        }),
      },
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
    // the promos from the 알림·홍보 목록 sit beside who made the app
    const cards = [...host.querySelectorAll('.home-promos .promo-card')]
    expect(cards.map((card) => card.querySelector('.promo-title')?.textContent)).toEqual([
      '인천봉수초 홍찬우가 만들었어요',
      '교실로 ON 제미나이',
    ])
    expect(cards[1]!.getAttribute('href')).toBe('https://example.com/book')
  },
)
