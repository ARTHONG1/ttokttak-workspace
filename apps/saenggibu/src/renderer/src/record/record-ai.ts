/**
 * How 생기부 asks this app's AI, the built-in 똑딱AI: one answer to a 생기부 instruction, a
 * rewording, and calling a request off. 똑딱작업실 keeps a file of the same name for its own AI
 * (apps/shell/src/renderer/src/record/record-ai.ts); the pages use only these three.
 */
import { StudentProblem, askAi } from '../common'
import { cleanReply, entryGrammar, pickEntry, type RecordTurn } from './record-core'
import { NOT_REWORDED, REWORD_SYSTEM, rewordRequest, sameWording } from './record-similarity'

/**
 * Whether this is an Apple Silicon Mac, where 똑딱AI writes four answers at once on the GPU
 * (main/local-ai.ts SERVER_SHAPE): there one entry is asked twice side by side.
 */
async function appleSilicon(): Promise<boolean> {
  try {
    const agent = (
      navigator as Navigator & {
        userAgentData?: {
          getHighEntropyValues(
            hints: string[],
          ): Promise<{ platform?: string; architecture?: string }>
        }
      }
    ).userAgentData
    const values = await agent?.getHighEntropyValues(['platform', 'architecture'])
    return values?.platform === 'macOS' && values.architecture === 'arm'
  } catch {
    return false
  }
}

/** the id of one of the answers asked side by side for an entry */
const answerId = (id: string, at: number): string => (at === 0 ? id : id + '~' + (at + 1))

/**
 * one answer, under an id that [멈추기] can call off; compact is the same request as 똑딱AI's
 * own, which the main process sends instead, held to entryGrammar. On an Apple Silicon Mac two
 * answers are asked side by side, elsewhere one; the best (record-core.ts pickEntry) is kept,
 * and while it still has a problem (entryProblems), or ran on, more are asked: four answers at
 * most on a Mac, three elsewhere.
 */
export async function askRecordAi(
  system: string,
  text: string,
  id: string,
  compact?: RecordTurn,
): Promise<string> {
  if (!compact) return askAi(system, text, { id })
  const request = { ...compact, grammar: entryGrammar(compact.text) }
  const width = (await appleSilicon()) ? 2 : 1
  const replies: string[] = []
  let failure: unknown = null
  for (let round = 0; round < (width > 1 ? 2 : 3); round++) {
    const answers = await Promise.allSettled(
      Array.from({ length: width }, (_, at) =>
        askAi(system, text, { id: answerId(id, at), compact: request }),
      ),
    )
    for (const answer of answers) {
      if (answer.status === 'fulfilled') replies.push(cleanReply(answer.value))
      // an answer that ran on is asked again; a stop, or an AI that is not there, is not
      else if (answer.reason instanceof StudentProblem) failure = answer.reason
      else throw answer.reason
    }
    if (replies.length && pickEntry(replies, compact.text).problems === 0) break
  }
  if (!replies.length) throw failure
  return pickEntry(replies, compact.text).entry
}

/** call a running request off: it ends as '멈췄어요.' */
export function cancelRecordAi(id: string): void {
  for (const at of [0, 1]) void window.saenggibu.cancel(answerId(id, at))
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
