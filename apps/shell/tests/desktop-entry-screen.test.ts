import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DesktopWelcome } from '../src/renderer/src/DesktopWelcome'
import { DesktopConnectionPage } from '../src/renderer/src/DesktopConnectionPage'
import type { SubscriptionConnection } from '../src/renderer/src/subscription-client'

const inactive = {
  provider: 'codex' as const,
  state: 'signed-out' as const,
  meteredAccepted: false,
}

function connection(status = inactive): SubscriptionConnection {
  const noop = vi.fn()
  return {
    statuses: { codex: status, claude: { provider: 'claude', state: 'not-installed' } },
    busy: false,
    failed: {},
    codexImageAvailable: false,
    install: noop,
    update: noop,
    cancelLogin: noop,
    login: noop,
    switchAccount: noop,
    logout: noop,
    recheck: noop,
    refresh: noop,
    acceptMetered: async () => undefined,
    openInstallHelp: noop,
    openConnectHelp: noop,
  } as SubscriptionConnection
}

describe('desktop entry screens', () => {
  it('preserves the public intro wording and sections, replacing its primary actions', () => {
    const html = renderToStaticMarkup(createElement(DesktopWelcome, {
      onConnect: vi.fn(), onStart: vi.fn(),
    }))
    expect(html).toContain('말 한마디에')
    expect(html).toContain('문서가')
    expect(html).toContain('똑딱')
    expect(html).toContain('똑딱작업실')
    expect(html).toContain('둘러보기')
    expect(html).toContain('오픈소스')
    expect(html).toContain('만든 이유')
    expect(html).toContain('연결하기')
    expect((html.match(/시작하기/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('promo-poster')
    expect(html).not.toContain('지금 체험하기')
  })

  it('provides a separate Codex-only connection page with a back action', () => {
    const html = renderToStaticMarkup(createElement(DesktopConnectionPage, {
      connection: connection(),
      canStart: false,
      connectionReady: false,
      settingsLoaded: true,
      noticeDue: false,
      onNoticeAcknowledge: vi.fn(),
      onBack: vi.fn(),
      onStart: vi.fn(),
    }))
    expect(html).toContain('AI 연결하기')
    expect(html).toContain('뒤로 가기')
    expect(html).toContain('시작하기')
    expect(html).toContain('data-provider="codex"')
    expect(html).not.toContain('data-provider="claude"')
    expect(html).toContain('Codex')
  })

  it('shows settings pending and disables Start until the notice state is known', () => {
    const html = renderToStaticMarkup(createElement(DesktopConnectionPage, {
      connection: connection({ provider: 'codex', state: 'ready', meteredAccepted: false }),
      canStart: false,
      connectionReady: true,
      settingsLoaded: false,
      noticeDue: false,
      onNoticeAcknowledge: vi.fn(),
      onBack: vi.fn(),
      onStart: vi.fn(),
    }))
    expect(html).toContain('설정 확인 중')
    expect(html).toMatch(/class="dc-start"[^>]*disabled/)
  })
})
