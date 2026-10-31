/**
 * Google Drive in the shell's main process (decision 0033): one connection,
 * the local copies of opened Drive files, and the AI's read-only access. The
 * screens get state and file lists; tokens never leave this process.
 */
import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, net, safeStorage, shell, webContents } from 'electron'
import type { Lang } from '@genoffice/i18n'
import { safeExternalUrl } from '@genoffice/electron-utils'
import {
  DriveConnection,
  FOLDER_MIME,
  openPlan,
  isGoogleNative,
  type DriveConnectionState,
  type DriveFile,
  type FetchLike,
  type GoogleClient,
} from '@genoffice/google-drive'
import { readAppSettings, writeAppSetting } from '../app-settings'
import {
  DRIVE_AI_ACCESS_KEY,
  DRIVE_CHANNELS,
  type DriveConnectResult,
  type DriveEntry,
  type DriveListResult,
  type DriveListingRequest,
  type DriveOpenResult,
  type DriveUiState,
} from '../../shared/drive-api'
import { DriveAi, entryType, type ParseToText } from './drive-ai'
import { DriveFiles, type SyncAnswer, type SyncNotice, type SyncQuestion } from './drive-files'
import { copyFileName, driveText } from './drive-strings'
import { createDriveVault } from './drive-vault'
import { createDrivePicker } from './drive-picker-window'
import type { DriveAttachResult, DrivePickerTheme } from '../../shared/drive-picker-api'

declare const __GENOFFICE_GOOGLE_CLIENT_ID__: string
declare const __GENOFFICE_GOOGLE_CLIENT_SECRET__: string

/** The Google client this build was made with; null when the build has none (decision 0033) */
export function buildGoogleClient(): GoogleClient | null {
  const clientId =
    typeof __GENOFFICE_GOOGLE_CLIENT_ID__ === 'string' ? __GENOFFICE_GOOGLE_CLIENT_ID__ : ''
  const clientSecret =
    typeof __GENOFFICE_GOOGLE_CLIENT_SECRET__ === 'string' ? __GENOFFICE_GOOGLE_CLIENT_SECRET__ : ''
  return /^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) && clientSecret
    ? { clientId, clientSecret }
    : null
}

export interface DriveIpcDeps {
  userData: () => string
  settingsPath: () => string
  lang: () => Lang
  /** the window dialogs attach to */
  window: () => BrowserWindow | null
  openPath: (path: string) => boolean
  isOpen: (path: string) => boolean
  parse: ParseToText
  theme: () => DrivePickerTheme
}

export interface DriveService {
  /** a local path is a copy of a Drive file: reopen through Drive so a stale copy is refreshed */
  reopen(path: string): Promise<boolean> | null
  stop(): void
}

const SEARCH_LIMIT_MAX = 20

function aiAccess(settingsPath: string): boolean {
  return readAppSettings(settingsPath)[DRIVE_AI_ACCESS_KEY] !== false
}

export function registerDriveIpc(deps: DriveIpcDeps): DriveService {
  const fetch: FetchLike = (url, init) => net.fetch(url, init)
  const connection = new DriveConnection({
    client: buildGoogleClient(),
    vault: createDriveVault(join(deps.userData(), 'google-drive.json'), {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (text) => safeStorage.encryptString(text),
      decrypt: (bytes) => safeStorage.decryptString(bytes),
    }),
    fetch,
  })
  let connecting = false
  const t = (key: Parameters<typeof driveText>[1], params?: Record<string, string>) =>
    driveText(deps.lang(), key, params)

  const uiState = (): DriveUiState => {
    const state: DriveConnectionState = connection.state()
    const ai = aiAccess(deps.settingsPath())
    if (state.state === 'unavailable') return { state: 'unavailable' }
    if (connecting) return { state: 'connecting', aiAccess: ai }
    if (state.state === 'disconnected') {
      return { state: 'disconnected', expired: state.expired === true, aiAccess: ai }
    }
    return {
      state: 'connected',
      name: state.account?.displayName ?? '',
      email: state.account?.emailAddress ?? '',
      persisted: state.persisted,
      aiAccess: ai,
    }
  }

  const broadcast = () => {
    const state = uiState()
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) wc.send(DRIVE_CHANNELS.stateChanged, state)
    }
  }

  const ask = async (question: SyncQuestion): Promise<SyncAnswer> => {
    const message =
      question.kind === 'changed'
        ? t('askChanged', { name: question.name })
        : question.kind === 'read-only'
          ? t('askReadOnly', { name: question.name })
          : t('askGone', { name: question.name })
    const answers: SyncAnswer[] =
      question.kind === 'changed' ? ['overwrite', 'copy', 'local'] : ['copy', 'local']
    const labels = answers.map((a) =>
      a === 'overwrite' ? t('btnOverwrite') : a === 'copy' ? t('btnCopy') : t('btnLocal'),
    )
    const options = {
      type: 'warning' as const,
      title: t('dialogTitle'),
      message,
      detail: t('askDetail'),
      buttons: labels,
      defaultId: answers.indexOf('copy'),
      cancelId: answers.indexOf('local'),
      noLink: true,
    }
    const win = deps.window()
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    return answers[response] ?? 'local'
  }

  const notify = (notice: SyncNotice) => {
    const message =
      notice.kind === 'saved-office-copy'
        ? t('noticeOfficeCopy', { name: notice.name, copyName: notice.copyName })
        : notice.kind === 'saved-copy'
          ? t('noticeCopy', { copyName: notice.copyName })
          : t('noticeUploadFailed', { name: notice.name })
    const options = {
      type: notice.kind === 'upload-failed' ? ('warning' as const) : ('info' as const),
      title: t('dialogTitle'),
      message,
      buttons: [t('ok')],
      noLink: true,
    }
    const win = deps.window()
    void (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
  }

  const files = new DriveFiles({
    api: () => connection.api,
    connected: () => connection.connected(),
    cacheDir: join(deps.userData(), 'drive-cache'),
    openPath: deps.openPath,
    isOpen: deps.isOpen,
    ask,
    notify,
    copyName: (name) => copyFileName(name, t('copySuffix')),
  })
  const ai = new DriveAi({ api: () => connection.api, parse: deps.parse })

  let wasConnected = false
  connection.onChange(() => {
    const now = connection.connected()
    if (now && !wasConnected) files.reconnected()
    if (!now) ai.clear()
    wasConnected = now
    broadcast()
  })
  void connection.load().then(() => {
    if (connection.state().state !== 'unavailable') void files.start()
  })

  const toEntry = (file: DriveFile): DriveEntry => {
    const target = file.shortcutTarget
    const shown = target ? { name: file.name, mimeType: target.mimeType } : file
    const entry: DriveEntry = {
      id: target?.id ?? file.id,
      name: file.name,
      type: entryType(shown),
      modifiedTime: file.modifiedTime,
      openable: shown.mimeType !== FOLDER_MIME && openPlan(shown).kind !== 'none',
      canEdit: file.canEdit,
      google: isGoogleNative(shown.mimeType) && shown.mimeType !== FOLDER_MIME,
    }
    if (file.size !== undefined) entry.size = file.size
    return entry
  }

  const listingOf = (raw: unknown): DriveListingRequest | null => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    if (
      r.kind === 'folder' &&
      typeof r.folderId === 'string' &&
      /^[\w-]{1,200}$/.test(r.folderId)
    ) {
      return { kind: 'folder', folderId: r.folderId }
    }
    if (r.kind === 'shared' || r.kind === 'recent') return { kind: r.kind }
    if (r.kind === 'search' && typeof r.text === 'string' && r.text.trim()) {
      return { kind: 'search', text: r.text.trim().slice(0, 200) }
    }
    return null
  }

  ipcMain.handle(DRIVE_CHANNELS.state, (): DriveUiState => uiState())

  ipcMain.handle(DRIVE_CHANNELS.connect, async (): Promise<DriveConnectResult> => {
    connecting = true
    broadcast()
    try {
      const lang = deps.lang()
      const result = await connection.connect({
        openBrowser: async (url) => {
          const target = safeExternalUrl(url)
          if (!target || !target.startsWith('https://accounts.google.com/')) return false
          try {
            await shell.openExternal(target)
            return true
          } catch {
            return false
          }
        },
        pages: {
          done: { lang, title: t('pageDoneTitle'), body: t('pageDoneBody') },
          failed: { lang, title: t('pageFailedTitle'), body: t('pageFailedBody') },
        },
      })
      if (result.ok) return { ok: true }
      return { ok: false, reason: result.reason === 'unavailable' ? 'network' : result.reason }
    } finally {
      connecting = false
      broadcast()
    }
  })

  ipcMain.handle(DRIVE_CHANNELS.cancelConnect, () => connection.cancelConnect())

  ipcMain.handle(DRIVE_CHANNELS.disconnect, async () => {
    await connection.disconnect()
    broadcast()
  })

  ipcMain.handle(DRIVE_CHANNELS.setAiAccess, (_event, on: unknown): DriveUiState => {
    writeAppSetting(deps.settingsPath(), DRIVE_AI_ACCESS_KEY, on === true)
    broadcast()
    return uiState()
  })

  const listEntries = async (raw: unknown, pageToken: unknown): Promise<DriveListResult> => {
    const listing = listingOf(raw)
    if (!listing) return { ok: false, kind: 'not-found' }
    const result = await connection.api.list(listing, {
      pageToken: typeof pageToken === 'string' && pageToken.length < 2000 ? pageToken : undefined,
    })
    if (!result.ok) return result
    const entries = result.files.map(toEntry)
    return result.nextPageToken
      ? { ok: true, files: entries, nextPageToken: result.nextPageToken }
      : { ok: true, files: entries }
  }

  ipcMain.handle(DRIVE_CHANNELS.list, (_event, raw: unknown, pageToken: unknown) =>
    listEntries(raw, pageToken),
  )

  // ---- attaching Drive files to an editor's AI panel (a person picks them) ----

  const picker = createDrivePicker({
    api: () => connection.api,
    connected: () => connection.connected(),
    lang: deps.lang,
    theme: deps.theme,
    list: listEntries,
    attachDir: () => join(app.getPath('temp'), 'ieumoffice-drive-attach'),
  })

  ipcMain.handle(DRIVE_CHANNELS.connected, (): boolean => connection.connected())

  ipcMain.handle(DRIVE_CHANNELS.pickAttachments, (event): Promise<DriveAttachResult> => {
    if (!connection.connected()) return Promise.resolve({ ok: false, reason: 'not-connected' })
    const parent = BrowserWindow.fromWebContents(event.sender) ?? deps.window()
    return picker.open(parent)
  })

  ipcMain.handle(DRIVE_CHANNELS.open, async (_event, fileId: unknown): Promise<DriveOpenResult> => {
    if (typeof fileId !== 'string' || !/^[\w-]{1,200}$/.test(fileId)) {
      return { ok: false, kind: 'not-found' }
    }
    return files.open(fileId)
  })

  // ---- the editors' AI (screen requests only; the CLI and MCP have no Drive) ----

  const aiEnabled = () => connection.connected() && aiAccess(deps.settingsPath())

  ipcMain.handle(DRIVE_CHANNELS.aiEnabled, (): boolean => aiEnabled())

  ipcMain.handle(DRIVE_CHANNELS.aiSearch, async (_event, raw: unknown) => {
    if (!aiEnabled()) return { ok: false, error: 'Google Drive is not available now.' }
    const r = (raw && typeof raw === 'object' ? raw : {}) as { q?: unknown; limit?: unknown }
    const limit = Math.min(Math.max(1, Math.floor(Number(r.limit) || 10)), SEARCH_LIMIT_MAX)
    return ai.search(typeof r.q === 'string' ? r.q : '', limit)
  })

  ipcMain.handle(DRIVE_CHANNELS.aiRead, async (_event, raw: unknown) => {
    if (!aiEnabled()) return { ok: false, error: 'Google Drive is not available now.' }
    const r = (raw && typeof raw === 'object' ? raw : {}) as { id?: unknown; offset?: unknown }
    const id = typeof r.id === 'string' ? r.id : ''
    if (!/^[\w-]{1,200}$/.test(id)) return { ok: false, error: 'not a Drive file id' }
    return ai.read(id, Number(r.offset) || 0)
  })

  return {
    reopen(path) {
      const entry = files.entryFor(path)
      if (!entry) return null
      return files.open(entry.sourceId).then((r) => r.ok || deps.openPath(path))
    },
    stop() {
      picker.close()
      files.stop()
      connection.cancelConnect()
    },
  }
}
