import { describe, expect, it } from 'vitest'
import { updatesAllowed } from '../src/main/update-policy'

describe('updatesAllowed', () => {
  it('updates the installed Windows app from the project releases', () => {
    expect(updatesAllowed('win32', {}, true)).toBe(true)
  })

  it('never updates an unpacked development run', () => {
    expect(updatesAllowed('win32', { HANGUL_WORKBENCH_UPDATE_FEED: '1' }, false)).toBe(false)
  })

  it('updates the installed Mac app from the project releases', () => {
    expect(updatesAllowed('darwin', {}, true)).toBe(true)
    expect(updatesAllowed('darwin', {}, false)).toBe(false)
  })

  it('leaves the unsigned Linux builds alone unless asked', () => {
    expect(updatesAllowed('linux', { APPIMAGE: '/a.AppImage' }, true)).toBe(false)
    expect(
      updatesAllowed('linux', { APPIMAGE: '/a.AppImage', HANGUL_WORKBENCH_UPDATE_FEED: '1' }, true),
    ).toBe(true)
    expect(updatesAllowed('linux', { HANGUL_WORKBENCH_UPDATE_FEED: '1' }, true)).toBe(false)
  })
})
