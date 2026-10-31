/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings, type AiSettings } from '@genoffice/ai-provider'
import { AiModelPicker, type AiModelPickerBridge } from '../src/AiModelPicker'
import { WEB_ADVANCED_MODEL, WEB_BASIC_MODEL } from '../src/web-ai-tiers'

function webSettings(model: string): AiSettings {
  const base = defaultAiSettings()
  return {
    ...base,
    provider: 'gemini',
    providers: { ...base.providers, gemini: { apiKey: 'vertex-adc', model } },
  }
}

describe('AiModelPicker on the web edition', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    document.documentElement.dataset.edition = 'web'
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    delete document.documentElement.dataset.edition
    delete document.documentElement.dataset.webAdvanced
    vi.unstubAllGlobals()
  })

  async function open(bridge: AiModelPickerBridge) {
    await act(async () => {
      root.render(createElement(AiModelPicker, { bridge, lang: 'ko' }))
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.ai-model-chip')!.click()
    })
  }

  it('lists 기본형 and a locked 고급형 only', async () => {
    const setSettings = vi.fn(async () => undefined)
    await open({ getSettings: async () => webSettings(WEB_BASIC_MODEL), setSettings })
    expect(host.querySelector('.ai-model-chip-text')!.textContent).toBe('기본형')
    const items = [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
    expect(items.map((b) => b.dataset.tier)).toEqual(['basic', 'advanced'])
    expect(items[1]!.disabled).toBe(true)
    await act(async () => items[1]!.click())
    expect(setSettings).not.toHaveBeenCalled()
  })

  it('switches to 고급형 once the server opens it', async () => {
    document.documentElement.dataset.webAdvanced = '1'
    let stored = webSettings(WEB_BASIC_MODEL)
    const setSettings = vi.fn(async (next: AiSettings) => {
      stored = next
    })
    await open({ getSettings: async () => stored, setSettings })
    const advanced = host.querySelector<HTMLButtonElement>('[data-tier="advanced"]')!
    expect(advanced.disabled).toBe(false)
    await act(async () => advanced.click())
    expect(stored.providers.gemini.model).toBe(WEB_ADVANCED_MODEL)
    expect(stored.provider).toBe('gemini')
  })
})
