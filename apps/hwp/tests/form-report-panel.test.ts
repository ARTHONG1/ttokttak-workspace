/** @vitest-environment jsdom */
// The form analysis made when a document opens is reported in the AI conversation, and the
// 양식 유지 switch sits in the composer: the two places a user looks while talking to the AI.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import type { FormMode, FormProfile } from '../src/renderer/ai/form-guard'
import { LocaleProvider } from '../src/renderer/i18n/locale'

let container: HTMLElement
let root: Root | null = null

const PROFILE: FormProfile = {
  pages: 2,
  tableCount: 7,
  emptyCells: 9,
  fields: 3,
  tables: [1, 2, 3, 4, 5, 6, 7].map((table) => ({
    table,
    rows: 4,
    cols: 3,
    emptyCells: table === 1 ? 6 : 0,
    near: table === 1 ? '참가 신청서' : '',
  })),
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollTo = () => undefined
  container = document.createElement('div')
  document.body.appendChild(container)
  Object.assign(window, {
    hwpApi: {
      getAiSettings: async () => defaultAiSettings(),
      setAiSettings: async () => undefined,
      onAiSettingsChanged: () => () => undefined,
      openAiModelSettings: async () => undefined,
      setAiPanelPrefs: async () => ({}),
      getPathForFile: () => '',
      onAiStream: () => () => undefined,
      aiStream: async () => undefined,
      aiStreamCancel: async () => undefined,
      onLanguageChanged: () => () => undefined,
    },
  })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container.remove()
  delete (window as { hwpApi?: unknown }).hwpApi
  vi.unstubAllGlobals()
})

async function show(props: {
  formMode?: FormMode
  formProfile?: FormProfile | null
  formStatus?: 'analyzing' | 'ready' | 'failed'
  onFormModeChange?: (mode: FormMode) => void
}): Promise<void> {
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(
        LocaleProvider,
        { initial: 'ko' },
        createElement(AiPanel, {
          bridge: {} as AgentBridge,
          filePath: null,
          onCollapse: () => undefined,
          ...props,
        }),
      ),
    )
  })
  for (let turn = 0; turn < 6; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const report = () => container.querySelector('.ai-chat .ai-form-report')
const toggle = () => container.querySelector<HTMLButtonElement>('.ai-form-lock')

describe('the form report in the conversation', () => {
  it('says the analysis is running while the document is read', async () => {
    await show({ formStatus: 'analyzing' })
    expect(report()?.textContent).toContain('양식을 분석하는 중')
  })

  it('reports what the analysis found, with the tables, as the first message', async () => {
    await show({ formStatus: 'ready', formProfile: PROFILE })
    const text = report()?.textContent ?? ''
    expect(text).toContain('문서 양식을 분석했습니다')
    expect(text).toContain('2쪽')
    expect(text).toContain('표 7개')
    expect(text).toContain('빈 칸 9개')
    expect(text).toContain('누름틀 3개')
    expect(text).toContain('표 1: 4행 × 3열, 빈 칸 6개')
    expect(text).toContain('참가 신청서')
    // a long list is cut, and says so
    expect(text).toContain('표 2개 더')
    expect(text).toContain('양식 유지')
  })

  it('says what the lock does once it is on', async () => {
    await show({ formStatus: 'ready', formProfile: PROFILE, formMode: 'lock' })
    expect(report()?.textContent).toContain('글자만 바꾸')
  })

  it('says when the analysis failed', async () => {
    await show({ formStatus: 'failed' })
    expect(report()?.textContent).toContain('분석하지 못했습니다')
  })
})

describe('the 양식 유지 switch in the composer', () => {
  it('sits in the composer and shows the mode', async () => {
    await show({ formStatus: 'ready', formProfile: PROFILE, formMode: 'lock' })
    expect(container.querySelector('.ai-composer .ai-form-lock, .ai-form-lock')).not.toBeNull()
    expect(toggle()?.getAttribute('role')).toBe('switch')
    expect(toggle()?.getAttribute('aria-checked')).toBe('true')
    expect(toggle()?.textContent).toContain('양식 유지')
  })

  it('turns the lock on and off', async () => {
    const changes: FormMode[] = []
    await show({
      formStatus: 'ready',
      formProfile: PROFILE,
      onFormModeChange: (m) => changes.push(m),
    })
    expect(toggle()?.getAttribute('aria-checked')).toBe('false')
    await act(async () => toggle()!.click())
    expect(changes).toEqual(['lock'])
  })
})
