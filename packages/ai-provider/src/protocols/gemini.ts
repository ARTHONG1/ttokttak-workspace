import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'
import { aiFetch } from '../fetch'
import { httpBodyDetail } from '../http-error'
import { opencodeSessionHeaders } from '../providers'
import type { AiChatResponse, AiProviderConfig, AiTokenUsage } from '../types'
import { AiTimeoutError, createStreamWatchdog, type StreamWatchdog } from '../watchdog'
import { isAiNetworkError } from '../network-error'
import { toGeminiSchema } from './gemini-schema'
import {
  endpointUrl,
  isPlainObject,
  jsonBodyInsteadOfSse,
  readCappedResponseText,
  sseErrorText,
  sseDataEvents,
  throwIfCreditsNotice,
  throwIfToolCountOverBudget,
  usageCount,
  type StreamCallbacks,
} from './shared'

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

/** Merge a Gemini usageMetadata object into an accumulator (every stream chunk carries
 * one; the last chunk's counts are the turn's totals). */
function mergeGeminiUsage(
  target: AiTokenUsage,
  usage: { promptTokenCount?: unknown; candidatesTokenCount?: unknown } | undefined,
): void {
  if (!usage) return
  const input = usageCount(usage.promptTokenCount)
  const output = usageCount(usage.candidatesTokenCount)
  if (input !== undefined) target.inputTokens = input
  if (output !== undefined) target.outputTokens = output
}

// Gemini 3 rejects a model turn whose first functionCall lacks its thoughtSignature;
// calls that never had one (other provider's history) go back with Google's bypass sentinel.
const SKIP_SIGNATURE = 'skip_thought_signature_validator'

interface GeminiPart {
  text?: string
  /** a thought summary (thinkingConfig.includeThoughts), not part of the answer */
  thought?: boolean
  functionCall?: { name?: string; args?: Record<string, unknown> }
  thoughtSignature?: string
  /** snake_case spelling some gateways forward verbatim */
  thought_signature?: string
}

function geminiToolCall(part: GeminiPart): AgentToolCall {
  const signature = part.thoughtSignature ?? part.thought_signature
  const args: unknown = part.functionCall?.args
  const inputError =
    args === undefined || isPlainObject(args)
      ? undefined
      : `tool input must be a JSON object; raw: ${JSON.stringify(args).slice(0, 500)}`
  return {
    id: crypto.randomUUID(),
    name: part.functionCall?.name ?? '',
    input: isPlainObject(args) ? args : {},
    ...(inputError ? { inputError } : {}),
    ...(signature ? { signature } : {}),
  }
}

function geminiContents(messages: AgentMessage[]): unknown[] {
  const out = messages.map((m) => {
    if (m.role === 'user') {
      if (!m.images?.length) return { role: 'user', parts: [{ text: m.text }] }
      return {
        role: 'user',
        parts: [
          ...(m.text ? [{ text: m.text }] : []),
          ...m.images.map((img) => ({ inline_data: { mime_type: img.mime, data: img.base64 } })),
        ],
      }
    }
    if (m.role === 'assistant') {
      const parts: unknown[] = []
      if (m.text) parts.push({ text: m.text })
      for (const [i, call] of (m.toolCalls ?? []).entries()) {
        const signature = call.signature ?? (i === 0 ? SKIP_SIGNATURE : undefined)
        parts.push({
          functionCall: { name: call.name, args: call.input },
          ...(signature ? { thoughtSignature: signature } : {}),
        })
      }
      // Gemini rejects model turns with empty parts lists.
      if (parts.length === 0) parts.push({ text: '(no content)' })
      return { role: 'model', parts }
    }
    return {
      role: 'user',
      parts: m.results.map((r) => ({
        functionResponse: {
          name: r.name,
          response: r.isError ? { error: r.output } : { result: r.output },
        },
      })),
    }
  })
  if (out.length > 0 && (out[out.length - 1] as { role?: string }).role === 'model') {
    out.push({ role: 'user', parts: [{ text: 'Continue.' }] })
  }
  return out
}

/**
 * Emits a complete (non-streamed) Gemini response delivered as a plain JSON body.
 * `streamGenerateContent` without SSE framing yields an array of chunks; a gateway
 * may also send a single `generateContent`-shaped object — handle both.
 */
function emitGeminiJsonMessage(bodyText: string, cb: StreamCallbacks): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    throw new Error(`Gemini returned an unparseable JSON body: ${httpBodyDetail(bodyText)}`)
  }
  const events = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{
    candidates?: Array<{
      content?: { parts?: GeminiPart[] }
      finishReason?: string
    }>
    promptFeedback?: { blockReason?: string }
    usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown }
    error?: { message?: string } | string
  }>
  let emitted = false
  let toolCallCount = 0
  let stopReason: string | undefined
  let abnormalFinish: string | undefined
  const usage: AiTokenUsage = {}
  for (const event of events) {
    if (event.error) throw new Error(sseErrorText(event.error, 'Gemini error'))
    if (event.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt (${event.promptFeedback.blockReason})`)
    }
    mergeGeminiUsage(usage, event.usageMetadata)
    const finishReason = event.candidates?.[0]?.finishReason
    if (finishReason === 'MAX_TOKENS') stopReason = 'max_tokens'
    else if (finishReason && finishReason !== 'STOP') abnormalFinish = finishReason
    for (const part of event.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) {
        emitted = true
        cb.onDelta(part.text)
      }
      if (part.functionCall?.name) {
        emitted = true
        // A complete JSON body carries the whole turn at once, so the per-turn
        // tool budget of the streamed path has to be applied here as well
        throwIfToolCountOverBudget(++toolCallCount, 'gemini')
        cb.onToolCall(geminiToolCall(part))
      }
    }
  }
  if (!emitted) {
    throw new Error(
      abnormalFinish
        ? `Gemini returned no content (finishReason=${abnormalFinish})`
        : `Gemini returned no content: ${httpBodyDetail(bodyText)}`,
    )
  }
  if (stopReason) cb.onStopReason?.(stopReason)
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) cb.onUsage?.(usage)
}

/** Per-endpoint request shaping resolved from the provider registry. */
export interface GeminiRequestOptions {
  omitTemperature?: boolean | undefined
}

/**
 * Gemini 2.5 and 3.x think before answering and send no response headers until the
 * first chunk is ready. Thought summaries let a long turn stream early (measured on
 * Vertex: first byte 2.3s for a 57s turn, 70s without them).
 *
 * Gemini 3 Flash thinks at 'high' by default, which for one document-editing tool step
 * took 56-96s before the first byte; at 'low' the same request answered in 3s. An edit
 * is ten or more such steps, so Flash runs at 'low'. Pro keeps its default, and 2.5
 * models take a thinking budget instead (they reject thinkingLevel).
 */
const isFastThinkingModel = (model: string) => /(^|\/)gemini-[3-9][\w.]*-flash/i.test(model)

/**
 * Gemini 4 Argon sends its first byte quickly at its default thinking: over 24 editing
 * steps from three sessions at once (Vertex global, 2026-10-29) the median was 4.8s and
 * the slowest 23.8s. A request still silent at 25s is one Vertex is holding (one held
 * 45s, and the same request sent again answered in 6s), so it is sent again sooner.
 */
const isArgon = (model: string) => /(^|\/)gemini-4-argon/i.test(model)
const isQuickFirstByteModel = (model: string) => isFastThinkingModel(model) || isArgon(model)
export const GEMINI_ARGON_CONNECT_TIMEOUT_MS = 25_000
const connectTimeoutFor = (model: string) =>
  isArgon(model) ? GEMINI_ARGON_CONNECT_TIMEOUT_MS : isQuickFirstByteModel(model) ? GEMINI_FAST_CONNECT_TIMEOUT_MS : GEMINI_CONNECT_TIMEOUT_MS

function geminiThinkingConfig(model: string): Record<string, unknown> | undefined {
  if (isFastThinkingModel(model)) return { includeThoughts: true, thinkingLevel: 'low' }
  if (/(^|\/)gemini-(2\.5|[3-9])/i.test(model)) return { includeThoughts: true }
  return undefined
}

/**
 * How long a Gemini request may wait for its first byte. Vertex AI sometimes holds a
 * request with no answer at all (90-180s seen; the identical request answered in 4s
 * when sent again), while a step at the default thinking level can legitimately stay
 * silent for over a minute. One replay after 90s keeps both waits (180s) inside the
 * renderer's 240s silence watchdog. At 'low' thinking the slowest first byte measured
 * over ~40 editing steps was 21s, so Flash gives up on a held request after 45s.
 */
export const GEMINI_CONNECT_TIMEOUT_MS = 90_000
export const GEMINI_FAST_CONNECT_TIMEOUT_MS = 45_000
const STALLED_REQUEST_RETRIES = 1
/**
 * Argon waits only 25s, so it can afford one more replay: two held requests in a row were
 * seen (2026-10-30, a sheet edit failed after 2 x 25s; the same request then answered in
 * 7s). Three waits (75s) stay well inside the renderer's 240s silence watchdog.
 */
export const GEMINI_ARGON_STALLED_RETRIES = 2
const stalledRetriesFor = (model: string) =>
  isArgon(model) ? GEMINI_ARGON_STALLED_RETRIES : STALLED_REQUEST_RETRIES

export async function streamGemini(
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
  baseUrl = GEMINI_BASE_URL,
  options: GeminiRequestOptions = {},
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const wd = createStreamWatchdog(cb.signal, connectTimeoutFor(config.model))
    let received = false
    // answer text or a tool call reached the editor: from then on a replay would repeat it
    let answered = false
    const tracked: StreamWatchdog = {
      signal: wd.signal,
      guard: wd.guard,
      touch: () => {
        received = true
        wd.touch()
      },
    }
    const turnCb: StreamCallbacks = {
      ...cb,
      onDelta: (text) => {
        answered = true
        cb.onDelta(text)
      },
      onToolCall: (call) => {
        answered = true
        cb.onToolCall(call)
      },
    }
    try {
      return await wd.guard(() =>
        geminiTurn(config, system, messages, tools, maxTokens, turnCb, baseUrl, tracked, options),
      )
    } catch (err) {
      // Nothing of the answer reached the caller, so sending the same request again is
      // safe: a request that never got a byte, or a connection that failed before any
      // answer text or tool call (Cloud Run → Vertex resets were seen mid-run)
      const stalled = err instanceof AiTimeoutError && !received
      const dropped = !answered && !(err instanceof AiTimeoutError) && isAiNetworkError(err)
      if (cb.signal.aborted || !(stalled || dropped) || attempt >= stalledRetriesFor(config.model)) throw err
    }
  }
}

async function geminiTurn(
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
  baseUrl: string,
  wd: StreamWatchdog,
  options: GeminiRequestOptions,
): Promise<void> {
  const onBytes = () => {
    wd.touch()
    cb.onActivity?.()
  }
  const url = endpointUrl(baseUrl, `models/${config.model}:streamGenerateContent`, '?alt=sse')
  const response = await aiFetch(url, {
    method: 'POST',
    signal: wd.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
      ...opencodeSessionHeaders(baseUrl, cb.sessionId),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: geminiContents(messages),
      ...(tools.length > 0
        ? {
            tools: [
              {
                functionDeclarations: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  // JSON Schema constructs the Gemini proto lacks (type unions,
                  // $ref, ...) fail the whole request with HTTP 400
                  parameters: toGeminiSchema(t.inputSchema),
                })),
              },
            ],
          }
        : {}),
      // Google recommends the default temperature (1.0) for the Gemini 3
      // family — lower values may cause looping or degraded reasoning —
      // so omit our hard-coded 0.3 for those models via omitTemperature.
      generationConfig: {
        ...(options.omitTemperature ? {} : { temperature: 0.3 }),
        maxOutputTokens: maxTokens,
        ...(geminiThinkingConfig(config.model)
          ? { thinkingConfig: geminiThinkingConfig(config.model) }
          : {}),
      },
    }),
  })
  // headers arrived: ping the renderer watchdog too, or a slow first chunk could trip it
  onBytes()
  if (!response.ok || !response.body) {
    throw new Error(
      `Gemini HTTP ${response.status}: ${httpBodyDetail(await readCappedResponseText(response, onBytes))}`,
    )
  }
  const jsonBody = await jsonBodyInsteadOfSse(response, onBytes)
  if (jsonBody !== null) {
    throwIfCreditsNotice(jsonBody)
    return emitGeminiJsonMessage(jsonBody, cb)
  }
  let stopReason: string | undefined
  let abnormalFinish: string | undefined
  let sawFinish = false
  let emitted = false
  let toolCallCount = 0
  const turnUsage: AiTokenUsage = {}
  for await (const sse of sseDataEvents(response.body, onBytes)) {
    // A truncated frame or a non-JSON keep-alive from a proxy skips that event
    // rather than killing the turn.
    if (sse.json === undefined) continue
    const event = sse.json as {
      candidates?: Array<{
        content?: { parts?: GeminiPart[] }
        finishReason?: string
      }>
      promptFeedback?: { blockReason?: string }
      usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown }
      error?: { message?: string } | string
    }
    if (event.error) throw new Error(sseErrorText(event.error, 'Gemini stream error'))
    if (event.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt (${event.promptFeedback.blockReason})`)
    }
    // every chunk carries usageMetadata; later chunks supersede earlier ones
    mergeGeminiUsage(turnUsage, event.usageMetadata)
    const finishReason = event.candidates?.[0]?.finishReason
    if (finishReason) sawFinish = true
    if (finishReason === 'MAX_TOKENS') stopReason = 'max_tokens'
    else if (finishReason && finishReason !== 'STOP') abnormalFinish = finishReason
    for (const part of event.candidates?.[0]?.content?.parts ?? []) {
      if (part.thought) {
        if (part.text) cb.onReasoningDelta?.(part.text)
        continue
      }
      if (part.text) {
        emitted = true
        cb.onDelta(part.text)
      }
      // Gemini emits function calls whole, never as partial JSON
      if (part.functionCall?.name) {
        throwIfToolCountOverBudget(++toolCallCount, 'gemini')
        emitted = true
        cb.onToolCall(geminiToolCall(part))
      }
    }
  }
  // A safety/recitation stop that produced nothing, or a stream with no message
  // framing at all (gateway soft-failure), would otherwise look like an empty
  // success; a genuine empty turn still carries finishReason=STOP and passes
  if (!emitted && abnormalFinish) {
    throw new Error(`Gemini returned no content (finishReason=${abnormalFinish})`)
  }
  if (!emitted && !sawFinish) {
    throw new Error('Gemini returned no content (empty stream)')
  }
  if (!sawFinish) {
    throw new Error('Gemini stream ended before a finishReason')
  }
  if (stopReason) cb.onStopReason?.(stopReason)
  if (turnUsage.inputTokens !== undefined || turnUsage.outputTokens !== undefined)
    cb.onUsage?.(turnUsage)
}

export async function chatGemini(
  wd: StreamWatchdog,
  config: AiProviderConfig,
  system: string,
  user: string,
  baseUrl = GEMINI_BASE_URL,
  options: GeminiRequestOptions = {},
): Promise<AiChatResponse> {
  const url = endpointUrl(baseUrl, `models/${config.model}:generateContent`)
  const response = await aiFetch(url, {
    method: 'POST',
    signal: wd.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
      ...opencodeSessionHeaders(baseUrl),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { ...(options.omitTemperature ? {} : { temperature: 0.3 }) },
    }),
  })
  wd.touch()
  if (!response.ok) {
    return {
      ok: false,
      error: `Gemini HTTP ${response.status}: ${httpBodyDetail(await readCappedResponseText(response, () => wd.touch()))}`,
    }
  }
  // A 200 with an HTML shell / empty / truncated body (gateway soft-failure)
  // would make response.json() throw; return ok:false instead of leaking a
  // raw SyntaxError to the caller.
  const bodyText = await readCappedResponseText(response, () => wd.touch())
  let json: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  try {
    json = JSON.parse(bodyText) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
  } catch {
    return {
      ok: false,
      error: `Gemini returned a non-JSON response: ${httpBodyDetail(bodyText)}`,
    }
  }
  const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!content) return { ok: false, error: 'Gemini returned an empty response' }
  return { ok: true, content }
}
