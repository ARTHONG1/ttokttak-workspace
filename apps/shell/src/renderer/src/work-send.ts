/**
 * Hands a task's work to the 똑딱작업실 extension in this browser (the web edition's only
 * route). An extension from before task names (0.4.0 and earlier) answers the new message
 * as unknown; 에듀파인 품의 then goes again under its old name, so a web app update does not
 * wait for every teacher to update the extension.
 */
import { EXTENSION_ID } from '@genoffice/ttokttak-extension/ids'

export interface ExtensionRuntime {
  sendMessage(id: string, msg: unknown, cb: (reply: unknown) => void): void
  lastError?: { message?: string }
}

/** null: no extension answered */
export type ExtensionReply = { ok?: boolean; reason?: string; moved?: unknown } | null

/** what an extension says to a message type it does not have */
const UNKNOWN_REQUEST = '알 수 없는 요청이에요.'
/** each task's message from before task names */
const OLD_SEND: Readonly<Record<string, (text: string) => unknown>> = {
  'edufine-pumui': (text) => ({ type: 'pumui:send', text }),
}

function ask(rt: ExtensionRuntime, msg: unknown, timeoutMs: number): Promise<ExtensionReply> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    try {
      rt.sendMessage(EXTENSION_ID, msg, (r: unknown) => {
        clearTimeout(timer)
        resolve(rt.lastError ? null : ((r ?? null) as ExtensionReply))
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

export async function sendWorkToExtension(
  feature: string,
  text: string,
  rt: ExtensionRuntime,
  timeoutMs = 4000,
): Promise<ExtensionReply> {
  const reply = await ask(rt, { type: 'work:send', feature, text }, timeoutMs)
  const old = Object.hasOwn(OLD_SEND, feature) ? OLD_SEND[feature] : undefined
  if (reply && reply.ok === false && reply.reason === UNKNOWN_REQUEST && old)
    return ask(rt, old(text), timeoutMs)
  return reply
}
