'use strict'
/**
 * A stand-in for the 'electron' module, so the desktop main process can run in plain
 * Node behind the web gateway. Windows, views and web contents are bookkeeping objects
 * that tell the browser what to show; dialogs, menus and links are asked of the browser.
 * Anything not modelled is a harmless no-op (see lenient()).
 */
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { fork } = require('node:child_process')
const { fileURLToPath } = require('node:url')
const zlib = require('node:zlib')

/** set by session-host: (msg) => void, and an async request(msg) => reply */
const link = { send: () => {}, request: async () => ({}) }
const missing = new Set()

/** the first app frames of the current stack, for logs that say who asked */
function callers() {
  return String(new Error().stack || '')
    .split('\n')
    .slice(2)
    .filter((l) => !l.includes('fake-electron.cjs') && !l.includes('node:'))
    .slice(0, 4)
    .map((l) => l.trim())
    .join(' | ')
}

function lenient(target, name) {
  return new Proxy(target, {
    get(t, prop, recv) {
      if (prop in t || typeof prop === 'symbol') return Reflect.get(t, prop, recv)
      if (prop === 'then' || prop === 'toJSON') return undefined
      const key = name + '.' + String(prop)
      if (!missing.has(key)) {
        missing.add(key)
        if (process.env.WEB_ELECTRON_DEBUG) console.warn('[fake-electron] missing', key)
      }
      return function noop() {
        return undefined
      }
    },
  })
}

// ---------------------------------------------------------------- app paths
const SESSION = process.env.WEB_SESSION_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'hs-'))
const HOME = path.join(SESSION, 'home')
const paths = {
  home: HOME,
  appData: path.join(HOME, '.config'),
  userData: path.join(HOME, '.config', 'HangulAIWorkbench'),
  sessionData: path.join(HOME, '.config', 'HangulAIWorkbench'),
  temp: path.join(SESSION, 'tmp'),
  documents: path.join(HOME, 'Documents'),
  downloads: path.join(HOME, 'Downloads'),
  desktop: path.join(HOME, 'Desktop'),
  music: path.join(HOME, 'Music'),
  pictures: path.join(HOME, 'Pictures'),
  videos: path.join(HOME, 'Videos'),
  logs: path.join(HOME, '.config', 'HangulAIWorkbench', 'logs'),
  crashDumps: path.join(SESSION, 'crash'),
  recent: path.join(HOME, '.recent'),
  exe: process.execPath,
  module: process.execPath,
}
for (const key of ['userData', 'temp', 'documents', 'downloads', 'desktop', 'logs']) {
  fs.mkdirSync(paths[key], { recursive: true })
}

// ---------------------------------------------------------------- ipcMain
class IpcMain extends EventEmitter {
  constructor() {
    super()
    this.handlers = new Map()
  }
  handle(channel, fn) {
    if (this.handlers.has(channel))
      throw new Error('Attempted to register a second handler for ' + "'" + channel + "'")
    this.handlers.set(channel, fn)
  }
  handleOnce(channel, fn) {
    this.handle(channel, async (...args) => {
      this.handlers.delete(channel)
      return fn(...args)
    })
  }
  removeHandler(channel) {
    this.handlers.delete(channel)
  }
}
const ipcMain = new IpcMain()
ipcMain.setMaxListeners(0)

// ---------------------------------------------------------------- web contents
const allContents = new Map()
let nextContentsId = 1
let focusedContents = null

function toWebUrl(url) {
  if (typeof url !== 'string') return url
  if (url.startsWith('file://')) return '/__file' + fileURLToPath(url)
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(url)
  if (m && registeredSchemes.has(m[1].toLowerCase()))
    return '/__proto/' + m[1].toLowerCase() + '/' + m[2]
  return url
}

class FakeSession extends EventEmitter {
  constructor() {
    super()
    this.webRequest = lenient(
      { onBeforeRequest() {}, onHeadersReceived() {}, onBeforeSendHeaders() {} },
      'webRequest',
    )
    this.availableSpellCheckerLanguages = ['en-US', 'ko']
  }
  get protocol() {
    return protocolApi
  }
  setPermissionRequestHandler() {}
  setPermissionCheckHandler() {}
  setDevicePermissionHandler() {}
  setDisplayMediaRequestHandler() {}
  setSpellCheckerLanguages(langs) {
    this.spell = langs
  }
  getSpellCheckerLanguages() {
    return this.spell ?? ['en-US']
  }
  setSpellCheckerEnabled() {}
  isSpellCheckerEnabled() {
    return false
  }
  addWordToSpellCheckerDictionary() {
    return true
  }
  removeWordFromSpellCheckerDictionary() {
    return true
  }
  async listWordsInSpellCheckerDictionary() {
    return []
  }
  async resolveProxy() {
    return 'DIRECT'
  }
  async clearCache() {}
  async clearStorageData() {}
  async clearCodeCaches() {}
  setUserAgent() {}
  getUserAgent() {
    return 'HangulAIWorkbench-Web'
  }
  async getCacheSize() {
    return 0
  }
  setPreloads() {}
  getPreloads() {
    return []
  }
}
const defaultSession = lenient(new FakeSession(), 'session')

class FakeWebContents extends EventEmitter {
  constructor(options = {}) {
    super()
    this.setMaxListeners(0)
    this.id = nextContentsId++
    this.preload = options.preload || null
    this.url = ''
    this.title = ''
    this.destroyed = false
    this.zoom = 1
    this.session = defaultSession
    this.owner = null
    this.ipc = new IpcMain()
    this.navigationHistory = lenient(
      {
        canGoBack: () => false,
        canGoForward: () => false,
        goBack() {},
        goForward() {},
        clear() {},
      },
      'navigationHistory',
    )
    this.debugger = lenient(
      { attach() {}, detach() {}, isAttached: () => false, sendCommand: async () => ({}) },
      'debugger',
    )
    this.mainFrame = lenient(
      { url: '', send: (...a) => this.send(...a), frames: [], framesInSubtree: [] },
      'frame',
    )
    this.windowOpenHandler = null
    allContents.set(this.id, this)
    link.send({ t: 'wc-create', wc: this.id, preload: this.preload })
  }
  send(channel, ...args) {
    if (this.destroyed) return
    link.send({ t: 'wc-send', wc: this.id, ch: channel, args })
  }
  postMessage(channel, message) {
    this.send(channel, message)
  }
  async loadURL(url) {
    this.url = String(url)
    this.mainFrame.url = this.url
    link.send({ t: 'wc-load', wc: this.id, url: toWebUrl(this.url), original: this.url })
    return new Promise((resolve) => {
      const done = () => resolve()
      this.once('did-finish-load', done)
      setTimeout(done, 20_000)
    })
  }
  loadFile(file, options) {
    let url = 'file://' + path.resolve(file)
    if (options?.query) url += '?' + new URLSearchParams(options.query).toString()
    if (options?.hash) url += '#' + options.hash
    return this.loadURL(url)
  }
  reload() {
    link.send({ t: 'wc-load', wc: this.id, url: toWebUrl(this.url), original: this.url })
  }
  reloadIgnoringCache() {
    this.reload()
  }
  getURL() {
    return this.url
  }
  getTitle() {
    return this.title
  }
  isDestroyed() {
    return this.destroyed
  }
  isCrashed() {
    return false
  }
  isLoading() {
    return false
  }
  isLoadingMainFrame() {
    return false
  }
  isWaitingForResponse() {
    return false
  }
  focus() {
    focusedContents = this
    link.send({ t: 'wc-focus', wc: this.id })
  }
  isFocused() {
    return focusedContents === this
  }
  getOSProcessId() {
    return process.pid
  }
  getProcessId() {
    return this.id
  }
  setZoomFactor(f) {
    this.zoom = f
    link.send({ t: 'wc-zoom', wc: this.id, factor: f })
  }
  getZoomFactor() {
    return this.zoom
  }
  setZoomLevel(level) {
    this.setZoomFactor(Math.pow(1.2, level))
  }
  getZoomLevel() {
    return Math.log(this.zoom) / Math.log(1.2)
  }
  setVisualZoomLevelLimits() {
    return Promise.resolve()
  }
  setWindowOpenHandler(fn) {
    this.windowOpenHandler = fn
  }
  setBackgroundThrottling() {}
  setAudioMuted() {}
  setIgnoreMenuShortcuts() {}
  openDevTools() {}
  closeDevTools() {}
  isDevToolsOpened() {
    return false
  }
  toggleDevTools() {}
  stop() {}
  undo() {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'undo' })
  }
  redo() {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'redo' })
  }
  cut() {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'cut' })
  }
  copy() {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'copy' })
  }
  paste() {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'paste' })
  }
  pasteAndMatchStyle() {
    this.paste()
  }
  selectAll() {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'selectAll' })
  }
  delete() {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'delete' })
  }
  replaceMisspelling() {}
  insertText(text) {
    link.send({ t: 'wc-command', wc: this.id, cmd: 'insertText', text })
    return Promise.resolve()
  }
  async executeJavaScript(code) {
    const reply = await link.request({ t: 'wc-exec', wc: this.id, code: String(code) })
    if (reply.error) throw new Error(reply.error)
    return reply.value
  }
  print(options, callback) {
    link.send({ t: 'wc-print', wc: this.id })
    if (typeof callback === 'function') setTimeout(() => callback(true, ''), 0)
  }
  async printToPDF() {
    const reply = await link.request({ t: 'wc-pdf', wc: this.id })
    if (reply.error || !reply.value)
      throw new Error(reply.error || 'printToPDF is not available in the web edition')
    return Buffer.from(reply.value)
  }
  async capturePage() {
    const reply = await link.request({ t: 'wc-capture', wc: this.id })
    return nativeImage.createFromDataURL(reply.value || '')
  }
  async savePage() {}
  getPrintersAsync() {
    return Promise.resolve([])
  }
  getPrinters() {
    return []
  }
  invalidate() {}
  startDrag() {}
  inspectElement() {}
  sendInputEvent() {}
  beginFrameSubscription() {}
  endFrameSubscription() {}
  setDevToolsWebContents() {}
  getUserAgent() {
    return 'HangulAIWorkbench-Web'
  }
  setUserAgent() {}
  getBackgroundThrottling() {
    return false
  }
  close() {
    this.destroy()
  }
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    allContents.delete(this.id)
    link.send({ t: 'wc-destroy', wc: this.id })
    this.emit('destroyed')
  }
  // called by the gateway: the browser frame reported an event
  fromBrowser(ev, data) {
    if (ev === 'did-finish-load') {
      this.title = data?.title ?? this.title
      this.emit('dom-ready', {})
      this.emit('did-finish-load', {})
      this.emit('did-stop-loading', {})
    } else if (ev === 'title') {
      this.title = data?.title ?? ''
      this.emit('page-title-updated', {}, this.title)
    } else if (ev === 'focus') {
      focusedContents = this
      this.emit('focus')
      const win = this.owner && this.owner.window
      if (win) win.markFocused()
    } else if (ev === 'blur') {
      this.emit('blur')
    } else if (ev === 'input') {
      const event = {
        preventDefault() {
          this.defaultPrevented = true
        },
        defaultPrevented: false,
      }
      this.emit('before-input-event', event, data)
      return { prevented: event.defaultPrevented }
    } else if (ev === 'context-menu') {
      this.emit('context-menu', { preventDefault() {} }, data)
    } else if (ev === 'open-window') {
      const handler = this.windowOpenHandler
      const result = handler
        ? handler({ url: data.url, frameName: '', features: '', disposition: 'new-window' })
        : { action: 'allow' }
      if (result && result.action === 'allow') link.send({ t: 'open-external', url: data.url })
    } else if (ev === 'will-navigate') {
      const event = {
        preventDefault() {
          this.defaultPrevented = true
        },
        defaultPrevented: false,
        url: data.url,
      }
      this.emit('will-navigate', event, data.url)
      return { prevented: event.defaultPrevented }
    } else if (ev === 'zoom') {
      this.emit('zoom-changed', {}, data.direction)
    }
    return {}
  }
}

const webContentsApi = {
  getAllWebContents: () => [...allContents.values()],
  fromId: (id) => allContents.get(id),
  getFocusedWebContents: () => focusedContents,
  fromFrame: () => undefined,
  fromDevToolsTargetId: () => undefined,
  create: (options) => new FakeWebContents(options),
}

// ---------------------------------------------------------------- views and windows
let nextViewId = 1
class FakeView extends EventEmitter {
  constructor() {
    super()
    this.viewId = nextViewId++
    this.children = []
    this.bounds = { x: 0, y: 0, width: 0, height: 0 }
    this.visible = true
    this.window = null
  }
  addChildView(view, index) {
    const at = this.children.indexOf(view)
    if (at >= 0) this.children.splice(at, 1)
    if (typeof index === 'number' && index >= 0 && index <= this.children.length)
      this.children.splice(index, 0, view)
    else this.children.push(view)
    view.parent = this
    view.attach(this.window)
    this.sync()
  }
  removeChildView(view) {
    const at = this.children.indexOf(view)
    if (at >= 0) this.children.splice(at, 1)
    if (view.parent === this) view.parent = null
    view.attach(null)
    this.sync()
  }
  attach(win) {
    this.window = win
    for (const child of this.children) child.attach(win)
    if (this.webContents) this.webContents.owner = this
  }
  sync() {
    if (this.window) this.window.syncViews()
  }
  setBounds(bounds) {
    this.bounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    }
    if (this.webContents)
      link.send({ t: 'view-bounds', wc: this.webContents.id, bounds: this.bounds })
    this.emit('bounds-changed')
  }
  getBounds() {
    return { ...this.bounds }
  }
  setVisible(visible) {
    this.visible = !!visible
    if (this.webContents)
      link.send({ t: 'view-visible', wc: this.webContents.id, visible: this.visible })
  }
  getVisible() {
    return this.visible
  }
  setBackgroundColor() {}
  setBorderRadius() {}
}

class FakeWebContentsView extends FakeView {
  constructor(options = {}) {
    super()
    const prefs = options.webPreferences || {}
    this.webContents = options.webContents || new FakeWebContents({ preload: prefs.preload })
    this.webContents.owner = this
  }
}

const allWindows = new Map()
let nextWindowId = 1
let focusedWindow = null
const viewport = { width: 1440, height: 900 }

class FakeBrowserWindow extends EventEmitter {
  constructor(options = {}) {
    super()
    this.setMaxListeners(0)
    this.id = nextWindowId++
    this.options = options
    this.destroyed = false
    this.visibleState = options.show !== false
    this.title = options.title || 'HangulAIWorkbench'
    this.parent = options.parent || null
    this.isMain = allWindows.size === 0
    const width = this.isMain ? viewport.width : options.width || 800
    const height = this.isMain ? viewport.height : options.height || 600
    this.bounds = { x: 0, y: 0, width, height }
    this.minimized = false
    this.maximized = !!this.isMain
    this.fullscreen = false
    this.contentView = new FakeView()
    this.contentView.attach(this)
    this.contentView.webContents = null
    const prefs = options.webPreferences || {}
    this.webContents = new FakeWebContents({ preload: prefs.preload })
    this.webContents.owner = { window: this }
    allWindows.set(this.id, this)
    link.send({
      t: 'win-create',
      win: this.id,
      wc: this.webContents.id,
      main: this.isMain,
      opts: {
        width,
        height,
        title: this.title,
        modal: !!options.modal,
        parent: this.parent ? this.parent.id : null,
        show: this.visibleState,
        frame: options.frame !== false,
        resizable: options.resizable !== false,
        backgroundColor: options.backgroundColor || null,
      },
    })
    if (this.visibleState) this.markFocused()
    this.webContents.on('destroyed', () => this.destroy())
  }
  markFocused() {
    if (focusedWindow === this) return
    const prev = focusedWindow
    focusedWindow = this
    if (prev && !prev.destroyed) prev.emit('blur')
    this.emit('focus')
    app.emit('browser-window-focus', {}, this)
  }
  syncViews() {
    const order = []
    const walk = (view) => {
      for (const child of view.children) {
        if (child.webContents)
          order.push({ wc: child.webContents.id, bounds: child.bounds, visible: child.visible })
        walk(child)
      }
    }
    walk(this.contentView)
    link.send({ t: 'win-views', win: this.id, views: order })
  }
  addBrowserView() {}
  removeBrowserView() {}
  setBrowserView() {}
  getBrowserViews() {
    return []
  }
  loadURL(url) {
    return this.webContents.loadURL(url)
  }
  loadFile(file, options) {
    return this.webContents.loadFile(file, options)
  }
  update(props) {
    link.send({ t: 'win-update', win: this.id, props })
  }
  show() {
    this.visibleState = true
    this.update({ show: true })
    this.markFocused()
    this.emit('show')
  }
  showInactive() {
    this.visibleState = true
    this.update({ show: true })
    this.emit('show')
  }
  hide() {
    this.visibleState = false
    this.update({ show: false })
    this.emit('hide')
  }
  isVisible() {
    return this.visibleState
  }
  focus() {
    this.show()
  }
  blur() {}
  isFocused() {
    return focusedWindow === this
  }
  isDestroyed() {
    return this.destroyed
  }
  close() {
    if (this.destroyed) return
    let prevented = false
    this.emit('close', { preventDefault: () => (prevented = true), defaultPrevented: false })
    if (!prevented) this.destroy()
  }
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    allWindows.delete(this.id)
    if (focusedWindow === this) focusedWindow = null
    link.send({ t: 'win-destroy', win: this.id })
    this.emit('closed')
    if (!this.webContents.destroyed) this.webContents.destroy()
    if (allWindows.size === 0) app.emit('window-all-closed')
  }
  setTitle(title) {
    this.title = String(title)
    this.update({ title: this.title })
  }
  getTitle() {
    return this.title
  }
  getBounds() {
    return { ...this.bounds }
  }
  getContentBounds() {
    return { ...this.bounds }
  }
  getSize() {
    return [this.bounds.width, this.bounds.height]
  }
  getContentSize() {
    return [this.bounds.width, this.bounds.height]
  }
  getNormalBounds() {
    return this.getBounds()
  }
  getPosition() {
    return [this.bounds.x, this.bounds.y]
  }
  setBounds(b) {
    if (this.isMain) return
    this.bounds = { ...this.bounds, ...b }
    this.update({ bounds: this.bounds })
  }
  setContentBounds(b) {
    this.setBounds(b)
  }
  setSize(width, height) {
    this.setBounds({ width, height })
  }
  setContentSize(width, height) {
    this.setBounds({ width, height })
  }
  setPosition() {}
  center() {}
  setMinimumSize() {}
  setMaximumSize() {}
  getMinimumSize() {
    return [0, 0]
  }
  setResizable() {}
  isResizable() {
    return true
  }
  setMovable() {}
  setMinimizable() {}
  setMaximizable() {}
  setClosable() {}
  setFullScreenable() {}
  setAlwaysOnTop() {}
  isAlwaysOnTop() {
    return false
  }
  moveTop() {}
  minimize() {
    this.minimized = true
    this.emit('minimize')
  }
  restore() {
    this.minimized = false
    this.emit('restore')
  }
  isMinimized() {
    return this.minimized
  }
  maximize() {
    this.maximized = true
    this.emit('maximize')
  }
  unmaximize() {
    this.maximized = false
    this.emit('unmaximize')
  }
  isMaximized() {
    return this.maximized
  }
  isNormal() {
    return !this.maximized && !this.minimized && !this.fullscreen
  }
  setFullScreen(on) {
    this.fullscreen = !!on
    this.emit(on ? 'enter-full-screen' : 'leave-full-screen')
  }
  isFullScreen() {
    return this.fullscreen
  }
  isSimpleFullScreen() {
    return false
  }
  isModal() {
    return !!this.options.modal
  }
  getParentWindow() {
    return this.parent
  }
  getChildWindows() {
    return [...allWindows.values()].filter((w) => w.parent === this)
  }
  setParentWindow(parent) {
    this.parent = parent
  }
  setMenu() {}
  removeMenu() {}
  setMenuBarVisibility() {}
  setAutoHideMenuBar() {}
  setIcon() {}
  setProgressBar() {}
  setOverlayIcon() {}
  setRepresentedFilename() {}
  setDocumentEdited() {}
  isDocumentEdited() {
    return false
  }
  setWindowButtonVisibility() {}
  setTitleBarOverlay() {}
  setVibrancy() {}
  setBackgroundMaterial() {}
  setBackgroundColor() {}
  getBackgroundColor() {
    return '#ffffff'
  }
  setOpacity() {}
  setSkipTaskbar() {}
  setHasShadow() {}
  setIgnoreMouseEvents() {}
  setContentProtection() {}
  setFocusable() {}
  setVisibleOnAllWorkspaces() {}
  flashFrame() {}
  setThumbarButtons() {}
  setTouchBar() {}
  setSheetOffset() {}
  getNativeWindowHandle() {
    return Buffer.alloc(8)
  }
  getMediaSourceId() {
    return 'window:' + this.id
  }
  invalidateShadow() {}
  setAspectRatio() {}
  static getAllWindows() {
    return [...allWindows.values()]
  }
  static getFocusedWindow() {
    return focusedWindow && !focusedWindow.destroyed
      ? focusedWindow
      : [...allWindows.values()][0] || null
  }
  static fromWebContents(wc) {
    if (!wc) return null
    for (const win of allWindows.values()) {
      if (win.webContents === wc) return win
      const owner = wc.owner
      if (owner && owner.window === win) return win
    }
    return null
  }
  static fromId(id) {
    return allWindows.get(id) || null
  }
  static fromBrowserView() {
    return null
  }
}

function resizeViewport(width, height) {
  viewport.width = width
  viewport.height = height
  for (const win of allWindows.values()) {
    if (!win.isMain) continue
    win.bounds = { x: 0, y: 0, width, height }
    win.emit('resize')
    win.emit('resized')
  }
}

// ---------------------------------------------------------------- protocol
const registeredSchemes = new Map()
const privileged = []
const protocolApi = {
  registerSchemesAsPrivileged(list) {
    privileged.push(...list)
  },
  handle(scheme, handler) {
    registeredSchemes.set(String(scheme).toLowerCase(), handler)
    link.send({ t: 'schemes', schemes: [...registeredSchemes.keys()] })
  },
  unhandle(scheme) {
    registeredSchemes.delete(String(scheme).toLowerCase())
  },
  isProtocolHandled(scheme) {
    return registeredSchemes.has(String(scheme).toLowerCase())
  },
  registerFileProtocol() {
    return true
  },
  registerBufferProtocol() {
    return true
  },
  registerStringProtocol() {
    return true
  },
  registerHttpProtocol() {
    return true
  },
  interceptFileProtocol() {
    return true
  },
  unregisterProtocol() {
    return true
  },
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ftl': 'text/plain; charset=utf-8',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
}
function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

async function fileResponse(file) {
  try {
    const body = await fsp.readFile(file)
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': mimeOf(file), 'Content-Length': String(body.length) },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

const net = {
  async fetch(input, init) {
    const url = typeof input === 'string' ? input : input.url
    if (url.startsWith('file://')) return fileResponse(fileURLToPath(url))
    const m = /^([a-z][a-z0-9+.-]*):/i.exec(url)
    if (m && registeredSchemes.has(m[1].toLowerCase())) {
      return registeredSchemes.get(m[1].toLowerCase())(new Request(url, init))
    }
    const opts = { ...(init || {}) }
    delete opts.bypassCustomProtocolHandlers
    return fetch(input, opts)
  },
  isOnline: () => true,
  online: true,
  request() {
    throw new Error('net.request is not available in the web edition')
  },
}

async function handleProtocolRequest({ scheme, url, method, headers, body }) {
  const handler = registeredSchemes.get(scheme)
  if (!handler) return { status: 404, headers: {}, body: null }
  const init = { method: method || 'GET', headers: headers || {} }
  if (body && method !== 'GET' && method !== 'HEAD') init.body = body
  let request
  try {
    request = new Request(url, init)
  } catch {
    request = {
      url,
      method: init.method,
      headers: new Headers(init.headers),
      arrayBuffer: async () => body || new ArrayBuffer(0),
      text: async () => '',
    }
  }
  let response = await handler(request)
  // The HTML editor pushes its page over the WebSocket (ipcRenderer.send) and then points its
  // preview frame at html-preview://; in Electron the push always lands first, on the web the
  // frame's HTTP request can overtake it and the preview stays blank. Wait for the push.
  for (
    let i = 0;
    i < 40 && scheme === 'html-preview' && (!response || response.status === 404);
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    response = await handler(request)
  }
  if (!response) return { status: 404, headers: {}, body: null }
  const out = {}
  response.headers.forEach((v, k) => (out[k] = v))
  const buf = response.body ? new Uint8Array(await response.arrayBuffer()) : null
  return { status: response.status, headers: out, body: buf }
}

// ---------------------------------------------------------------- dialogs
function splitWindowArg(a, b) {
  if (a && typeof a === 'object' && (a instanceof FakeBrowserWindow || a.webContents))
    return [a, b || {}]
  return [null, a || {}]
}
const dialog = {
  async showMessageBox(a, b) {
    const [win, options] = splitWindowArg(a, b)
    const reply = await link.request({
      t: 'dialog',
      kind: 'message',
      win: win ? win.id : null,
      options: plainOptions(options),
    })
    return {
      response: typeof reply.response === 'number' ? reply.response : (options.cancelId ?? 0),
      checkboxChecked: !!reply.checkboxChecked,
    }
  },
  showMessageBoxSync(a, b) {
    const [, options] = splitWindowArg(a, b)
    console.warn('[fake-electron] showMessageBoxSync answered with its default')
    return options.defaultId ?? 0
  },
  async showOpenDialog(a, b) {
    const [win, options] = splitWindowArg(a, b)
    const reply = await link.request({
      t: 'dialog',
      kind: 'open',
      win: win ? win.id : null,
      options: plainOptions(options),
    })
    const filePaths = Array.isArray(reply.filePaths) ? reply.filePaths : []
    return { canceled: filePaths.length === 0, filePaths }
  },
  showOpenDialogSync() {
    return undefined
  },
  async showSaveDialog(a, b) {
    const [win, options] = splitWindowArg(a, b)
    const reply = await link.request({
      t: 'dialog',
      kind: 'save',
      win: win ? win.id : null,
      options: plainOptions(options),
    })
    return { canceled: !reply.filePath, filePath: reply.filePath || '' }
  },
  showSaveDialogSync() {
    return undefined
  },
  showErrorBox(title, content) {
    link.send({ t: 'dialog-notice', title: String(title), content: String(content) })
  },
  async showCertificateTrustDialog() {},
}
function plainOptions(options) {
  const out = {}
  for (const [k, v] of Object.entries(options || {})) {
    if (typeof v === 'function' || k === 'icon' || k === 'signal') continue
    out[k] = v
  }
  return out
}

// ---------------------------------------------------------------- menus
const menus = new Map()
let nextMenuId = 1
let nextItemId = 1
class FakeMenuItem {
  constructor(options = {}) {
    Object.assign(this, options)
    this.itemId = nextItemId++
    this.enabled = options.enabled !== false
    this.visible = options.visible !== false
    this.checked = !!options.checked
    this.type = options.type || (options.submenu ? 'submenu' : 'normal')
    if (options.submenu && !(options.submenu instanceof FakeMenu))
      this.submenu = FakeMenu.buildFromTemplate(options.submenu)
    if (!this.label && options.role) this.label = roleLabel(options.role)
  }
}
function roleLabel(role) {
  const labels = {
    undo: '실행 취소',
    redo: '다시 실행',
    cut: '잘라내기',
    copy: '복사',
    paste: '붙여넣기',
    selectAll: '모두 선택',
    selectall: '모두 선택',
    delete: '삭제',
    pasteAndMatchStyle: '서식 없이 붙여넣기',
  }
  return labels[role] || ''
}
class FakeMenu extends EventEmitter {
  constructor() {
    super()
    this.items = []
    this.menuId = nextMenuId++
    menus.set(this.menuId, this)
  }
  append(item) {
    this.items.push(item instanceof FakeMenuItem ? item : new FakeMenuItem(item))
  }
  insert(pos, item) {
    this.items.splice(pos, 0, item instanceof FakeMenuItem ? item : new FakeMenuItem(item))
  }
  getMenuItemById(id) {
    for (const item of this.items) {
      if (item.id === id) return item
      if (item.submenu) {
        const found = item.submenu.getMenuItemById(id)
        if (found) return found
      }
    }
    return null
  }
  describe() {
    return this.items
      .filter((i) => i.visible !== false)
      .map((i) => ({
        itemId: i.itemId,
        label: i.label || '',
        type: i.type,
        enabled: i.enabled !== false,
        checked: !!i.checked,
        accelerator: typeof i.accelerator === 'string' ? i.accelerator : '',
        role: i.role || '',
        submenu: i.submenu ? i.submenu.describe() : null,
      }))
  }
  findItem(itemId) {
    for (const item of this.items) {
      if (item.itemId === itemId) return item
      if (item.submenu) {
        const found = item.submenu.findItem(itemId)
        if (found) return found
      }
    }
    return null
  }
  popup(options = {}) {
    const win = options.window || BrowserWindow.getFocusedWindow()
    const wc = focusedContents && !focusedContents.destroyed ? focusedContents : win?.webContents
    link.send({
      t: 'menu-popup',
      menu: this.menuId,
      items: this.describe(),
      x: options.x ?? null,
      y: options.y ?? null,
      wc: wc ? wc.id : null,
    })
    this.popupCallback = options.callback
    this.emit('menu-will-show')
  }
  closePopup() {
    link.send({ t: 'menu-close', menu: this.menuId })
  }
  click(itemId, wcId) {
    const item = this.findItem(itemId)
    if (!item) return
    if (item.type === 'checkbox') item.checked = !item.checked
    if (item.type === 'radio') item.checked = true
    const wc = allContents.get(wcId) || focusedContents
    const win = wc ? BrowserWindow.fromWebContents(wc) : BrowserWindow.getFocusedWindow()
    if (typeof item.click === 'function') item.click(item, win, { triggeredByAccelerator: false })
    else if (item.role && wc) {
      const role = String(item.role)
      if (typeof wc[role] === 'function') wc[role]()
    }
  }
  static buildFromTemplate(template) {
    const menu = new FakeMenu()
    for (const entry of template || []) menu.append(entry)
    return menu
  }
  static setApplicationMenu(menu) {
    applicationMenu = menu
    link.send({
      t: 'app-menu',
      menu: menu ? menu.menuId : null,
      items: menu ? menu.describe() : [],
    })
  }
  static getApplicationMenu() {
    return applicationMenu
  }
  static sendActionToFirstResponder() {}
}
let applicationMenu = null
const Menu = FakeMenu
const MenuItem = FakeMenuItem

function menuClosed(menuId) {
  const menu = menus.get(menuId)
  if (!menu) return
  menu.emit('menu-will-close')
  if (typeof menu.popupCallback === 'function') menu.popupCallback()
  menu.popupCallback = null
}

// ---------------------------------------------------------------- shell, clipboard, theme, screen
const shell = {
  async openExternal(url) {
    link.send({ t: 'open-external', url: String(url) })
  },
  async openPath(p) {
    link.send({ t: 'reveal-file', path: String(p) })
    return ''
  },
  showItemInFolder(p) {
    link.send({ t: 'reveal-file', path: String(p) })
  },
  async trashItem(p) {
    await fsp.rm(p, { recursive: true, force: true })
  },
  beep() {},
  readShortcutLink() {
    return {}
  },
  writeShortcutLink() {
    return false
  },
}

let clipText = ''
let clipHtml = ''
let clipImage = null
const clipboard = {
  readText: () => clipText,
  writeText: (t) => {
    clipText = String(t)
    link.send({ t: 'clipboard', text: clipText })
  },
  readHTML: () => clipHtml,
  writeHTML: (h) => {
    clipHtml = String(h)
  },
  readRTF: () => '',
  writeRTF() {},
  readImage: () => clipImage || nativeImage.createEmpty(),
  writeImage: (img) => {
    clipImage = img
  },
  readBookmark: () => ({ title: '', url: '' }),
  availableFormats: () => (clipText ? ['text/plain'] : []),
  has: () => false,
  read: () => '',
  readBuffer: () => Buffer.alloc(0),
  writeBuffer() {},
  write(data) {
    if (data?.text !== undefined) clipboard.writeText(data.text)
    if (data?.html !== undefined) clipHtml = String(data.html)
  },
  clear() {
    clipText = ''
    clipHtml = ''
  },
}

const nativeTheme = lenient(
  Object.assign(new EventEmitter(), {
    shouldUseDarkColors: false,
    shouldUseHighContrastColors: false,
    shouldUseInvertedColorScheme: false,
    themeSource: 'system',
    inForcedColorsMode: false,
    prefersReducedTransparency: false,
  }),
  'nativeTheme',
)

const display = () => ({
  id: 1,
  bounds: { x: 0, y: 0, width: viewport.width, height: viewport.height },
  workArea: { x: 0, y: 0, width: viewport.width, height: viewport.height },
  size: { width: viewport.width, height: viewport.height },
  workAreaSize: { width: viewport.width, height: viewport.height },
  scaleFactor: 1,
  rotation: 0,
  internal: true,
  touchSupport: 'unknown',
})
const screen = lenient(
  Object.assign(new EventEmitter(), {
    getPrimaryDisplay: display,
    getAllDisplays: () => [display()],
    getDisplayMatching: display,
    getDisplayNearestPoint: display,
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    screenToDipPoint: (p) => p,
    dipToScreenPoint: (p) => p,
  }),
  'screen',
)

// ---------------------------------------------------------------- nativeImage
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, payload) {
  const out = Buffer.alloc(12 + payload.length)
  out.writeUInt32BE(payload.length, 0)
  out.write(type, 4, 4, 'ascii')
  payload.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length)
  return out
}

function bgraToPng(bgra, width, height) {
  if (!bgra || width <= 0 || height <= 0 || bgra.length < width * height * 4) return Buffer.alloc(0)
  const stride = width * 4
  const raw = Buffer.alloc(height * (1 + stride))
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + stride)
    raw[rowOff] = 0
    const srcRow = y * stride
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4
      const d = rowOff + 1 + x * 4
      raw[d] = bgra[s + 2]
      raw[d + 1] = bgra[s + 1]
      raw[d + 2] = bgra[s]
      raw[d + 3] = bgra[s + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function makeImage(buffer, size, isBitmap = false) {
  const data = buffer ? Buffer.from(buffer) : Buffer.alloc(0)
  let dims = size || { width: 0, height: 0 }
  if (!size && data.length > 24 && data.readUInt32BE(0) === 0x89504e47)
    dims = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  let cachedPng = null
  const asPng = () => {
    if (!isBitmap) return data
    if (!cachedPng) cachedPng = bgraToPng(data, dims.width, dims.height)
    return cachedPng
  }
  return lenient(
    {
      isEmpty: () => data.length === 0,
      getSize: () => ({ ...dims }),
      toPNG: () => asPng(),
      toJPEG: () => asPng(),
      toBitmap: () => data,
      getBitmap: () => data,
      toDataURL: () => 'data:image/png;base64,' + asPng().toString('base64'),
      resize: () => makeImage(data, dims, isBitmap),
      crop: () => makeImage(data, dims, isBitmap),
      getAspectRatio: () => (dims.height ? dims.width / dims.height : 1),
      setTemplateImage() {},
      isTemplateImage: () => false,
      addRepresentation() {},
      getScaleFactors: () => [1],
    },
    'nativeImage',
  )
}
const nativeImage = {
  createEmpty: () => makeImage(null),
  createFromBuffer: (b) => makeImage(b),
  createFromPath: (p) => {
    try {
      return makeImage(fs.readFileSync(p))
    } catch {
      return makeImage(null)
    }
  },
  createFromDataURL: (u) => {
    const m = /^data:[^;]+;base64,(.*)$/.exec(String(u || ''))
    return makeImage(m ? Buffer.from(m[1], 'base64') : null)
  },
  createFromBitmap: (b, o) => makeImage(b, o, true),
  createThumbnailFromPath: async (p) => nativeImage.createFromPath(p),
}

// ---------------------------------------------------------------- utilityProcess
const UTILITY_PRELOAD = path.join(__dirname, 'utility-preload.cjs')
const utilityProcess = {
  fork(modulePath, args = [], options = {}) {
    const child = fork(modulePath, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      execArgv: ['-r', UTILITY_PRELOAD, ...(options.execArgv || [])],
      serialization: 'advanced',
      stdio:
        options.stdio === 'pipe'
          ? ['pipe', 'pipe', 'pipe', 'ipc']
          : ['inherit', 'inherit', 'inherit', 'ipc'],
    })
    const proc = new EventEmitter()
    proc.pid = child.pid
    proc.stdout = child.stdout
    proc.stderr = child.stderr
    proc.postMessage = (message) => {
      if (child.connected) child.send(message)
    }
    proc.kill = () => child.kill()
    child.on('spawn', () => proc.emit('spawn'))
    child.on('message', (data) => proc.emit('message', data))
    child.on('exit', (code) => proc.emit('exit', code ?? 0))
    child.on('error', (err) => proc.emit('error', 'FatalError', String(err)))
    return proc
  },
}

// ---------------------------------------------------------------- app
class FakeApp extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(0)
    this.isPackaged = false
    this.name = 'HangulAIWorkbench'
    this.readyPromise = new Promise((resolve) => (this.markReady = resolve))
    this.ready = false
    this.commandLine = lenient(
      {
        appendSwitch() {},
        appendArgument() {},
        hasSwitch: () => false,
        getSwitchValue: () => '',
        removeSwitch() {},
      },
      'commandLine',
    )
    this.dock = lenient(
      {
        setIcon() {},
        setMenu() {},
        bounce: () => 0,
        show: async () => {},
        hide() {},
        setBadge() {},
        getBadge: () => '',
      },
      'dock',
    )
    this.accessibilitySupportEnabled = false
    this.userAgentFallback = 'HangulAIWorkbench-Web'
  }
  whenReady() {
    return this.readyPromise
  }
  isReady() {
    return this.ready
  }
  getPath(name) {
    const p = paths[name]
    if (!p) throw new Error('Failed to get ' + "'" + name + "'" + ' path')
    return p
  }
  setPath(name, value) {
    paths[name] = value
    fs.mkdirSync(value, { recursive: true })
  }
  getAppPath() {
    return process.env.WEB_APP_PATH
  }
  getVersion() {
    return process.env.WEB_APP_VERSION || '0.13.3'
  }
  getName() {
    return this.name
  }
  setName(n) {
    this.name = n
  }
  getLocale() {
    return 'ko'
  }
  getSystemLocale() {
    return 'ko-KR'
  }
  getPreferredSystemLanguages() {
    return ['ko-KR']
  }
  getLocaleCountryCode() {
    return 'KR'
  }
  requestSingleInstanceLock() {
    return true
  }
  hasSingleInstanceLock() {
    return true
  }
  releaseSingleInstanceLock() {}
  quit() {
    // the web edition has no quit: say who asked, so a closed session can be traced
    console.warn('[session] app.quit', callers())
    let prevented = false
    this.emit('before-quit', { preventDefault: () => (prevented = true) })
    if (prevented) return
    this.emit('will-quit', { preventDefault() {} })
    link.send({ t: 'app-quit' })
  }
  exit(code) {
    console.warn('[session] app.exit', code, callers())
    link.send({ t: 'app-quit' })
  }
  relaunch() {}
  focus() {}
  hide() {}
  show() {}
  isHidden() {
    return false
  }
  setAppUserModelId() {}
  setAsDefaultProtocolClient() {
    return false
  }
  isDefaultProtocolClient() {
    return false
  }
  removeAsDefaultProtocolClient() {
    return false
  }
  setAboutPanelOptions() {}
  setAccessibilitySupportEnabled(v) {
    this.accessibilitySupportEnabled = !!v
  }
  isAccessibilitySupportEnabled() {
    return false
  }
  addRecentDocument() {}
  clearRecentDocuments() {}
  setJumpList() {}
  getJumpListSettings() {
    return { minItems: 0, removedItems: [] }
  }
  setUserTasks() {
    return true
  }
  setBadgeCount() {
    return true
  }
  getBadgeCount() {
    return 0
  }
  setLoginItemSettings() {}
  getLoginItemSettings() {
    return { openAtLogin: false }
  }
  async getFileIcon() {
    return nativeImage.createEmpty()
  }
  getGPUFeatureStatus() {
    return {}
  }
  async getGPUInfo() {
    return {}
  }
  getAppMetrics() {
    return []
  }
  disableHardwareAcceleration() {}
  enableSandbox() {}
  isInApplicationsFolder() {
    return true
  }
  moveToApplicationsFolder() {
    return false
  }
  setActivationPolicy() {}
  isEmojiPanelSupported() {
    return false
  }
  showEmojiPanel() {}
  setSecureKeyboardEntryEnabled() {}
  isSecureKeyboardEntryEnabled() {
    return false
  }
}
const app = lenient(new FakeApp(), 'app')

// ---------------------------------------------------------------- misc modules
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.concat([Buffer.from('WEB1'), Buffer.from(String(s), 'utf8')]),
  decryptString: (b) => {
    const buf = Buffer.from(b)
    return buf.subarray(0, 4).toString() === 'WEB1'
      ? buf.subarray(4).toString('utf8')
      : buf.toString('utf8')
  },
  getSelectedStorageBackend: () => 'basic_text',
  setUsePlainTextEncryption() {},
}
const emitterModule = (name, extra = {}) => lenient(Object.assign(new EventEmitter(), extra), name)
const powerMonitor = emitterModule('powerMonitor', {
  getSystemIdleTime: () => 0,
  getSystemIdleState: () => 'active',
  isOnBatteryPower: () => false,
  onBatteryPower: false,
})
const powerSaveBlocker = { start: () => 1, stop() {}, isStarted: () => false }
const globalShortcut = {
  register: () => false,
  registerAll() {},
  isRegistered: () => false,
  unregister() {},
  unregisterAll() {},
}
const systemPreferences = emitterModule('systemPreferences', {
  getAccentColor: () => '2f5beaff',
  getColor: () => '#000000',
  getSystemColor: () => '#000000',
  isDarkMode: () => false,
  getUserDefault: () => undefined,
  getAnimationSettings: () => ({
    shouldRenderRichAnimation: true,
    scrollAnimationsEnabledBySystem: true,
    prefersReducedMotion: false,
  }),
  canPromptTouchID: () => false,
  askForMediaAccess: async () => false,
  getMediaAccessStatus: () => 'denied',
  isTrustedAccessibilityClient: () => false,
  getEffectiveAppearance: () => 'light',
})
class Notification extends EventEmitter {
  constructor(options = {}) {
    super()
    this.options = options
  }
  show() {
    link.send({
      t: 'notify',
      title: String(this.options.title || ''),
      body: String(this.options.body || ''),
    })
  }
  close() {}
  static isSupported() {
    return true
  }
}
const autoUpdater = emitterModule('autoUpdater', {
  setFeedURL() {},
  getFeedURL: () => '',
  checkForUpdates() {},
  quitAndInstall() {},
})
const crashReporter = {
  start() {},
  getLastCrashReport: () => null,
  getUploadedReports: () => [],
  addExtraParameter() {},
  removeExtraParameter() {},
  getParameters: () => ({}),
}
const contentTracing = {
  startRecording: async () => {},
  stopRecording: async () => '',
  getCategories: async () => [],
}
const desktopCapturer = { getSources: async () => [] }
const inAppPurchase = emitterModule('inAppPurchase')
const pushNotifications = emitterModule('pushNotifications')
const TouchBar = class {
  static TouchBarButton = class {}
  static TouchBarSpacer = class {}
  static TouchBarLabel = class {}
}
class MessageChannelMain {
  constructor() {
    const a = new EventEmitter()
    const b = new EventEmitter()
    a.postMessage = (m) => b.emit('message', { data: m, ports: [] })
    b.postMessage = (m) => a.emit('message', { data: m, ports: [] })
    a.start = b.start = () => {}
    a.close = b.close = () => {}
    this.port1 = a
    this.port2 = b
  }
}

const BrowserWindow = FakeBrowserWindow
const electron = {
  app,
  ipcMain,
  BrowserWindow,
  BaseWindow: FakeBrowserWindow,
  BrowserView: FakeWebContentsView,
  WebContentsView: FakeWebContentsView,
  View: FakeView,
  webContents: webContentsApi,
  webFrameMain: { fromId: () => undefined },
  session: lenient(
    { defaultSession, fromPartition: () => defaultSession, fromPath: () => defaultSession },
    'sessionModule',
  ),
  protocol: protocolApi,
  net,
  dialog,
  Menu,
  MenuItem,
  shell,
  clipboard,
  nativeTheme,
  screen,
  nativeImage,
  NativeImage: Object,
  utilityProcess,
  safeStorage,
  powerMonitor,
  powerSaveBlocker,
  globalShortcut,
  systemPreferences,
  Notification,
  autoUpdater,
  crashReporter,
  contentTracing,
  desktopCapturer,
  inAppPurchase,
  pushNotifications,
  TouchBar,
  MessageChannelMain,
  ShareMenu: class {},
  Tray: class extends EventEmitter {
    setToolTip() {}
    setContextMenu() {}
    destroy() {}
    setImage() {}
  },
}

module.exports = lenient(electron, 'electron')
module.exports.__web = {
  link,
  allContents,
  allWindows,
  menus,
  menuClosed,
  ipcMain,
  app,
  resizeViewport,
  handleProtocolRequest,
  registeredSchemes,
  paths,
  missing,
  focusContents(id) {
    const wc = allContents.get(id)
    if (wc) wc.fromBrowser('focus')
  },
}
