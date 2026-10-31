/**
 * Image generation through the Codex subscription is not part of this build:
 * loading this package's main entry registers no Codex generator and declares
 * nothing available. A ready Codex subscription therefore never becomes the
 * image route; the request goes to a key provider or ends in "unavailable".
 */
import { describe, expect, it } from 'vitest'
import { codexImageGenerationAvailable, normalizeAiSettings } from '@genoffice/ai-provider'
import { aiToolCapabilities, codexImageGenerator, generateImageTool } from '../src/index'
import { keyMedia, status, writeSettings } from './routing-helpers'

const READY = { codex: status('codex', 'ready') }

describe('a process that loaded the main entry', () => {
  it('has no Codex image generator and no declared availability', () => {
    expect(codexImageGenerator()).toBeNull()
    expect(codexImageGenerationAvailable()).toBe(false)
  })

  it('reports image generation unavailable on a ready Codex subscription without a key', async () => {
    const patch = { media: { imageProvider: 'codex' } }
    const settings = normalizeAiSettings({ provider: 'auto', providers: {}, ...patch })
    const context = { path: 'screen' as const, statuses: READY }
    expect(aiToolCapabilities(settings, context).imageGeneration).toMatchObject({
      available: false,
      route: null,
      provider: null,
    })
    const r = await generateImageTool(writeSettings(patch), { prompt: 'a red apple' }, { context })
    expect(r.errorCode).toBe('unavailable')
    expect(r.url).toBeUndefined()
  })

  it('routes a selected Codex to the configured key provider', () => {
    const settings = normalizeAiSettings({
      provider: 'auto',
      providers: {},
      media: keyMedia({ imageProvider: 'codex' }, 'gemini'),
    })
    expect(
      aiToolCapabilities(settings, { path: 'screen', statuses: READY }).imageGeneration,
    ).toEqual({ available: true, route: 'key', provider: 'gemini' })
  })
})
