import { describe, expect, it } from 'vitest'
import { freshEntry, INBOX_MAX_MS, inboxKey, migrateInbox } from '../../src/core/inbox'

const P = { text: 'P', from: 'web', receivedAt: 1 }

describe('the 받은 작업함 (one waiting work per task)', () => {
  it('keeps work under the task id', () => {
    expect(inboxKey('edufine-pumui')).toBe('inbox:edufine-pumui')
  })

  it('carries the 품의 a 0.4.0 extension was holding over to 에듀파인 품의', () => {
    expect(migrateInbox({ pending: P })).toEqual({
      set: { 'inbox:edufine-pumui': P },
      remove: ['pending'],
    })
  })

  it('keeps a newer 품의 already in the inbox', () => {
    const newer = { ...P, text: 'new', receivedAt: 5 }
    expect(migrateInbox({ pending: P, 'inbox:edufine-pumui': newer })).toEqual({
      set: {},
      remove: ['pending'],
    })
  })

  it('drops an old entry it cannot read, and does nothing without one', () => {
    expect(migrateInbox({ pending: 'x' })).toEqual({ set: {}, remove: ['pending'] })
    expect(migrateInbox({})).toEqual({ set: {}, remove: [] })
  })

  it('forgets work older than a day', () => {
    expect(freshEntry(P, 10)).toEqual(P)
    expect(freshEntry(P, 1 + INBOX_MAX_MS + 1)).toBeNull()
  })

  it('ignores an entry that is not one', () => {
    expect(freshEntry(null, 1)).toBeNull()
    expect(freshEntry({ ...P, text: 5 }, 1)).toBeNull()
    expect(freshEntry({ ...P, text: '' }, 1)).toBeNull()
    expect(freshEntry({ ...P, from: 'x' }, 1)).toBeNull()
  })
})
