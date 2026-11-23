/**
 * 똑딱AI's model files on an installed app: the download (local-ai-model-store.ts) wired to
 * Electron and to the settings page. Only a desktop install with the server in it takes part
 * (not the web version, not an Intel Mac build without the server, not a developer run with
 * GENOFFICE_LOCAL_AI_MODEL). The files are downloaded when the built-in AI is the selected one:
 * on a new installation (it is preselected) or once someone picks it.
 */
import { statSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  dialog,
  ipcMain,
  powerMonitor,
  powerSaveBlocker,
  session,
  shell,
  webContents,
  type Session,
} from 'electron'
import {
  LOCAL_AI_MODEL_FILES,
  LOCAL_AI_MODEL_PAGE,
  LOCAL_AI_MODELS_DIR,
  SCHOOL_RECORD_V10,
} from './local-ai-model-files'
import { LocalAiModels, type LocalAiModelState } from './local-ai-model-store'
import { localAiExecutable, useLocalAiModels } from './local-ai-runtime'

export const LOCAL_AI_MODEL_CHANNELS = {
  state: 'ai:local-models',
  changed: 'ai:local-models-changed',
  download: 'ai:local-models-download',
  importFiles: 'ai:local-models-import',
  openPage: 'ai:local-models-open-page',
} as const

/** what the settings page shows: the state, and how much there is to download in all */
export type LocalAiModelsInfo = LocalAiModelState & { totalBytes: number; schoolRecordVersion?: string }

let models: LocalAiModels | null = null
let modelFiles = LOCAL_AI_MODEL_FILES

/** V10-94 is verified and loads with the server: V10.1's observation writing can use it */
export function usesLocalSchoolRecordV10(): boolean {
  return models?.pathsFor('main')?.adapters.some((a) => a.name === SCHOOL_RECORD_V10.id) ?? false
}

function info(): LocalAiModelsInfo | null {
  if (!models) return null
  return {
    ...models.current(),
    totalBytes: modelFiles.reduce((n, f) => n + f.bytes, 0),
    ...(usesLocalSchoolRecordV10() ? { schoolRecordVersion: '똑딱AI 생기부 V10.1' } : {}),
  }
}

/** the download's own connections: no disk cache, and an ASCII User-Agent */
function downloadSession(): Session {
  const ses = session.fromPartition('local-ai-models', { cache: false })
  // HTTP headers carry ASCII only: GitHub's file storage refuses a User-Agent with other
  // bytes (HTTP 400), as 똑딱생기부 found with its Korean name
  ses.setUserAgent(app.userAgentFallback.replace(/[^\x20-\x7e]/g, ''))
  return ses
}

/**
 * Set up the model files at launch (before the AI settings are first read: a new installation
 * preselects the built-in AI only where it can run). wantsLocal: the built-in AI is selected.
 */
export function registerLocalAiModels(wantsLocal: () => boolean): void {
  ipcMain.handle(LOCAL_AI_MODEL_CHANNELS.state, () => info())
  ipcMain.handle(LOCAL_AI_MODEL_CHANNELS.download, () => {
    void models?.prepare()
  })
  ipcMain.handle(LOCAL_AI_MODEL_CHANNELS.openPage, () => shell.openExternal(LOCAL_AI_MODEL_PAGE))
  ipcMain.handle(LOCAL_AI_MODEL_CHANNELS.importFiles, async () => {
    if (!models) return { ok: false, error: '이 설치판에는 똑딱AI가 없어요.' }
    const picked = await dialog.showOpenDialog({
      title: '똑딱AI 모델 파일 넣기',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '똑딱AI 모델 (.gguf)', extensions: ['gguf'] }],
    })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, canceled: true }
    try {
      await models.importFiles(picked.filePaths)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  if (!localAiExecutable() || process.env.GENOFFICE_LOCAL_AI_MODEL) return
  const dir = join(app.getPath('userData'), LOCAL_AI_MODELS_DIR)
  const candidate = statSync(join(dir, SCHOOL_RECORD_V10.file), { throwIfNoEntry: false })
  if (candidate?.isFile() && candidate.size === SCHOOL_RECORD_V10.bytes)
    modelFiles = [...LOCAL_AI_MODEL_FILES, SCHOOL_RECORD_V10]
  models = new LocalAiModels(
    dir,
    (url, init) => url
      ? downloadSession().fetch(url, { ...init, cache: 'no-store' })
      : Promise.reject(new Error('똑딱AI 생기부 V10 파일을 다시 넣어 주세요.')),
    { files: modelFiles, reconnect: () => downloadSession().closeAllConnections() },
  )
  useLocalAiModels(models)
  // while the files download, the computer does not fall asleep by itself (as a browser
  // download keeps it awake); a closed lid still sleeps, and the download goes on after
  let awake: number | null = null
  models.onState((state) => {
    const busy = state.state === 'downloading' || state.state === 'verifying'
    if (busy && awake === null) awake = powerSaveBlocker.start('prevent-app-suspension')
    if (!busy && awake !== null) {
      powerSaveBlocker.stop(awake)
      awake = null
    }
    const sent = info()
    for (const wc of webContents.getAllWebContents())
      if (!wc.isDestroyed()) wc.send(LOCAL_AI_MODEL_CHANNELS.changed, sent)
  })
  powerMonitor.on('resume', () => models?.resumeDropped())
  powerMonitor.on('unlock-screen', () => models?.resumeDropped())
  // the files already here are checked at once (the server finds them); the missing ones
  // are downloaded only for someone who uses the built-in AI
  void models.check().then((ready) => {
    if (!ready && wantsLocal()) void models?.prepare()
  })
}

/** the AI settings changed: picking the built-in AI starts its download */
export function localAiSelectionChanged(selected: boolean): void {
  if (!selected || !models) return
  const { state } = models.current()
  if (state === 'idle' || (state === 'failed' && !models.busy())) void models.prepare()
}
