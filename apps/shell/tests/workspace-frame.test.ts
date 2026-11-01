/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { AppFrame } from '../src/renderer/src/AppFrame'

vi.mock('../src/renderer/src/WorkspaceHome', () => ({
  WorkspaceHome: () => createElement('main', null, 'Shared web home'),
}))
vi.mock('../src/renderer/src/TrialHome', () => ({
  TrialHome: () => createElement('main', null, 'Shared web home'),
}))
vi.mock('../src/renderer/src/Home', () => ({
  Home: () => createElement('main', null, 'Legacy desktop home'),
}))
vi.mock('../src/renderer/src/TabBar', () => ({ TabBar: () => null }))
vi.mock('../src/renderer/src/Onboarding', () => ({ Onboarding: () => null }))
vi.mock('../src/renderer/src/subscription-client', () => ({
  useSubscriptionConnection: () => ({ statuses: {} }),
}))
vi.mock('../src/renderer/src/FirstConnectionNotice', () => ({
  useFirstConnectionNotice: () => ({ settings: null, due: false, acknowledge: () => {} }),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  delete document.documentElement.dataset.edition
})

it.each(['web', 'desktop'])('shows the shared web home in %s', async (edition) => {
  document.documentElement.dataset.edition = edition
  Object.assign(window, {
    aiOfficeTabs: {
      getSplit: async () => null,
      onSplitChanged: () => () => {},
      list: async () => [],
      onChanged: () => () => {},
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  await act(async () => root.render(createElement(AppFrame, { initialOnboardingSeen: true })))
  expect(host.textContent).toContain('Shared web home')
  expect(host.textContent).not.toContain('Legacy desktop home')
})
