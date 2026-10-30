import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentToolCall } from '@genoffice/agent-core'
import { streamForProvider } from '../src/stream'
import {
  GEMINI_ARGON_CONNECT_TIMEOUT_MS,
  GEMINI_ARGON_STALLED_RETRIES,
  GEMINI_CONNECT_TIMEOUT_MS,
  GEMINI_FAST_CONNECT_TIMEOUT_MS,
} from '../src/protocols/gemini'
import { IPC_STREAM_SILENCE_TIMEOUT_MS } from '@genoffice/agent-core'
import {
  AI_CONNECT_TIMEOUT_MS,
  AI_IDLE_TIMEOUT_MS,
  AiTimeoutError,
  createStreamWatchdog,
} from '../src/watchdog'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** promise that rejects when the given signal aborts (models a fetch/body read) */
function abortable(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new Error('aborted'))
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
}

describe('createStreamWatchdog', () => {
  it('aborts and reports AiTimeoutError when nothing arrives within the connect timeout', async () => {
    const wd = createStreamWatchdog(undefined, 1_000, 5_000)
    const run = wd.guard(() => abortable(wd.signal))
    const result = expect(run).rejects.toBeInstanceOf(AiTimeoutError)
    await vi.advanceTimersByTimeAsync(1_000)
    await result
  })

  it('touch() switches to the idle timeout and re-arms it on every call', async () => {
    const wd = createStreamWatchdog(undefined, 1_000, 2_000)
    const run = wd.guard(() => abortable(wd.signal))
    const result = expect(run).rejects.toBeInstanceOf(AiTimeoutError)
    await vi.advanceTimersByTimeAsync(900)
    wd.touch() // data arrived: idle timeout from now on
    await vi.advanceTimersByTimeAsync(1_900)
    expect(wd.signal.aborted).toBe(false)
    wd.touch()
    await vi.advanceTimersByTimeAsync(1_900)
    expect(wd.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(100)
    expect(wd.signal.aborted).toBe(true)
    await result
  })

  it('a caller abort propagates and keeps the original error (not AiTimeoutError)', async () => {
    const parent = new AbortController()
    const wd = createStreamWatchdog(parent.signal, 1_000, 1_000)
    const run = wd.guard(() => abortable(wd.signal))
    parent.abort()
    await expect(run).rejects.toThrow('aborted')
  })

  it('an already-aborted caller signal aborts immediately', () => {
    const parent = new AbortController()
    parent.abort()
    const wd = createStreamWatchdog(parent.signal)
    expect(wd.signal.aborted).toBe(true)
  })

  it('success resolves and disposes the timer (no abort after completion)', async () => {
    const wd = createStreamWatchdog(undefined, 1_000, 1_000)
    await expect(wd.guard(() => Promise.resolve('ok'))).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wd.signal.aborted).toBe(false)
  })

  it('non-timeout errors pass through unchanged', async () => {
    const wd = createStreamWatchdog(undefined, 1_000, 1_000)
    await expect(wd.guard(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })
})

describe('stream timeouts end to end', () => {
  // Vertex AI's shared capacity answers 429 RESOURCE_EXHAUSTED (and sometimes 503) for a
  // moment under load. Nothing has streamed yet, so the request is replayed with backoff.
  const geminiOk =
    'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n'
  const runGemini = (deltas: string[] = []) =>
    streamForProvider(
      'gemini',
      { apiKey: 'k', model: 'gemini-3.8-flash' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      { signal: new AbortController().signal, onDelta: (t: string) => deltas.push(t), onToolCall: () => {} },
    )

  it('gemini retries a 429 refused before any output and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 }))
      .mockResolvedValueOnce(new Response(geminiOk, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const run = runGemini(deltas)
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(run).resolves.toBeUndefined()
    expect(deltas.join('')).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('gemini gives up on a persistent 429 after a bounded number of attempts', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{"error":{"code":429}}', { status: 429 })))
    vi.stubGlobal('fetch', fetchMock)
    const run = runGemini()
    const result = expect(run).rejects.toThrow(/Gemini HTTP 429/)
    await vi.advanceTimersByTimeAsync(120_000)
    await result
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('gemini does not retry a 400 (the request itself is wrong)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":{"code":400}}', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const run = runGemini()
    const result = expect(run).rejects.toThrow(/Gemini HTTP 400/)
    await vi.advanceTimersByTimeAsync(60_000)
    await result
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // Vertex AI sends no response headers until the model's first chunk is ready. With
  // thought summaries requested, a working turn streams within seconds even while it thinks
  // for minutes; a request that sends nothing is stuck in Vertex's queue (seen: 180s with no
  // headers, while the same request answered in 4s when replayed) and is replayed.
  const sseResponse = (body: string) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })

  const runGeminiModel = (model: string, deltas: string[] = []) =>
    streamForProvider(
      'gemini',
      { apiKey: 'k', model },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      { signal: new AbortController().signal, onDelta: (t: string) => deltas.push(t), onToolCall: () => {} },
    )

  it('gemini flash replays a request whose headers never arrive after 45s', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => abortable(init.signal!))
      .mockResolvedValueOnce(sseResponse(geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const run = runGemini(deltas)
    // at low thinking the slowest first byte measured on Vertex was 21s
    await vi.advanceTimersByTimeAsync(GEMINI_FAST_CONNECT_TIMEOUT_MS - 1_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(run).resolves.toBeUndefined()
    expect(deltas.join('')).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gemini pro waits longer before a replay (it keeps its default thinking)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => abortable(init.signal!))
      .mockResolvedValueOnce(sseResponse(geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const run = runGeminiModel('gemini-3-pro')
    await vi.advanceTimersByTimeAsync(AI_CONNECT_TIMEOUT_MS + 5_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(GEMINI_CONNECT_TIMEOUT_MS)
    await expect(run).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gemini 4 argon replays a held request after 25s', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => abortable(init.signal!))
      .mockResolvedValueOnce(sseResponse(geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const run = runGeminiModel('gemini-4-argon')
    // its slowest first byte over 24 editing steps was 23.8s
    await vi.advanceTimersByTimeAsync(GEMINI_ARGON_CONNECT_TIMEOUT_MS - 1_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(run).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const sent = JSON.parse(String(fetchMock.mock.calls[1]![1].body))
    // default thinking and default temperature (Gemini 4 keeps sampling fixed)
    expect(sent.generationConfig.thinkingConfig).toEqual({ includeThoughts: true })
    expect(sent.generationConfig.temperature).toBeUndefined()
  })

  it('gemini 4 argon replays twice, inside the renderer silence watchdog', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => abortable(init.signal!))
      .mockImplementationOnce((_url: string, init: RequestInit) => abortable(init.signal!))
      .mockResolvedValueOnce(sseResponse(geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const run = runGeminiModel('gemini-4-argon')
    await vi.advanceTimersByTimeAsync(GEMINI_ARGON_CONNECT_TIMEOUT_MS * 2 + 1_000)
    await expect(run).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(GEMINI_ARGON_CONNECT_TIMEOUT_MS * (GEMINI_ARGON_STALLED_RETRIES + 1)).toBeLessThan(
      IPC_STREAM_SILENCE_TIMEOUT_MS,
    )
  })

  it('gemini gives up with AiTimeoutError when every attempt stalls', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => abortable(init.signal!))
    vi.stubGlobal('fetch', fetchMock)
    const run = runGeminiModel('gemini-3-pro')
    const result = expect(run).rejects.toBeInstanceOf(AiTimeoutError)
    // two waits in all, inside the renderer's 240s silence watchdog
    await vi.advanceTimersByTimeAsync(GEMINI_CONNECT_TIMEOUT_MS * 2 + 1_000)
    await result
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(GEMINI_CONNECT_TIMEOUT_MS * 2).toBeLessThan(IPC_STREAM_SILENCE_TIMEOUT_MS)
  })

  it('gemini replays a request whose connection failed before any answer', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }))
      .mockResolvedValueOnce(sseResponse(geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const run = runGemini(deltas)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(run).resolves.toBeUndefined()
    expect(deltas.join('')).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gemini does not replay a connection that dropped after answer text was shown', async () => {
    const encoder = new TextEncoder()
    const fetchMock = vi.fn().mockImplementation(() => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"half"}]}}]}\n\n'),
          )
          setTimeout(() => controller.error(Object.assign(new TypeError('terminated'), { cause: { code: 'UND_ERR_SOCKET' } })), 10)
        },
      })
      return Promise.resolve(new Response(body, { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const run = runGemini(deltas)
    const result = expect(run).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(1_000)
    await result
    expect(deltas.join('')).toBe('half')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gemini does not replay a stream that went silent after it started', async () => {
    const encoder = new TextEncoder()
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"half"}]}}]}\n\n'),
          )
          init.signal!.addEventListener('abort', () => controller.error(new Error('aborted')))
        },
      })
      return Promise.resolve(new Response(body, { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const run = runGemini()
    const result = expect(run).rejects.toBeInstanceOf(AiTimeoutError)
    await vi.advanceTimersByTimeAsync(AI_IDLE_TIMEOUT_MS + 1_000)
    await result
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gemini asks thinking models for thought summaries and reports them as reasoning', async () => {
    const thought =
      'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"**Planning**","thought":true}]}}]}\n\n'
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(thought + geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const reasoning: string[] = []
    const run = streamForProvider(
      'gemini',
      { apiKey: 'k', model: 'gemini-3.8-flash' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      {
        signal: new AbortController().signal,
        onDelta: (t: string) => deltas.push(t),
        onReasoningDelta: (t: string) => reasoning.push(t),
        onToolCall: () => {},
      },
    )
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(run).resolves.toBeUndefined()
    expect(deltas.join('')).toBe('ok')
    expect(reasoning.join('')).toBe('**Planning**')
    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1].body))
    // Gemini 3 Flash at its default (high) thinking spent ~55s per editing tool step on
    // Vertex; 'low' answered the same request in 3s
    expect(sent.generationConfig.thinkingConfig).toEqual({ includeThoughts: true, thinkingLevel: 'low' })
  })

  it.each([
    ['gemini-3-pro', { includeThoughts: true }],
    ['gemini-2.5-flash', { includeThoughts: true }],
    ['gemini-3.1-flash-lite', { includeThoughts: true, thinkingLevel: 'low' }],
  ])('gemini thinking config for %s', async (model, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const run = streamForProvider(
      'gemini',
      { apiKey: 'k', model },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      { signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} },
    )
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(run).resolves.toBeUndefined()
    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1].body))
    expect(sent.generationConfig.thinkingConfig).toEqual(expected)
  })

  it('gemini leaves thinkingConfig out for models without thinking', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(geminiOk))
    vi.stubGlobal('fetch', fetchMock)
    const run = streamForProvider(
      'gemini',
      { apiKey: 'k', model: 'gemini-2.0-flash' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      { signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} },
    )
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(run).resolves.toBeUndefined()
    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1].body))
    expect(sent.generationConfig.thinkingConfig).toBeUndefined()
  })

  const collector = () => {
    const deltas: string[] = []
    return {
      deltas,
      cb: {
        signal: new AbortController().signal,
        onDelta: (text: string) => deltas.push(text),
        onToolCall: (_call: AgentToolCall) => {},
      },
    }
  }

  it('rejects with AiTimeoutError when the connection never yields a response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => abortable(init.signal!)),
    )
    const { cb } = collector()
    const run = streamForProvider(
      'anthropic',
      { apiKey: 'k', model: 'claude-sonnet-5' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      cb,
    )
    const result = expect(run).rejects.toBeInstanceOf(AiTimeoutError)
    await vi.advanceTimersByTimeAsync(AI_CONNECT_TIMEOUT_MS)
    await result
  })

  it('rejects with AiTimeoutError when an open stream goes silent', async () => {
    const encoder = new TextEncoder()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal!
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n',
              ),
            )
            // stays open forever; reads reject once the watchdog aborts
            signal.addEventListener('abort', () => controller.error(new Error('aborted')))
          },
        })
        return Promise.resolve(new Response(body, { status: 200 }))
      }),
    )
    const { deltas, cb } = collector()
    const run = streamForProvider(
      'anthropic',
      { apiKey: 'k', model: 'claude-sonnet-5' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      cb,
    )
    const result = expect(run).rejects.toBeInstanceOf(AiTimeoutError)
    await vi.advanceTimersByTimeAsync(AI_IDLE_TIMEOUT_MS + 1_000)
    await result
    expect(deltas).toEqual(['hi'])
  })

  it('reports wire activity through onActivity', async () => {
    const encoder = new TextEncoder()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"ping"}\n'))
            controller.close()
          },
        })
        return Promise.resolve(new Response(body, { status: 200 }))
      }),
    )
    const onActivity = vi.fn()
    const run = streamForProvider(
      'anthropic',
      { apiKey: 'k', model: 'claude-sonnet-5' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      { ...collector().cb, onActivity },
    )
    // a ping-only stream carries no content, so the turn itself rejects
    await expect(run).rejects.toThrow(/returned no content/)
    expect(onActivity).toHaveBeenCalled()
  })
})
