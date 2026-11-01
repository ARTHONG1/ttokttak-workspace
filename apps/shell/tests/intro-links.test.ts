import { expect, it } from 'vitest'
import { introLinkKey } from '../src/shared/intro-links'

it('allows only the fixed introduction links', () => {
  expect(introLinkKey('https://classddok.com')).toBe('intro-class')
  expect(introLinkKey('https://github.com/ARTHONG1/ttokttak-workspace')).toBe('intro-project')
  expect(introLinkKey('https://evil.example/')).toBeNull()
})
