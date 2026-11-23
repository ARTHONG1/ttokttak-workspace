import { describe, expect, it } from 'vitest'
import { LOCAL_AI_MODEL_FILES, SCHOOL_RECORD_FORMAT } from '../src/main/local-ai-model-files'
import { MAX_PLAIN_BYTES } from '../src/main/local-ai-turn'
import { SCHOOL_RECORD_SAMPLING, schoolRecordTurn } from '../src/main/school-record-turn'

/**
 * 생기부 on the built-in 똑딱AI goes out as its own request (short rules, model answers as earlier
 * turns, measured sampling) while the pinned 생기부 adapter is asked so; every other request, and
 * every other AI, keeps the instructions.
 */
describe('a 생기부 request to the built-in 똑딱AI', () => {
  const request = {
    feature: 'school_record',
    system: '긴 지시문',
    messages: [{ role: 'user' as const, text: '요청' }],
    compact: {
      system: '짧은 규칙',
      text: '[행동특성 및 종합의견] 분량: 3~4문장, 300자 안팎\n관찰:\n잘하는 점:\n- 성실함',
      examples: [['예시 요청', '예시 답']] as const,
    },
  }

  it('keeps the instructions while the adapter is asked with those', () => {
    expect(schoolRecordTurn(request, 'instructions')).toEqual({
      system: '긴 지시문',
      messages: request.messages,
      examples: [],
    })
  })

  it("goes as 똑딱AI's own request after its model answers, at the measured sampling", () => {
    expect(schoolRecordTurn(request, 'compact')).toEqual({
      system: '짧은 규칙',
      messages: [{ role: 'user', text: request.compact.text }],
      examples: [
        { role: 'user', text: '예시 요청' },
        { role: 'assistant', text: '예시 답' },
      ],
      sampling: SCHOOL_RECORD_SAMPLING,
    })
  })

  // a long note goes without the model answers rather than clipped to make room for them
  it('sends only the model answers that fit beside the request', () => {
    const long = '가'.repeat(Math.floor((MAX_PLAIN_BYTES - 30) / 3))
    const turn = schoolRecordTurn(
      { ...request, compact: { ...request.compact, text: long } },
      'compact',
    )
    expect(turn.examples).toEqual([])
    expect(turn.messages).toEqual([{ role: 'user', text: long }])
  })

  it('leaves any other request alone, and one without its own form', () => {
    expect(schoolRecordTurn({ ...request, feature: 'pumui' }, 'compact')).toMatchObject({
      system: '긴 지시문',
    })
    const { compact: _compact, ...withoutShort } = request
    expect(schoolRecordTurn(withoutShort, 'compact')).toMatchObject({ system: '긴 지시문' })
  })

  // the mark goes with the adapter: a new adapter pinned without a thought for it fails here
  it("is 똑딱AI's own request for the 생기부 adapter pinned today", () => {
    const adapter = LOCAL_AI_MODEL_FILES.find((f) => f.id === 'school_record')
    expect({ adapter: adapter?.sha256.slice(0, 16), format: SCHOOL_RECORD_FORMAT }).toEqual({
      adapter: 'c4b61189e93ca7ee',
      format: 'compact',
    })
  })
})
