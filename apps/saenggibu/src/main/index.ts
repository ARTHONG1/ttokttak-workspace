/**
 * 똑딱생기부's main process: one window with the 생기부 page, the built-in 똑딱AI started
 * with the app, the roster/texts file picker and 나이스로 보내기 in the app's own browser.
 * It shares no code or settings with 똑딱작업실: its own name, app id and user-data folder.
 */
import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { CHANNELS, type AskRequest } from '../shared/api'
import { LocalAi } from './local-ai'
import { createNeisDriver, neisRequest, type PlaywrightNeisDriver } from './neis-driver'
import { TABLE_EXTENSIONS, readTableFile } from './table-file'

app.setName('똑딱생기부')
// a test run keeps its settings and saved work in a scratch folder
if (process.env.SAENGGIBU_USER_DATA) app.setPath('userData', process.env.SAENGGIBU_USER_DATA)

let win: BrowserWindow | null = null
let neis: PlaywrightNeisDriver | undefined
const ai = new LocalAi(process.resourcesPath)

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
    // the AI loads while the teacher fills in the page: the first answer is then quick
    void ai.ensure().catch(() => undefined)
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
