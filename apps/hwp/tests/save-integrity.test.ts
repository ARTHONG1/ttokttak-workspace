import { describe, expect, it } from 'vitest'
import { saveIntegrityBlocker } from '../src/main/save-integrity'

describe('safe HWP/HWPX commit gate', () => {
  it('permits a save only when the preserved structures were restored', () => {
    expect(saveIntegrityBlocker(undefined, 0)).toBeNull()
  })

  it('blocks an HWP save if section tails with master pages or memos were skipped', () => {
    expect(saveIntegrityBlocker('unrestored-tail', 0)).toMatch(/master pages/i)
  })

  it('blocks HWPX when its exported file is missing any existing memos', () => {
    expect(saveIntegrityBlocker(undefined, 2)).toMatch(/2.*memo/i)
  })
})
