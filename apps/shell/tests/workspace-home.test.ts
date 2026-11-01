/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceHome } from '../src/renderer/src/WorkspaceHome'

vi.mock('../src/renderer/src/TrialHome', () => ({
  TrialHome: () => createElement('main', null, 'Web home'),
}))
vi.mock('../src/renderer/src/RecoveryList', () => ({
  LaunchRecoveryList: () => null,
}))
vi.mock('../src/renderer/src/SettingsModal', () => ({
  SettingsModal: ({ target, onClose }: { target: { section: string }; onClose: () => void }) =>
    createElement('button', { onClick: onClose }, `Settings: ${target.section}`),
}))
vi.mock('../src/renderer/src/subscription-client', () => ({
  useSubscriptionConnection: () => ({ statuses: {} }),
}))
vi.mock('../src/renderer/src/FirstConnectionNotice', () => ({
  useFirstConnectionNotice: () => ({ due: true, acknowledge: () => {} }),
  FirstConnectionDialog: () => createElement('div', null, 'First connection notice'),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let dispose: (() => void) | undefined
afterEach(() => dispose?.())

it('opens and closes the requested settings section from the application menu', async () => {
  let openSettings: ((target: { section: string }) => void) | undefined
  Object.assign(window, {
    aiOffice: {
      onOpenSettings: (listener: typeof openSettings) => {
        openSettings = listener
        return () => {
          openSettings = undefined
        }
      },
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  dispose = () => {
    act(() => root.unmount())
    host.remove()
  }
  await act(async () => root.render(createElement(WorkspaceHome)))
  expect(host.textContent).toContain('Web home')
  await act(async () => openSettings?.({ section: 'aiModel' }))
  expect(host.textContent).toContain('Settings: aiModel')
  expect(host.textContent).toContain('First connection notice')
  await act(async () => host.querySelector('button')?.click())
  expect(host.textContent).not.toContain('Settings: aiModel')
})
