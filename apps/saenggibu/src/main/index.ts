/**
 * 똑딱생기부's main process: one window with the 생기부 page, the built-in 똑딱AI started
 * with the app, the roster/texts file picker and 나이스로 보내기 in the app's own browser.
 * It shares no code or settings with 똑딱작업실: its own name, app id and user-data folder.
 */
import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, net, shell } from 'electron'
import { CHANNELS, type AskRequest } from '../shared/api'
import { MODEL, type ModelSpec } from '../shared/model'
import { LocalAi, type ModelSource } from './local-ai'
import { ModelStore } from './model-store'
import { createNeisDriver, neisRequest, type PlaywrightNeisDriver } from './neis-driver'
import { TABLE_EXTENSIONS, readTableFile } from './table-file'

app.setName('똑딱생기부')
// a test run keeps its settings and saved work in a scratch folder
if (process.env.SAENGGIBU_USER_DATA) app.setPath('userData', process.env.SAENGGIBU_USER_DATA)

let win: BrowserWindow | null = null
let neis: PlaywrightNeisDriver | undefined

/**
 * The model: downloaded into userData/ai. A development run may point at a model file
 * (SAENGGIBU_MODEL_FILE) or, for the download tests, at another file to download
 * (SAENGGIBU_MODEL_URL, _BYTES, _SHA256); an installed app ignores both.
 */
function modelSource(): ModelSource {
  const env = process.env
  if (!app.isPackaged && env.SAENGGIBU_MODEL_FILE) return { file: env.SAENGGIBU_MODEL_FILE }
  const spec: ModelSpec =
    !app.isPackaged && env.SAENGGIBU_MODEL_URL
      ? {
          ...MODEL,
          url: env.SAENGGIBU_MODEL_URL,
          bytes: Number(env.SAENGGIBU_MODEL_BYTES),
          sha256: env.SAENGGIBU_MODEL_SHA256 ?? '',
        }
      : MODEL
  const store = new ModelStore(join(app.getPath('userData'), 'ai'), spec, (url, init) =>
    net.fetch(url, init),
  )
  return { store }
}
const ai = new LocalAi(process.resourcesPath, modelSource())

function createWindow(): void {
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
  ipcMain.handle(CHANNELS.aiState, () => ai.current())
  ipcMain.handle(CHANNELS.modelInfo, () => ({
    name: MODEL.name,
    bytes: MODEL.bytes,
    page: MODEL.page,
  }))
  ipcMain.handle(CHANNELS.retryModel, () => {
    void ai.prepare()
  })
  ipcMain.handle(CHANNELS.importModel, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? win
    if (!owner) return null
    const picked = await dialog.showOpenDialog(owner, {
      title: '받아 둔 똑딱AI 모델 파일 고르기',
      filters: [{ name: '똑딱AI 모델', extensions: ['gguf'] }],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    try {
      await ai.importModel(picked.filePaths[0])
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(CHANNELS.openModelPage, () => shell.openExternal(MODEL.page))
  ipcMain.handle(CHANNELS.version, () => app.getVersion())
  ipcMain.handle(CHANNELS.ask, async (_event, raw: unknown) => {
    const r = (raw ?? {}) as Partial<AskRequest>
    if (
      typeof r.requestId !== 'string' ||
      typeof r.system !== 'string' ||
      typeof r.text !== 'string'
    )
      return { ok: false, error: '요청을 읽지 못했어요.' }
    try {
      return { ok: true, text: await ai.ask(r.requestId, r.system, r.text) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
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
