/**
 * One 생기부 writing turn for the built-in 2B model: the page's own instructions as they are
 * (they are what the 생기부 model was trained on) and the request, both within the 4,096-token
 * context with room for the answer. A request too long for it is refused with what to shorten:
 * clipping it cut off the observation's end and the closing instruction ("나이스 입력용 …을
 * 작성하십시오"), and the answer then went its own way with nothing said.
 */
import type { AskResult } from '../shared/api'

/** instructions + request together, in UTF-8 bytes */
export const MAX_TURN_BYTES = 7000
/** the instructions alone; longer ones are refused rather than cut */
export const MAX_SYSTEM_BYTES = 2400
/** the answer's cap (a 1,500-byte NEIS entry is well under it) */
export const MAX_ANSWER_TOKENS = 1024

export type Turn = { ok: true; system: string; text: string } | { ok: false; error: string }

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8')

export const TOO_LONG =
  '입력한 내용이 너무 길어요. 과제·활동 설명, 성취기준, 관찰 기록을 합쳐 1,500자 정도로 줄여 주세요.'

export function plainTurn(system: string, text: string): Turn {
  const sysBytes = bytes(system)
  if (sysBytes > MAX_SYSTEM_BYTES)
    return { ok: false, error: '요청이 똑딱AI의 입력 한도를 넘었어요. 지시사항을 줄여 주세요.' }
  if (bytes(text) > MAX_TURN_BYTES - sysBytes) return { ok: false, error: TOO_LONG }
  return { ok: true, system, text }
}

/**
 * A request that failed for its own student: too long to send, or an answer that ran on. The
 * page goes on with the next student; a failure of the AI itself (not there, not starting,
 * not answering) stops a whole-class run instead. (Two notes too long in a row once stopped
 * a class of 40 after five, the rest told they were too long.)
 */
export class RequestProblem extends Error {}

/** a failed ask as the page gets it */
export function askFailure(err: unknown): Extract<AskResult, { ok: false }> {
  const error = err instanceof Error ? err.message : String(err)
  return err instanceof RequestProblem ? { ok: false, error, student: true } : { ok: false, error }
}

export type RecordFormat = 'instructions' | 'compact'

/**
 * The form a request goes to 똑딱AI in: its short format when the 생기부 adapter learned it,
 * asked at temperature 0 always (its variety is the 변형 line), else the instructions and the
 * request as the page wrote them.
 */
export function pickTurn(
  request: {
    system: string
    text: string
    temperature: number
    compact?: { system: string; text: string }
  },
  format: RecordFormat,
): { system: string; text: string; temperature: number } {
  if (format === 'compact' && request.compact)
    return { system: request.compact.system, text: request.compact.text, temperature: 0 }
  return { system: request.system, text: request.text, temperature: request.temperature }
}
