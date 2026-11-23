/**
 * 생기부 on the built-in 똑딱AI: the form its request goes out in. The page sends a 생기부 request
 * with the instructions (system) and the request (one user message), and also as 똑딱AI's own
 * request (request.compact: short rules, model answers sent as earlier turns, the notes sorted
 * into strengths and concerns; record-core.ts compactRequest). That form goes out only to the
 * built-in model, and only while the pinned 생기부 adapter is asked so (local-ai-model-files.ts
 * SCHOOL_RECORD_FORMAT). Connected AIs (Codex, Claude, the web's Gemini) always get the
 * instructions: they need them, and docs-main calls this for the built-in model only.
 */
import type { AgentMessage } from '@genoffice/agent-core'
import type { AiStreamRequest } from '@genoffice/ai-provider'
import type { SchoolRecordFormat } from './local-ai-model-files'
import { MAX_PLAIN_BYTES } from './local-ai-turn'

/**
 * The sampling of 똑딱AI's own 생기부 request. Measured 2026-11-24 on the V7-B adapter: at
 * temperature 0 the same notes came back copied or reversed and [다시 생성] gave the same text;
 * at 0.3 with top_k 20 the answers kept to the notes more often and still varied a little.
 * Higher settings (0.5~0.7) brought invented facts back. Words said again are held back by the
 * DRY sampler. 똑딱생기부 uses the same (apps/saenggibu/src/main/ai-turn.ts COMPACT_SAMPLING).
 */
export const SCHOOL_RECORD_SAMPLING = {
  temperature: 0.3,
  top_k: 20,
  top_p: 0.9,
  dry_multiplier: 0.8,
  dry_base: 1.75,
  dry_allowed_length: 2,
  dry_penalty_last_n: 512,
} as const

export interface SchoolRecordTurn extends Pick<AiStreamRequest, 'system' | 'messages'> {
  /** model answers to send before the request, as many as fit with it in MAX_PLAIN_BYTES */
  examples: AgentMessage[]
  /** the sampling this form was measured with; none for the instructions */
  sampling?: typeof SCHOOL_RECORD_SAMPLING
  /** the GBNF grammar the answer is held to (record-core.ts entryGrammar) */
  grammar?: string
}

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8')

export function schoolRecordTurn(
  request: Pick<AiStreamRequest, 'feature' | 'system' | 'messages' | 'compact'>,
  format: SchoolRecordFormat,
): SchoolRecordTurn {
  const compact = request.compact
  if (
    format !== 'compact' ||
    request.feature !== 'school_record' ||
    !compact ||
    typeof compact.system !== 'string' ||
    typeof compact.text !== 'string' ||
    !compact.text.trim()
  )
    return { system: request.system, messages: request.messages, examples: [] }
  const examples: AgentMessage[] = []
  // a long note goes out without the model answers rather than clipped to make room for them
  let used = bytes(compact.system) + bytes(compact.text)
  for (const pair of Array.isArray(compact.examples) ? compact.examples : []) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') continue
    used += bytes(pair[0]) + bytes(pair[1])
    if (used > MAX_PLAIN_BYTES) break
    examples.push({ role: 'user', text: pair[0] }, { role: 'assistant', text: pair[1] })
  }
  return {
    system: compact.system,
    messages: [{ role: 'user', text: compact.text }],
    examples,
    sampling: SCHOOL_RECORD_SAMPLING,
    ...(typeof compact.grammar === 'string' && compact.grammar.length <= 200_000
      ? { grammar: compact.grammar }
      : {}),
  }
}
