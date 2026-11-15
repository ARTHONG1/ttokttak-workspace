import { describe, expect, it } from 'vitest'
import { friendlyAiErrorMessage } from '../src/renderer/src/ai-error-text'

describe('friendlyAiErrorMessage', () => {
  it('hides a raw Vertex refusal behind a short Korean explanation', () => {
    const raw =
      'Gemini HTTP 403: { "error": { "code": 403, "message": "This API method requires billing to be enabled. Please enable billing on project #hangul-ai-workbench-3ope70", "status": "PERMISSION_DENIED" } }'
    const shown = friendlyAiErrorMessage(raw)
    expect(shown).toBe('AI 서비스가 요청을 거절했어요. AI 연결 설정(키·계정·결제)을 확인해 주세요.')
  })

  it("keeps the web edition's own Korean refusal (the locked advanced model)", () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        message: '고급형 모델은 아직 열리지 않았어요. 기본형으로 바꿔서 다시 해 주세요.',
      },
    })
    expect(friendlyAiErrorMessage('Gemini HTTP 403: ' + body)).toBe(
      '고급형 모델은 아직 열리지 않았어요. 기본형으로 바꿔서 다시 해 주세요.',
    )
  })

  it('names a busy limit and a server failure without the body', () => {
    expect(friendlyAiErrorMessage('HTTP 429: {"error":{"message":"Too many requests"}}')).toBe(
      'AI 사용량이 많아요. 잠시 뒤 다시 해 주세요.',
    )
    expect(friendlyAiErrorMessage('Gemini HTTP 503: upstream connect error')).toBe(
      'AI 서버에 잠시 문제가 생겼어요. 잠시 뒤 다시 해 주세요.',
    )
  })

  it('passes a plain message through and fills in an empty one', () => {
    expect(friendlyAiErrorMessage('똑딱AI는 첨부 이미지 분석을 지원하지 않습니다.')).toBe(
      '똑딱AI는 첨부 이미지 분석을 지원하지 않습니다.',
    )
    expect(friendlyAiErrorMessage('')).toBe('AI 답을 받지 못했어요. 다시 해 주세요.')
    expect(friendlyAiErrorMessage(undefined)).toBe('AI 답을 받지 못했어요. 다시 해 주세요.')
  })
})
