/**
 * The "Attach from Drive" window (decision 0033). One at a time, above the
 * window of the editor that asked. The page lists Drive and ticks entries; it
 * never sees a path. On "Attach" this process downloads what was ticked and
 * hands the paths to the editor that asked; closing the window cancels.
 */
import { join } from 'node:path'
import { BrowserWindow, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { productName, type Lang } from '@genoffice/i18n'
import { safeExternalUrl } from '@genoffice/electron-utils'
import type { DriveApi } from '@genoffice/google-drive'
import type { DriveListResult } from '../../shared/drive-api'
import {
  DRIVE_PICKER_CHANNELS,
  type DriveAttachResult,
  type DrivePick,
  type DrivePickerChooseResult,
  type DrivePickerInit,
  type DrivePickerTheme,
} from '../../shared/drive-picker-api'
import { driveUiText } from '../../renderer/src/i18n/strings-drive'
import { downloadPicks } from './drive-attach'

export interface DrivePickerDeps {
  api: () => DriveApi
  connected: () => boolean
  lang: () => Lang
  theme: () => DrivePickerTheme
  /** the same listing the home screen gets */
  list: (raw: unknown, pageToken: unknown) => Promise<DriveListResult>
  /** where downloads for attachments go */
  attachDir: () => string
}

const MAX_PICKS = 100

function picksOf(raw: unknown): DrivePick[] {
  if (!Array.isArray(raw)) return []
  const out: DrivePick[] = []
  for (const item of raw.slice(0, MAX_PICKS)) {
    const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    if (typeof p.id === 'string' && /^[\w-]{1,200}$/.test(p.id)) {
      out.push({ id: p.id, folder: p.folder === true })
    }
  }
  return out
}

export function createDrivePicker(deps: DrivePickerDeps) {
  let win: BrowserWindow | null = null
  let settle: ((result: DriveAttachResult) => void) | null = null
  let working = false

  const fromWindow = (event: IpcMainInvokeEvent) =>
    !!win && !win.isDestroyed() && event.sender === win.webContents

  const finish = (result: DriveAttachResult) => {
    const done = settle
    settle = null
    done?.(result)
    if (win && !win.isDestroyed()) win.close()
  }

  ipcMain.handle(DRIVE_PICKER_CHANNELS.getInit, (event): DrivePickerInit | null =>
    fromWindow(event) ? { lang: deps.lang(), theme: deps.theme() } : null,
  )
  ipcMain.handle(DRIVE_PICKER_CHANNELS.list, (event, raw: unknown, pageToken: unknown) =>
    fromWindow(event)
      ? deps.list(raw, pageToken)
      : Promise.resolve<DriveListResult>({ ok: false, kind: 'not-found' }),
  )
  ipcMain.handle(
    DRIVE_PICKER_CHANNELS.choose,
    async (event, raw: unknown): Promise<DrivePickerChooseResult> => {
      if (!fromWindow(event) || working) return { ok: false, kind: 'network' }
      const picks = picksOf(raw)
      if (picks.length === 0) {
        finish({ ok: false, reason: 'cancelled' })
        return { ok: true }
      }
      if (!deps.connected()) return { ok: false, kind: 'not-connected' }
      working = true
      try {
        const got = await downloadPicks(deps.api(), picks, deps.attachDir())
        finish({ ok: true, ...got })
        return { ok: true }
      } finally {
        working = false
      }
    },
  )
  ipcMain.handle(DRIVE_PICKER_CHANNELS.cancel, (event) => {
    if (fromWindow(event) && !working) finish({ ok: false, reason: 'cancelled' })
  })

  /** Ask the person for Drive files; resolves when they attach or close the window */
  function open(parent: BrowserWindow | null): Promise<DriveAttachResult> {
    if (win && !win.isDestroyed()) {
      win.focus()
      return Promise.resolve({ ok: false, reason: 'busy' })
    }
    const lang = deps.lang()
    const next = new BrowserWindow({
      width: 720,
      height: 640,
      minWidth: 480,
      minHeight: 420,
      ...(parent && !parent.isDestroyed() ? { parent, modal: true } : {}),
      show: false,
      center: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      title: `${driveUiText(lang, 'drivePickTitle')} - ${productName(lang)}`,
      webPreferences: {
        preload: join(__dirname, '../preload/drive-picker.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    win = next
    next.removeMenu()
    next.webContents.setWindowOpenHandler(({ url }) => {
      const target = safeExternalUrl(url)
      if (target) void shell.openExternal(target)
      return { action: 'deny' }
    })
    const result = new Promise<DriveAttachResult>((resolve) => (settle = resolve))
    next.once('ready-to-show', () => next.show())
    next.on('closed', () => {
      if (win === next) win = null
      // closing the window is cancelling, unless a result already went out
      const done = settle
      settle = null
      done?.({ ok: false, reason: 'cancelled' })
    })
    if (process.env.ELECTRON_RENDERER_URL) {
      void next.loadURL(`${process.env.ELECTRON_RENDERER_URL}/drive-picker.html`)
    } else {
      void next.loadFile(join(__dirname, '../renderer/drive-picker.html'))
    }
    return result
  }

  return { open, close: () => win?.close() }
}
