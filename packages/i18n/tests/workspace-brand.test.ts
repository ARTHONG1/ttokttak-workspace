import { describe, expect, it } from 'vitest'
import { DEV_USER_DATA_DIR_NAME, USER_DATA_DIR_NAME, productName } from '../src/product'

describe('workspace identity', () => {
  it('shows the same product name regardless of UI language', () => {
    expect(productName('ko')).toBe('똑딱작업실')
    expect(productName('en')).toBe('똑딱작업실')
    expect(productName('ja')).toBe('똑딱작업실')
  })

  it('keeps the existing installed and development profile names', () => {
    expect(USER_DATA_DIR_NAME).toBe('HangulAIWorkbench')
    expect(DEV_USER_DATA_DIR_NAME).toBe('HangulAIWorkbench-Dev')
  })
})
