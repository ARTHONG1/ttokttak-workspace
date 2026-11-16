import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PUMUI_EXTRACT_SYSTEM } from '../src/renderer/src/proposal-prompts'

describe('품의 v3 instruction', () => {
  // The bundled model is trained on this exact text (PUMUI_V3_APP_REQUEST.md, 2-1). A change
  // to one character needs a retrained model; update this hash only together with the model.
  it('is the text the model is trained on', () => {
    const sha = createHash('sha256').update(PUMUI_EXTRACT_SYSTEM, 'utf8').digest('hex')
    expect(sha).toBe('331ee8c3582ba765bcb195292fe8363797b59684c1429eb0cf615fb307b4764a')
  })
})
