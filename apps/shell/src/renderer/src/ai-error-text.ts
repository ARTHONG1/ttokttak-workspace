/**
 * What a 똑딱업무 tool shows when an AI turn fails without a known error code. Providers pass
 * on the server's reply as "Gemini HTTP 403: {json}"; a teacher should read one short Korean
 * sentence instead. The web edition's own refusals carry a Korean message in that JSON, and
 * that message is kept.
 */
const FALLBACK = 'AI 답을 받지 못했어요. 다시 해 주세요.'
const HANGUL = /[\uAC00-\uD7A3]/

function serverMessage(text: string): string | undefined {
  const quoted = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1]
  if (quoted === undefined) return undefined
  try {
    return JSON.parse('"' + quoted + '"') as string
  } catch {
    return quoted
  }
}

export function friendlyAiErrorMessage(raw: string | undefined): string {
  const text = (raw ?? '').trim()
  if (!text) return FALLBACK
  const status = Number(/\bHTTP (\d{3})\b/.exec(text)?.[1] ?? 0)
  const fromServer = status > 0 || /[{[]\s*"error"/.test(text)
  if (!fromServer) return HANGUL.test(text) || text.length <= 120 ? text : FALLBACK
  const message = serverMessage(text)
  if (message && HANGUL.test(message)) return message.trim()
  if (status === 401 || status === 403)
    return 'AI 서비스가 요청을 거절했어요. AI 연결 설정(키·계정·결제)을 확인해 주세요.'
  if (status === 429) return 'AI 사용량이 많아요. 잠시 뒤 다시 해 주세요.'
  if (status >= 500) return 'AI 서버에 잠시 문제가 생겼어요. 잠시 뒤 다시 해 주세요.'
  return 'AI 서버가 요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.'
}
