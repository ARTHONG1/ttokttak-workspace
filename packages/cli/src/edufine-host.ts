/**
 * Chrome native messaging host for the 똑딱작업실 extension. Chrome starts it
 * (through the edufine-host launcher next to the CLI) for each message: a 4-byte
 * little-endian length and a JSON body on stdin, one reply in the same framing on stdout.
 * It asks the running app over the control channel for the newest waiting work of the task
 * the extension names ('work-take'; an extension from before task names means 에듀파인 품의)
 * and never reads or writes files. stdout carries only the framed reply. This host ships
 * inside the app, so the app always knows 'work-take'.
 */
import type { Readable, Writable } from 'node:stream'
import { controlEndpoint, controlRequest } from './control'
import type { ControlEndpoint, ControlRequest } from './control-protocol'

/** Chrome's limit for a message to a native host */
export const NATIVE_MAX_BYTES = 1024 * 1024

export function encodeNativeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)
  return Buffer.concat([head, body])
}

export function readNativeMessage(input: Readable): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0)
    let need = -1
    const done = (fn: () => void) => {
      input.removeAllListeners('data')
      input.removeAllListeners('end')
      fn()
    }
    input.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      if (need < 0 && buf.length >= 4) {
        need = buf.readUInt32LE(0)
        if (need > NATIVE_MAX_BYTES) return done(() => reject(new Error('message too large')))
      }
      if (need >= 0 && buf.length >= 4 + need) {
        const body = buf.subarray(4, 4 + need).toString('utf8')
        done(() => {
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error('message is not JSON'))
          }
        })
      }
    })
    input.on('end', () => done(() => reject(new Error('message incomplete'))))
    input.on('error', (err) => done(() => reject(err)))
  })
}

export interface HostDeps {
  endpoint(): ControlEndpoint | null
  request(endpoint: ControlEndpoint, request: ControlRequest): Promise<Record<string, unknown>>
  version: string
}

export type HostReply =
  { ok: true; version?: string; text?: string | null } | { ok: false; state: 'off'; reason: string }

const OFF = '똑딱작업실이 켜져 있지 않아요.'
/** task ids as the extension's registry writes them */
const TASK_ID = /^[a-z0-9-]{1,40}$/

export async function handleHostMessage(message: unknown, deps: HostDeps): Promise<HostReply> {
  const type = (message as { type?: unknown } | null)?.type
  if (type !== 'ping' && type !== 'take')
    return { ok: false, state: 'off', reason: '알 수 없는 요청이에요.' }
  const named = (message as { feature?: unknown }).feature
  const feature = named === undefined ? 'edufine-pumui' : named
  if (type === 'take' && (typeof feature !== 'string' || !TASK_ID.test(feature)))
    return { ok: false, state: 'off', reason: '알 수 없는 업무예요.' }
  const endpoint = deps.endpoint()
  if (!endpoint) return { ok: false, state: 'off', reason: OFF }
  if (type === 'ping') return { ok: true, version: deps.version }
  try {
    const result = await deps.request(endpoint, { cmd: 'work-take', feature: feature as string })
    return { ok: true, text: typeof result.text === 'string' ? result.text : null }
  } catch (err) {
    return {
      ok: false,
      state: 'off',
      reason: OFF + ' (' + (err instanceof Error ? err.message : String(err)) + ')',
    }
  }
}

export async function runEdufineHost(
  stdin: Readable,
  stdout: Writable,
  deps: HostDeps = {
    endpoint: () => controlEndpoint(process.env),
    request: (endpoint, request) => controlRequest(endpoint, request, 10_000),
    version: process.env.GENOFFICE_APP_VERSION ?? '',
  },
): Promise<void> {
  let reply: HostReply
  try {
    reply = await handleHostMessage(await readNativeMessage(stdin), deps)
  } catch (err) {
    reply = { ok: false, state: 'off', reason: err instanceof Error ? err.message : String(err) }
  }
  await new Promise<void>((resolve) => stdout.write(encodeNativeMessage(reply), () => resolve()))
}
