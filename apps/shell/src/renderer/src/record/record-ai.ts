/**
 * How 생기부 asks this app's AI (the one chosen in the AI settings, 똑딱AI with its 생기부
 * adapter or a connected one): one answer to a 생기부 instruction, a rewording, and calling a
 * request off. 똑딱생기부 keeps a file of the same name for its built-in AI
 * (apps/saenggibu/src/renderer/src/record/record-ai.ts); the pages use only these three.
 */
import { askAi } from '../special-common'
import { GENERATE_AT_ONCE, cleanReply } from './record-core'
import { NOT_REWORDED, REWORD_SYSTEM, rewordRequest, sameWording } from './record-similarity'

/** one answer, under an id that [멈추기] can call off */
export const askRecordAi = (system: string, text: string, id: string): Promise<string> =>
  askAi(system, text, [], 4000, { feature: 'school_record', requestId: id })

/** students written at once on a connected AI (Codex, Claude, the web's Gemini) */
const CONNECTED_AT_ONCE = 3

/**
 * how many students a whole-class run writes at once: on the built-in 똑딱AI one after another
 * (GENERATE_AT_ONCE, as in 똑딱생기부), on a connected AI three side by side
 */
export async function studentsAtOnce(): Promise<number> {
  try {
    return (await window.aiOffice?.getAiSettings?.())?.provider === 'local'
      ? GENERATE_AT_ONCE
      : CONNECTED_AT_ONCE
  } catch {
    return GENERATE_AT_ONCE
  }
}

/** call a running request off: its stream ends with what came so far, which the page drops */
export function cancelRecordAi(id: string): void {
  void window.aiOffice?.aiStreamCancel?.(id)
}

/**
 * The text said again in other words, away from the wording it shares with the others. An
 * answer that hands the text back word for word (the built-in 2B model does now and then) is
 * NOT_REWORDED, and the text stays as it was.
 */
export async function rewordWithAi(
  text: string,
  others: readonly string[],
  id: string,
): Promise<string> {
  const reply = cleanReply(await askRecordAi(REWORD_SYSTEM, rewordRequest(text, others), id))
  if (!reply) throw new Error('AI가 빈 답을 보냈어요. 다시 해 주세요.')
  if (sameWording(text, reply)) throw new Error(NOT_REWORDED)
  return reply
}
