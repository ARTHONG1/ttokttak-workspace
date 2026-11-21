import { describe, expect, it } from 'vitest'
import { LOCAL_AI_MODEL_FILES, SCHOOL_RECORD_FORMAT } from '../src/main/local-ai-model-files'
import { schoolRecordTurn } from '../src/main/school-record-turn'

/**
 * 생기부 on the built-in 똑딱AI goes out in its short format only once the pinned 생기부 adapter
 * learned it; every other request, and every other AI, keeps the instructions.
 */
describe('a 생기부 request to the built-in 똑딱AI', () => {
  const request = {
    feature: 'school_record',
    system: '긴 지시문',
    messages: [{ role: 'user' as const, text: '요청' }],
    compact: {
      system: '학교생활기록부 문장 작성',
      text: '[행발]\n관찰:\n- 성실함.\n분량: 보통\n변형: 1',
    },
  }

  it('keeps the instructions while the adapter learned those', () => {
    expect(schoolRecordTurn(request, 'instructions')).toEqual({
      system: '긴 지시문',
      messages: request.messages,
    })
  })

  it('goes in the short format once the adapter learned it', () => {
    expect(schoolRecordTurn(request, 'compact')).toEqual({
      system: '학교생활기록부 문장 작성',
      messages: [{ role: 'user', text: request.compact.text }],
    })
  })

  it('leaves any other request alone, and one without a short form', () => {
    expect(schoolRecordTurn({ ...request, feature: 'pumui' }, 'compact')).toMatchObject({
      system: '긴 지시문',
    })
    const { compact: _compact, ...withoutShort } = request
    expect(schoolRecordTurn(withoutShort, 'compact')).toMatchObject({ system: '긴 지시문' })
  })

  // the mark goes with the adapter: a new adapter pinned without a thought for it fails here
  it('is the instructions for the 생기부 adapter pinned today, trained on them', () => {
    const adapter = LOCAL_AI_MODEL_FILES.find((f) => f.id === 'school_record')
    expect({ adapter: adapter?.sha256.slice(0, 16), format: SCHOOL_RECORD_FORMAT }).toEqual({
      adapter: 'c4b61189e93ca7ee',
      format: 'instructions',
    })
  })
})
