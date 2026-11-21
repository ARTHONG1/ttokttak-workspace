/**
 * 생기부 on the built-in 똑딱AI: the form its request goes out in. The page sends a 생기부 request
 * with the instructions (system) and the request (one user message), and also in 똑딱AI's short
 * format (request.compact: no instructions, the task and its fields; the workspace's
 * docs/똑딱AI-생기부-짧은-입력-규칙.md). The short form goes out only to the built-in model, and
 * only once the pinned 생기부 adapter learned it (local-ai-model-files.ts
 * SCHOOL_RECORD_FORMAT). Connected AIs (Codex, Claude, the web's Gemini) always get the
 * instructions: they need them, and docs-main calls this for the built-in model only.
 */
import type { AiStreamRequest } from '@genoffice/ai-provider'
import type { SchoolRecordFormat } from './local-ai-model-files'

export function schoolRecordTurn(
  request: Pick<AiStreamRequest, 'feature' | 'system' | 'messages' | 'compact'>,
  format: SchoolRecordFormat,
): Pick<AiStreamRequest, 'system' | 'messages'> {
  const compact = request.compact
  if (
    format === 'compact' &&
    request.feature === 'school_record' &&
    compact &&
    typeof compact.system === 'string' &&
    typeof compact.text === 'string' &&
    compact.text.trim()
  )
    return { system: compact.system, messages: [{ role: 'user', text: compact.text }] }
  return { system: request.system, messages: request.messages }
}
