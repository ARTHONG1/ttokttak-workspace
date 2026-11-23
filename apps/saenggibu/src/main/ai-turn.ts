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

/** a model answer sent ahead of the request as an earlier turn: [request, answer] */
export type Example = readonly [string, string]

export type Turn =
  { ok: true; system: string; text: string; examples: Example[] } | { ok: false; error: string }

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8')

export const TOO_LONG =
  '입력한 내용이 너무 길어요. 과제·활동 설명, 성취기준, 관찰 기록을 합쳐 1,500자 정도로 줄여 주세요.'

/**
 * The turn as sent: the model answers go along only while the whole turn stays within
 * MAX_TURN_BYTES, so a long note goes out without them rather than being refused.
 */
export function plainTurn(system: string, text: string, examples: readonly Example[] = []): Turn {
  const sysBytes = bytes(system)
  if (sysBytes > MAX_SYSTEM_BYTES)
    return { ok: false, error: '요청이 똑딱AI의 입력 한도를 넘었어요. 지시사항을 줄여 주세요.' }
  if (bytes(text) > MAX_TURN_BYTES - sysBytes) return { ok: false, error: TOO_LONG }
  const kept: Example[] = []
  let used = sysBytes + bytes(text)
  for (const example of examples) {
    used += bytes(example[0]) + bytes(example[1])
    if (used > MAX_TURN_BYTES) break
    kept.push(example)
  }
  return { ok: true, system, text, examples: kept }
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

/** llama-server's sampling settings for one request */
export interface Sampling {
  temperature: number
  top_k?: number
  top_p?: number
  repeat_penalty?: number
}

/**
 * The sampling of 똑딱AI's own 생기부 request. Measured 2026-11-24 on the V7-B adapter: at
 * temperature 0 the same notes came back copied or reversed and [다시 생성] gave the same text;
 * at 0.3 with top_k 20 the answers kept to the notes more often and still varied a little.
 * Higher settings (0.5~0.7) brought invented facts back.
 */
export const COMPACT_SAMPLING: Sampling = {
  temperature: 0.3,
  top_k: 20,
  top_p: 0.9,
  repeat_penalty: 1.05,
}

/**
 * The form a request goes to 똑딱AI in: its own request (short rules, model answers as earlier
 * turns, the notes sorted) at COMPACT_SAMPLING, else the instructions and the request as the
 * page wrote them at the page's temperature.
 */
export function pickTurn(
  request: {
    system: string
    text: string
    temperature: number
    compact?: { system: string; text: string; examples?: readonly Example[] }
  },
  format: RecordFormat,
): { system: string; text: string; examples: readonly Example[]; sampling: Sampling } {
  if (format === 'compact' && request.compact)
    return {
      system: request.compact.system,
      text: request.compact.text,
      examples: request.compact.examples ?? [],
      sampling: COMPACT_SAMPLING,
    }
  return {
    system: request.system,
    text: request.text,
    examples: [],
    sampling: { temperature: request.temperature },
  }
}
