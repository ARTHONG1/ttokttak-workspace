import { describe, expect, it } from 'vitest'

import { LANGS } from '@genoffice/i18n'

import { newerInstance, newerInstanceText, secondInstancePayload } from '../src/main/newer-instance'

/**
 * The app runs one instance at a time. Opening a newly installed version while
 * an older one is still running only brought the old window forward, with no
 * word that a newer version had been launched and closed: the user kept
 * working in the old version without knowing.
 */
describe('a newer version launched while this one runs', () => {
  it('rides along in the lock payload next to the launch paths', () => {
    expect(
      secondInstancePayload(
        '0.16.4',
        '/Applications/HangulAIWorkbench.app/Contents/MacOS/HangulAIWorkbench',
      ),
    ).toEqual({
      appVersion: '0.16.4',
      appPath: '/Applications/HangulAIWorkbench.app/Contents/MacOS/HangulAIWorkbench',
    })
  })

  it('is reported only when the launched copy is newer', () => {
    const from = (appVersion: unknown) => ({ appVersion, appPath: '/A/HangulAIWorkbench' })
    expect(newerInstance(from('0.16.4'), '0.16.3')).toEqual({
      version: '0.16.4',
      appPath: '/A/HangulAIWorkbench',
    })
    expect(newerInstance(from('0.17.0'), '0.16.12')).not.toBeNull()
    expect(newerInstance(from('1.0.0'), '0.99.99')).not.toBeNull()
    expect(newerInstance(from('0.16.10'), '0.16.9')).not.toBeNull()
    // the same or an older copy, a missing or malformed version, and an
    // instance from before this payload existed are all just "open the window"
    expect(newerInstance(from('0.16.3'), '0.16.3')).toBeNull()
    expect(newerInstance(from('0.16.1'), '0.16.3')).toBeNull()
    expect(newerInstance(from(undefined), '0.16.3')).toBeNull()
    expect(newerInstance(from(16), '0.16.3')).toBeNull()
    expect(newerInstance(from('latest'), '0.16.3')).toBeNull()
    expect(newerInstance({ launchPaths: ['/a.hwp'] }, '0.16.3')).toBeNull()
    expect(newerInstance(undefined, '0.16.3')).toBeNull()
  })

  it('ranks a release above its own pre-release', () => {
    expect(newerInstance({ appVersion: '0.17.0' }, '0.17.0-beta.1')).not.toBeNull()
    expect(newerInstance({ appVersion: '0.17.0-beta.1' }, '0.17.0')).toBeNull()
  })

  it('explains it in every language, with both versions', () => {
    for (const lang of LANGS) {
      const text = newerInstanceText(lang, { current: '0.16.3', next: '0.16.4' })
      expect(text.message, lang).not.toBe('')
      expect(text.detail, lang).toContain('0.16.3')
      expect(text.detail, lang).toContain('0.16.4')
      expect(text.quit, lang).not.toBe('')
      expect(text.later, lang).not.toBe('')
    }
    expect(newerInstanceText('ko', { current: '0.16.3', next: '0.16.4' }).message).toContain(
      '새 버전',
    )
  })
})
