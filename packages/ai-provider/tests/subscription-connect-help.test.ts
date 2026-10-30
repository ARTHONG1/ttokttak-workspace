import { describe, expect, it } from 'vitest'
import { subscriptionConnectHelpUrl } from '../src/browser'

describe('subscriptionConnectHelpUrl', () => {
  const base = 'https://github.com/ARTHONG1/ttokttak-studio'
  const connect = `${base}#${encodeURIComponent('구독-연결하기')}`

  it('opens the section of each path the connect guide offers', () => {
    expect(subscriptionConnectHelpUrl('claude-code')).toBe(connect)
    expect(subscriptionConnectHelpUrl('codex')).toBe(connect)
    expect(subscriptionConnectHelpUrl('free')).toBe(
      `${base}#${encodeURIComponent('구독-없이-무료로-쓰기')}`,
    )
  })

  it('opens the top of the page for anything else a renderer sends', () => {
    for (const path of [null, undefined, '', 'toString', '#evil', 'https://example.com', 42]) {
      expect(subscriptionConnectHelpUrl(path)).toBe(base)
    }
  })
})
