/**
 * The "Attach from Drive" window (decision 0033): an editor's AI panel asks
 * the shell for Drive attachments, the shell opens this window, the person
 * ticks files and folders, and the shell downloads them to a temporary folder
 * and hands the paths back to the editor, which attaches them like files from
 * this PC. The window itself only sees file lists and ids.
 */
import type { Lang } from '@genoffice/i18n'
import type { DriveErrorKind, DriveListResult, DriveListingRequest } from './drive-api'

export const DRIVE_PICKER_CHANNELS = {
  getInit: 'drive-picker:get-init',
  list: 'drive-picker:list',
  choose: 'drive-picker:choose',
  cancel: 'drive-picker:cancel',
} as const

export type DrivePickerTheme = 'light' | 'dark' | 'system'

export interface DrivePickerInit {
  lang: Lang
  theme: DrivePickerTheme
}

/** One ticked entry: a file, or a folder whose files are attached */
export interface DrivePick {
  id: string
  folder: boolean
}

export type DrivePickerChooseResult = { ok: true } | { ok: false; kind: DriveErrorKind }

/** The picker window's window.aiOfficeDrivePicker */
export interface DrivePickerApi {
  getInit(): Promise<DrivePickerInit>
  onThemeChanged(handler: (theme: DrivePickerTheme) => void): () => void
  list(listing: DriveListingRequest, pageToken?: string): Promise<DriveListResult>
  choose(picks: DrivePick[]): Promise<DrivePickerChooseResult>
  cancel(): Promise<void>
}

/**
 * What the editor gets back. skipped: files left out (a format no editor
 * reads, or past the limit); failed: files Drive did not hand over.
 */
export type DriveAttachResult =
  | { ok: true; paths: string[]; skipped: number; failed: number }
  | { ok: false; reason: 'cancelled' | 'busy' | 'not-connected' }
