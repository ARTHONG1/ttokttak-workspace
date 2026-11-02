/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import { ClassTools, ACE_CANVAS_APP_URL, ACE_CANVAS_DESCRIPTION, ACE_CANVAS_VIDEO_URL } from '../src/renderer/src/ClassTools'
import { FEATURE_LINKS } from '../src/main/special-feature-files'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  host.remove()
  delete document.documentElement.dataset.edition
})

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).not.toBeNull()
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('ClassTools — ACE 명화 card', () => {
  it('registers the ACE 명화 app and video URLs in FEATURE_LINKS', () => {
    expect(FEATURE_LINKS.aceCanvas).toBe(
      'https://ace-canvas--project-0c1d3dab-8644-4690-9e4.asia-east1.hosted.app/',
    )
    expect(FEATURE_LINKS.aceCanvasVideo).toBe('https://youtu.be/1wl_L17E8R4')
    expect(ACE_CANVAS_APP_URL).toBe(FEATURE_LINKS.aceCanvas)
    expect(ACE_CANVAS_VIDEO_URL).toBe(FEATURE_LINKS.aceCanvasVideo)
  })

  it('renders the ACE 명화 card with title, YouTube video, 설명 dialog, and 바로가기 action', async () => {
    const openFeatureLink = vi.fn().mockResolvedValue(undefined)
    window.aiOffice = { openFeatureLink } as unknown as HomeApi

    await act(async () => {
      root.render(createElement(ClassTools, { variant: 'desktop' }))
    })

    const card = host.querySelector('[data-testid="class-tool-ace-canvas"]')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('ACE 명화')

    const iframe = card?.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toContain('youtube.com/embed/1wl_L17E8R4')

    // Clicking 설명 opens the modal with the one-paragraph introduction from 명화 소개.md
    const descBtn = host.querySelector('[data-testid="class-tool-ace-canvas-desc"]')
    await click(descBtn)

    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('나도 미술가, AI와 함께하는 명화 따라잡기!')
    expect(dialog?.textContent).toContain(ACE_CANVAS_DESCRIPTION)
    expect(ACE_CANVAS_DESCRIPTION).toContain(
      '관찰에서 글쓰기, 투표와 작품 감상으로 이어지는 활동을 통해 학생들은 자신의 생각을 구체적으로 표현하고 서로 다른 시선을 발견합니다.',
    )

    // Close dialog and click 바로가기 on the card
    const closeBtn = dialog?.querySelector('[aria-label="닫기"]')
    await click(closeBtn)
    expect(host.querySelector('[role="dialog"]')).toBeNull()

    const openBtn = host.querySelector('[data-testid="class-tool-ace-canvas-open"]')
    expect(openBtn?.getAttribute('href')).toBe(
      'https://ace-canvas--project-0c1d3dab-8644-4690-9e4.asia-east1.hosted.app/',
    )
    await click(openBtn)
    expect(openFeatureLink).toHaveBeenCalledWith('aceCanvas')
  })
})
