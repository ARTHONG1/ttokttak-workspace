/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TabBar } from '../src/renderer/src/TabBar'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let clean: (() => void) | undefined
afterEach(() => {
  clean?.()
  delete document.documentElement.dataset.edition
})

it.each(['web', 'desktop'])('opens a document from the tab bar in %s', async (edition) => {
  document.documentElement.dataset.edition = edition
  const browse = vi.fn(async () => {})
  Object.assign(window, {
    aiOffice: { browse },
    aiOfficeTabs: {
      list: async () => [],
      onChanged: () => () => {},
      onSplitHint: () => () => {},
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  clean = () => {
    act(() => root.unmount())
    host.remove()
  }
  await act(async () => root.render(createElement(TabBar, { split: null })))
  const button = host.querySelector<HTMLButtonElement>('[data-testid="tab-open-file"]')
  expect(button).not.toBeNull()
  await act(async () => button?.click())
  expect(browse).toHaveBeenCalledOnce()
})
