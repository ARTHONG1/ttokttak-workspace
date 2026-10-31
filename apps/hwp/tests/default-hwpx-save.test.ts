// @vitest-environment node
/**
 * HWPX is the format the app writes by default (user decision 2026-10-30). A plain Save
 * of an opened .hwp goes to <name>.hwpx beside it, so the .hwp is never replaced; when
 * that name is taken, the Save dialog asks with HWPX first. A .hwpx saves in place.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const showSaveDialog = vi.fn(
  async (..._args: unknown[]): Promise<{ canceled: boolean; filePath?: string }> => ({
    canceled: true,
  }),
)

interface FakeContents {
  id: number
  destroyed: boolean
  isDestroyed(): boolean
  setWindowOpenHandler(handler: unknown): void
  loadURL(url: string): Promise<void>
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
}

let nextId = 1
function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: nextId++,
    destroyed: false,
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    send: () => {},
    on: () => {},
    once: () => {},
  }
  return contents
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join(tmpdir(), `hwp-test-${name}`),
    getLocale: () => 'en-US',
  },
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 1 })),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  shell: { openExternal: vi.fn(async () => {}), showItemInFolder: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  net: {},
  ipcRenderer: {},
  webUtils: {},
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  WebContentsView: class {
    webContents = fakeContents()
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: vi.fn(),
  },
}))

vi.mock('@genoffice/file-parse', () => ({
  hwpToText: vi.fn(async () => ''),
  parseFileToText: vi.fn(async () => ({ kind: 'text', text: '' })),
  ATTACHABLE_EXTS: new Set<string>(),
  ATTACHABLE_IMAGE_EXTS: new Set<string>(),
  ATTACHABLE_MAX_BYTES: 25 * 1024 * 1024,
  ATTACHABLE_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
}))

import { createHwpView, setHwpxSaveDefault } from '../src/main/hwp-main'
import { HWP_CHANNELS } from '../src/shared/ipc'
import type { BeginSaveResult } from '../src/shared/ipc'

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

const OLE = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x21])
const HWPX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x21])

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-hwp-default-hwpx-'))
  setHwpxSaveDefault(true)
  showSaveDialog.mockClear()
})
afterEach(() => {
  setHwpxSaveDefault(false)
  rmSync(dir, { recursive: true, force: true })
})

async function begin(path: string, mode: 'save' | 'saveAs' = 'save'): Promise<BeginSaveResult> {
  const contents = createHwpView(path).webContents as unknown as FakeContents
  await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, path)
  return call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, mode)
}

describe('HWPX as the default save format', () => {
  it('saves an opened .hwp as .hwpx beside it without a dialog', async () => {
    const path = join(dir, 'report.hwp')
    writeFileSync(path, OLE)
    expect(await begin(path)).toEqual({ ok: true, path: join(dir, 'report.hwpx'), format: 'hwpx' })
    expect(showSaveDialog).not.toHaveBeenCalled()
  })

  it('asks instead of replacing a .hwpx that is already there', async () => {
    const path = join(dir, 'report.hwp')
    writeFileSync(path, OLE)
    writeFileSync(join(dir, 'report.hwpx'), HWPX)
    expect(await begin(path)).toEqual({ ok: true, canceled: true })
    const options = showSaveDialog.mock.calls[0]!.at(-1) as {
      defaultPath: string
      filters: Array<{ extensions: string[] }>
    }
    expect(basename(options.defaultPath)).toBe('report.hwpx')
    expect(options.filters.map((f) => f.extensions[0])).toEqual(['hwpx', 'hwp'])
  })

  it('saves an opened .hwpx in place', async () => {
    const path = join(dir, 'plan.hwpx')
    writeFileSync(path, HWPX)
    expect(await begin(path)).toEqual({ ok: true, path, format: 'hwpx' })
  })

  it('offers HWPX first in Save As and adds .hwpx to a bare name', async () => {
    const path = join(dir, 'report.hwp')
    writeFileSync(path, OLE)
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(dir, 'final') })
    expect(await begin(path, 'saveAs')).toEqual({ ok: true, path: join(dir, 'final.hwpx'), format: 'hwpx' })
    const options = showSaveDialog.mock.calls[0]!.at(-1) as { filters: Array<{ extensions: string[] }> }
    expect(options.filters[0]!.extensions[0]).toBe('hwpx')
  })

  it('still writes .hwp when the user picks that name', async () => {
    const path = join(dir, 'report.hwpx')
    writeFileSync(path, HWPX)
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(dir, 'legacy.hwp') })
    expect(await begin(path, 'saveAs')).toEqual({ ok: true, path: join(dir, 'legacy.hwp'), format: 'hwp' })
  })
})

