import { describe, expect, it } from 'vitest'
import { desktopEntryTransition, codexCanStart, desktopCanEnterWorkspace } from '../src/renderer/src/desktop-entry'

describe('desktop entry', () => {
  it('starts on the introduction and opens an independent connection page', () => {
    expect(desktopEntryTransition('welcome', 'connect', false)).toBe('connect')
    expect(desktopEntryTransition('connect', 'back', false)).toBe('welcome')
  })

  it('never enters the work area with an unverified agent', () => {
    expect(desktopEntryTransition('welcome', 'start', false)).toBe('connect')
    expect(desktopEntryTransition('connect', 'start', false)).toBe('connect')
    expect(codexCanStart({ provider: 'codex', state: 'checking', meteredAccepted: false })).toBe(false)
    expect(codexCanStart({ provider: 'codex', state: 'signed-out', meteredAccepted: false })).toBe(false)
    expect(codexCanStart({ provider: 'codex', state: 'not-installed', meteredAccepted: false })).toBe(false)
    expect(codexCanStart({ provider: 'codex', state: 'metered', meteredAccepted: false })).toBe(false)
  })

  it('starts only with usable Codex and respects an already-open document', () => {
    expect(codexCanStart({ provider: 'codex', state: 'ready', meteredAccepted: false })).toBe(true)
    expect(codexCanStart({ provider: 'codex', state: 'metered', meteredAccepted: true })).toBe(true)
    expect(desktopEntryTransition('welcome', 'start', true)).toBe('workspace')
    expect(desktopEntryTransition('connect', 'start', true)).toBe('workspace')
    expect(desktopEntryTransition('welcome', 'restore-document', false)).toBe('workspace')
    expect(desktopEntryTransition('workspace', 'back', false)).toBe('workspace')
  })

  it('requires persisted first-connection acknowledgement even while Codex is ready', () => {
    const ready = { provider: 'codex' as const, state: 'ready' as const, meteredAccepted: false }
    expect(desktopCanEnterWorkspace(ready, null)).toBe(false)
    expect(desktopCanEnterWorkspace(ready, { subscriptionNoticeSeen: false })).toBe(false)
    expect(desktopCanEnterWorkspace(ready, { subscriptionNoticeSeen: true })).toBe(true)
    expect(desktopCanEnterWorkspace({ ...ready, state: 'signed-out' }, { subscriptionNoticeSeen: true })).toBe(false)
  })
})
