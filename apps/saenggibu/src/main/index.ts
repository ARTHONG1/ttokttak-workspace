/**
 * 똑딱생기부's main process: one window with the 생기부 page, the built-in 똑딱AI started
 * with the app, the roster/texts file picker and 나이스로 보내기 in the app's own browser.
 * It shares no code or settings with 똑딱작업실: its own name, app id and user-data folder.
 */
import { join } from 'node:path'
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  powerMonitor,
  powerSaveBlocker,
  session,
  shell,
} from 'electron'
import { CHANNELS, type AskRequest } from '../shared/api'
import { MODEL_BYTES, MODEL_FILES, MODEL_NAME, MODEL_PAGE, type ModelSpec } from '../shared/model'
import { LocalAi, type ModelSource } from './local-ai'
import { ModelStore } from './model-store'
import { createNeisDriver, neisRequest, type PlaywrightNeisDriver } from './neis-driver'
import { TABLE_EXTENSIONS, readTableFile } from './table-file'

app.setName('똑딱생기부')
// HTTP headers carry ASCII only. Electron writes the app's name into its User-Agent, and
// GitHub's file storage (Azure) refuses a request whose User-Agent has the Korean name with
// HTTP 400 "The request is badly formed": every part of the model not already in GitHub's
// cache failed to download (2026-11-20). The English name stands in for it.
app.userAgentFallback = app.userAgentFallback
  .replace(/[^\x20-\x7e]+\/(\S*)/g, 'TtokttakSaenggibu/$1')
  .replace(/[^\x20-\x7e]/g, '')
// a test run keeps its settings and saved work in a scratch folder
if (process.env.SAENGGIBU_USER_DATA) app.setPath('userData', process.env.SAENGGIBU_USER_DATA)

let win: BrowserWindow | null = null
let neis: PlaywrightNeisDriver | undefined
/** the page holds students' work not kept with [임시 저장]; closing asks first */
let unsaved = false
/** the teacher answered the question: this close goes through */
let closing = false
/** the question is on screen: another close (a second Cmd+Q) does not ask again */
let asking = false

/**
 * The model: the base and the 생기부 adapter, downloaded into userData/ai. A development run
 * may point at the files (SAENGGIBU_MODEL_FILE, with SAENGGIBU_ADAPTER_FILE) or, for the
 * download tests, at one other file to download instead of both (SAENGGIBU_MODEL_URL, _BYTES,
 * _SHA256, and _IDLE_MS for a short stall limit); an installed app ignores all of them.
 */
function modelSource(): ModelSource {
  const env = process.env
  if (!app.isPackaged && env.SAENGGIBU_MODEL_FILE)
    return { file: env.SAENGGIBU_MODEL_FILE, adapter: env.SAENGGIBU_ADAPTER_FILE || undefined }
  const specs: readonly ModelSpec[] =
    !app.isPackaged && env.SAENGGIBU_MODEL_URL
      ? [
          {
            file: MODEL_FILES[0].file,
            url: env.SAENGGIBU_MODEL_URL,
            bytes: Number(env.SAENGGIBU_MODEL_BYTES),
            sha256: env.SAENGGIBU_MODEL_SHA256 ?? '',
          },
        ]
      : MODEL_FILES
  const idleMs = !app.isPackaged ? Number(env.SAENGGIBU_MODEL_IDLE_MS) || undefined : undefined
  // the download's own connections (with the system's proxy settings, as Chromium has them),
  // kept apart from the page and without a disk cache: the 2 GB answer goes to the model only
  const downloads = () => {
    const ses = session.fromPartition('model-download', { cache: false })
    ses.setUserAgent(app.userAgentFallback)
    return ses
  }
  const stores = specs.map(
    (spec) =>
      new ModelStore(
        join(app.getPath('userData'), 'ai'),
        spec,
        (url, init) => downloads().fetch(url, { ...init, cache: 'no-store' }),
        { idleMs, reconnect: () => downloads().closeAllConnections() },
      ),
  )
  return { stores }
}
const ai = new LocalAi(process.resourcesPath, modelSource())

function createWindow(): void {
  unsaved = false
  closing = false
  win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    title: '똑딱생기부',
    show: false,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win?.show())
  // students' names, notes and texts live in the page until [임시 저장]: a close (the
  // window's button, Cmd+Q, Alt+F4) asks before they go, as a document editor does
  win.on('close', (event) => {
    if (!unsaved || closing || !win) return
    event.preventDefault()
    if (asking) return
    asking = true
    const owner = win
    void dialog
      .showMessageBox(owner, {
        type: 'warning',
        buttons: ['임시 저장하고 닫기', '저장하지 않고 닫기', '취소'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        message: '저장하지 않은 학생 글이 있어요.',
        detail:
          '닫으면 지금 입력한 학생 이름, 관찰 기록, AI가 쓴 글이 사라져요. 임시 저장하면 다음에 [불러오기]로 다시 열 수 있어요.',
      })
      .then(({ response }) => {
        asking = false
        if (owner.isDestroyed()) return
        if (response === 0) owner.webContents.send(CHANNELS.saveBeforeClose)
        else if (response === 1) {
          closing = true
          owner.close()
        }
      })
  })
  win.on('closed', () => {
    win = null
  })
  // links open in the system browser; the page itself never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  ai.onState((state) => win?.webContents.send(CHANNELS.aiStateChanged, state))
  // while the model downloads, the computer does not fall asleep by itself (as a browser
  // download keeps it awake); a closed lid still sleeps, and the download goes on after
  let awake: number | null = null
  ai.onState((state) => {
    const busy = state.state === 'downloading' || state.state === 'verifying'
    if (busy && awake === null) awake = powerSaveBlocker.start('prevent-app-suspension')
    if (!busy && awake !== null) {
      powerSaveBlocker.stop(awake)
      awake = null
    }
  })
  powerMonitor.on('resume', () => ai.resumeDropped())
  powerMonitor.on('unlock-screen', () => ai.resumeDropped())
  ipcMain.handle(CHANNELS.aiState, () => ai.current())
  ipcMain.handle(CHANNELS.modelInfo, () => ({
    name: MODEL_NAME,
    bytes: MODEL_BYTES,
    page: MODEL_PAGE,
  }))
  ipcMain.handle(CHANNELS.retryModel, () => {
    void ai.prepare()
  })
  ipcMain.handle(CHANNELS.importModel, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? win
    if (!owner) return null
    const picked = await dialog.showOpenDialog(owner, {
      title: '받아 둔 똑딱AI 파일 고르기 (기본 모델과 생기부 어댑터)',
      filters: [{ name: '똑딱AI 모델', extensions: ['gguf'] }],
      properties: ['openFile', 'multiSelections'],
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    try {
      await ai.importModel(picked.filePaths)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(CHANNELS.openModelPage, () => shell.openExternal(MODEL_PAGE))
  ipcMain.handle(CHANNELS.version, () => app.getVersion())
  ipcMain.handle(CHANNELS.ask, async (_event, raw: unknown) => {
    const r = (raw ?? {}) as Partial<AskRequest>
    if (
      typeof r.requestId !== 'string' ||
      typeof r.system !== 'string' ||
      typeof r.text !== 'string'
    )
      return { ok: false, error: '요청을 읽지 못했어요.' }
    const temperature =
      typeof r.temperature === 'number' && r.temperature >= 0 && r.temperature <= 1.5
        ? r.temperature
        : 0
    try {
      return { ok: true, text: await ai.ask(r.requestId, r.system, r.text, temperature) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.on(CHANNELS.unsaved, (_event, value: unknown) => {
    unsaved = value === true
  })
  ipcMain.handle(CHANNELS.closeNow, (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return
    closing = true
    owner.close()
  })
  ipcMain.handle(CHANNELS.cancel, (_event, id: unknown) => {
    if (typeof id === 'string') ai.cancel(id)
  })
  ipcMain.handle(CHANNELS.readTableFile, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? win
    if (!owner) return null
    const picked = await dialog.showOpenDialog(owner, {
      title: '명렬표나 글 파일 고르기',
      filters: [{ name: '엑셀·CSV', extensions: [...TABLE_EXTENSIONS] }],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    return readTableFile(picked.filePaths[0])
  })
  ipcMain.handle(CHANNELS.sendToNeis, async (_event, text: unknown) => {
    if (typeof text !== 'string')
      return { ok: false, route: 'direct', message: '보낼 내용을 읽지 못했어요.' }
    neis ??= createNeisDriver(app.getPath('userData'))
    return neisRequest(text, neis)
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  void app.whenReady().then(() => {
    registerIpc()
    createWindow()
    // the model is checked (or downloaded once) and loaded while the teacher fills in the
    // page: the first answer is then quick
    void ai.prepare()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    ai.stop()
    void neis?.close().catch(() => undefined)
  })
}
