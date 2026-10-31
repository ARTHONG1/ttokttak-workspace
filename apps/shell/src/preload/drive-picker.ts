import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { DriveListResult } from '../shared/drive-api'
import {
  DRIVE_PICKER_CHANNELS,
  type DrivePickerApi,
  type DrivePickerChooseResult,
  type DrivePickerInit,
  type DrivePickerTheme,
} from '../shared/drive-picker-api'

function themeOf(value: unknown): DrivePickerTheme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// The "Attach from Drive" window's narrow API: list Drive, send the ticked
// ids, cancel. Paths and tokens never reach this page.
const api: DrivePickerApi = {
  async getInit() {
    const init = (await ipcRenderer.invoke(DRIVE_PICKER_CHANNELS.getInit)) as DrivePickerInit | null
    return { lang: init?.lang ?? 'en', theme: themeOf(init?.theme) }
  },
  onThemeChanged(handler) {
    const listener = (_event: IpcRendererEvent, theme: unknown) => handler(themeOf(theme))
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  list: (listing, pageToken) =>
    ipcRenderer.invoke(DRIVE_PICKER_CHANNELS.list, listing, pageToken) as Promise<DriveListResult>,
  choose: (picks) =>
    ipcRenderer.invoke(DRIVE_PICKER_CHANNELS.choose, picks) as Promise<DrivePickerChooseResult>,
  async cancel() {
    await ipcRenderer.invoke(DRIVE_PICKER_CHANNELS.cancel)
  },
}
contextBridge.exposeInMainWorld('aiOfficeDrivePicker', api)
