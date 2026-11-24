/**
 * How 생기부 asks this app's AI, the built-in 똑딱AI: one answer to a 생기부 instruction, a
 * rewording, and calling a request off. 똑딱작업실 keeps a file of the same name for its own AI
 * (apps/shell/src/renderer/src/record/record-ai.ts); the pages use only these three.
 */
import { StudentProblem, askAi } from '../common'
import { cleanReply, entryGrammar, pickEntry, type RecordTurn } from './record-core'
import { NOT_REWORDED, REWORD_SYSTEM, rewordRequest, sameWording } from './record-similarity'

/** answers asked for one entry at most: the first, and again while the best has a problem */
const RECORD_TRIES = 3

/**
 * one answer, under an id that [멈추기] can call off; compact is the same request as 똑딱AI's
 * own, which the main process sends instead, held to entryGrammar. While the answer has a
 * problem (record-core.ts entryProblems: a concern written as praise, too short…) or ran on,
 * it is asked again, three answers at most; the best of them (pickEntry) is kept.
 */
export async function askRecordAi(
  system: string,
  text: string,
  id: string,
  compact?: RecordTurn,
): Promise<string> {
  if (!compact) return askAi(system, text, { id })
  const request = { ...compact, grammar: entryGrammar(compact.text) }
  const replies: string[] = []
  let failure: unknown = null
  for (let tries = 0; tries < RECORD_TRIES; tries++) {
    try {
      replies.push(cleanReply(await askAi(system, text, { id, compact: request })))
    } catch (err) {
      // an answer that ran on is asked again; a stop, or an AI that is not there, is not
      if (!(err instanceof StudentProblem)) throw err
      failure = err
    }
    if (replies.length && pickEntry(replies, compact.text).problems === 0) break
  }
  if (!replies.length) throw failure
  return pickEntry(replies, compact.text).entry
}

/** call a running request off: it ends as '멈췄어요.' */
export function cancelRecordAi(id: string): void {
  void window.saenggibu.cancel(id)
}

/**
 * The text said again in other words, away from the wording it shares with the others. At
 * temperature 0 the built-in model now and then hands a text back word for word, and would
 * every time for that text: it is then asked once more with some variety. Still the same:
 * NOT_REWORDED, and the text stays as it was. Rewording keeps the long instructions on 똑딱AI.
 */
export async function rewordWithAi(
  text: string,
  others: readonly string[],
  id: string,
): Promise<string> {
  const request = rewordRequest(text, others)
  for (const temperature of [0, 0.7]) {
    const reply = cleanReply(await askAi(REWORD_SYSTEM, request, { id, temperature }))
    if (!reply) throw new Error('AI가 빈 답을 보냈어요. 다시 해 주세요.')
    if (!sameWording(text, reply)) return reply
  }
  throw new Error(NOT_REWORDED)
}
