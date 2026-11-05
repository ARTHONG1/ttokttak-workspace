import { describe, expect, it } from 'vitest'
import { FEATURE_LINKS, isFeatureLinkSite } from '../src/main/special-feature-files'
import { TTOK_SIGN_EMBED_URL, TTOK_SIGN_VIDEO_URL } from '../src/renderer/src/sign/sign-video'

describe('똑딱서명 introduction video', () => {
  it('plays the video in the app and opens the same one on YouTube', () => {
    expect(TTOK_SIGN_VIDEO_URL).toBe('https://youtu.be/tLxKYB8qInY')
    expect(TTOK_SIGN_EMBED_URL.startsWith('https://www.youtube.com/embed/tLxKYB8qInY')).toBe(true)
  })

  it('is a link the main process will open', () => {
    expect(isFeatureLinkSite('ttokSignVideo')).toBe(true)
    expect(FEATURE_LINKS.ttokSignVideo).toBe(TTOK_SIGN_VIDEO_URL)
  })
})
