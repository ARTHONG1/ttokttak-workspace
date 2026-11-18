/**
 * One 생기부 writing turn for the built-in 2B model, the way 똑딱작업실 sends a plain writing
 * request: the page's own instructions as they are (they are what the 생기부 adapter was
 * trained on), and the request clipped so that both fit the 4,096-token context with room
 * for the answer.
 */

/** instructions + request together, in UTF-8 bytes */
export const MAX_TURN_BYTES = 7000
/** the instructions alone; longer ones are refused rather than cut */
export const MAX_SYSTEM_BYTES = 2400
/** the answer's cap (a 1,500-byte NEIS entry is well under it) */
export const MAX_ANSWER_TOKENS = 1024

export type Turn = { ok: true; system: string; text: string } | { ok: false; error: string }

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8')

export function plainTurn(system: string, text: string): Turn {
  const sysBytes = bytes(system)
  if (sysBytes > MAX_SYSTEM_BYTES)
    return { ok: false, error: '요청이 똑딱AI의 입력 한도를 넘었어요. 지시사항을 줄여 주세요.' }
  const budget = MAX_TURN_BYTES - sysBytes
  if (bytes(text) <= budget) return { ok: true, system, text }
  let clipped = text
    .slice(0, Math.floor((text.length * budget) / bytes(text)))
    .replace(/[\uD800-\uDBFF]$/, '')
  // a dense slice can still be over: trim further
  while (bytes(clipped) > budget) {
    clipped = clipped.slice(0, Math.floor(clipped.length * 0.9)).replace(/[\uD800-\uDBFF]$/, '')
  }
  return { ok: true, system, text: clipped }
}
