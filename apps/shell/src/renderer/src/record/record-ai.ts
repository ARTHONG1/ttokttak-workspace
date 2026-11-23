/**
 * How 생기부 asks this app's AI (the one chosen in the AI settings, 똑딱AI with its 생기부
 * adapter or a connected one): one answer to a 생기부 instruction, a rewording, and calling a
 * request off. 똑딱생기부 keeps a file of the same name for its built-in AI
 * (apps/saenggibu/src/renderer/src/record/record-ai.ts); the pages use only these three.
 */
import { askAi } from '../special-common'
import {
  GENERATE_AT_ONCE,
  cleanReply,
  entryGrammar,
  pickEntry,
  type RecordTurn,
} from './record-core'
import { NOT_REWORDED, REWORD_SYSTEM, rewordRequest, sameWording } from './record-similarity'

/** requests [멈추기] called off: a stopped answer is not asked again */
const calledOff = new Set<string>()

/** whether the AI chosen in settings is the built-in 똑딱AI (so it is, when that cannot be read) */
async function onBuiltInAi(): Promise<boolean> {
  try {
    return (await window.aiOffice?.getAiSettings?.())?.provider === 'local'
  } catch {
    return true
  }
}

/**
 * Whether this is an Apple Silicon Mac, where 똑딱AI writes four answers at once on the GPU
 * (apps/docs/src/main/local-ai-runtime.ts): there one entry is asked twice side by side.
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
 * own, which the main process sends instead only to the built-in model
 * (apps/docs/src/main/school-record-turn.ts), held to entryGrammar. There, on an Apple Silicon
 * Mac two answers are asked side by side, elsewhere one; the best (record-core.ts pickEntry)
 * is kept, and while it still has a problem (entryProblems) more are asked: four answers at
 * most on a Mac, three elsewhere.
 */
export async function askRecordAi(
  system: string,
  text: string,
  id: string,
  compact?: RecordTurn,
): Promise<string> {
  const ask = (requestId: string, turn?: RecordTurn): Promise<string> =>
    askAi(system, text, [], 4000, {
      feature: 'school_record',
      requestId,
      ...(turn ? { compact: turn } : {}),
    })
  if (!compact || !(await onBuiltInAi())) return ask(id, compact)
  const request = { ...compact, grammar: entryGrammar(compact.text) }
  const width = (await appleSilicon()) ? 2 : 1
  const replies: string[] = []
  try {
    for (let round = 0; round < (width > 1 ? 2 : 3) && !calledOff.has(id); round++) {
      const answers = await Promise.all(
        Array.from({ length: width }, (_, at) => ask(answerId(id, at), request)),
      )
      replies.push(...answers.map(cleanReply))
      if (pickEntry(replies, compact.text).problems === 0) break
    }
    return pickEntry(replies, compact.text).entry
  } finally {
    calledOff.delete(id)
  }
}

/** students written at once on a connected AI (Codex, Claude, the web's Gemini) */
const CONNECTED_AT_ONCE = 3

/**
 * how many students a whole-class run writes at once: on the built-in 똑딱AI one after another
 * (GENERATE_AT_ONCE, as in 똑딱생기부), on a connected AI three side by side
 */
export async function studentsAtOnce(): Promise<number> {
  return (await onBuiltInAi()) ? GENERATE_AT_ONCE : CONNECTED_AT_ONCE
}

/** call a running request off: its stream ends with what came so far, which the page drops */
export function cancelRecordAi(id: string): void {
  calledOff.add(id)
  for (const at of [0, 1]) void window.aiOffice?.aiStreamCancel?.(answerId(id, at))
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
