import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { BEHAVIOR_SYSTEM, SUBJECT_SYSTEM } from '../src/renderer/src/record/record-core'
import { REWORD_SYSTEM } from '../src/renderer/src/record/record-similarity'

/**
 * The built-in 똑딱AI's 생기부 adapter (school-record-isolated-v3 step 111) was trained and
 * measured on exactly these instructions (the model project's manifest froze
 * record-core.ts 87a1cafff90c164d… and record-similarity.ts 67a02a9c6223d2c7…). Changing
 * one changes what the model sees: re-measure (or retrain) the adapter before updating a
 * hash here.
 */
const sha = (text: string) => createHash('sha256').update(text).digest('hex')

describe('the 생기부 instructions the adapter was trained on', () => {
  it('are unchanged', () => {
    expect({
      subject: sha(SUBJECT_SYSTEM),
      behavior: sha(BEHAVIOR_SYSTEM),
      reword: sha(REWORD_SYSTEM),
    }).toEqual({
      subject: 'bb24dbfa85dd958877fc6c155040a17f9b6ec7d2f6b6beb07ef839cefb307ee0',
      behavior: '0a43f7eed7596c3b852e376d289f6138b3bca0cbf696f6392aade4eab7690d01',
      reword: 'd6d8f54cb2dc06179ecf05208502eb930e861699a8384468d2c40590644fe850',
    })
  })
})
