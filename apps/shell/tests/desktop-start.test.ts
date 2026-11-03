import { describe, expect, it } from 'vitest'
import { startDestination } from '../src/renderer/src/desktop-start'

describe('desktop start destination', () => {
  it('"시작하기" always enters the workspace, connected or not, without waiting for the check', () => {
    expect(startDestination('connected')).toBe('workspace')
    expect(startDestination('disconnected')).toBe('workspace')
    expect(startDestination('checking')).toBe('workspace')
  })
})

import { defaultAiSettings } from '@genoffice/ai-provider'
import { desktopConnectionState } from '../src/renderer/src/desktop-start'

it('requires the selected subscription to be usable', () => {
  const statuses = {
    codex: { provider: 'codex' as const, state: 'ready' as const, meteredAccepted: false },
    'claude-code': {
      provider: 'claude-code' as const,
      state: 'signed-out' as const,
      meteredAccepted: false,
    },
  }
  expect(desktopConnectionState({ ...defaultAiSettings(), provider: 'codex' }, statuses)).toBe(
    'connected',
  )
  expect(
    desktopConnectionState({ ...defaultAiSettings(), provider: 'claude-code' }, statuses),
  ).toBe('disconnected')
  expect(desktopConnectionState(null, statuses)).toBe('checking')
})
