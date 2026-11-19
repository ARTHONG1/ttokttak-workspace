import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_SYSTEM,
  BEHAVIOR_SYSTEM,
  SUBJECT_SYSTEM,
} from '../src/renderer/src/record/record-core'
import { REWORD_SYSTEM } from '../src/renderer/src/record/record-similarity'

/**
 * The built-in 똑딱AI's 생기부 model is trained and measured on exactly these instructions.
 * school-record-isolated-v3 step 111 learned 세특, 행발 and rewording on them (the model
 * project's manifest froze record-core.ts 87a1cafff90c164d… and record-similarity.ts
 * 67a02a9c6223d2c7…); its successor V7 B (school-record-v7-b, 2026-11-19) continued on 세특,
 * 행발 and 창체 rows and dev prompts written with the same 세특·행발 texts and this 창체 text.
 * Changing one changes what the model sees: re-measure (or retrain) before updating a hash here.
 * 똑딱작업실 (apps/shell) keeps the same record-core.ts and sends the same instructions.
 */
const sha = (text: string) => createHash('sha256').update(text).digest('hex')

describe('the 생기부 instructions the model was trained on', () => {
  it('are unchanged', () => {
    expect({
      subject: sha(SUBJECT_SYSTEM),
      behavior: sha(BEHAVIOR_SYSTEM),
      activity: sha(ACTIVITY_SYSTEM),
      reword: sha(REWORD_SYSTEM),
    }).toEqual({
      subject: 'bb24dbfa85dd958877fc6c155040a17f9b6ec7d2f6b6beb07ef839cefb307ee0',
      behavior: '0a43f7eed7596c3b852e376d289f6138b3bca0cbf696f6392aade4eab7690d01',
      activity: '502f1ce26727264dbcaf0b04274f176ac6b5ad56dd68e061d7c8f5e2705c4549',
      reword: 'd6d8f54cb2dc06179ecf05208502eb930e861699a8384468d2c40590644fe850',
    })
  })
})
