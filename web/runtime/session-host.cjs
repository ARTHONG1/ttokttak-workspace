'use strict'
/**
 * One browser session's desktop app: loads the shell's main bundle on the fake
 * 'electron' module and relays IPC between it and the web gateway (process.send).
 */
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const { EventEmitter } = require('node:events')

const APP_ROOT = process.env.WEB_APP_ROOT // program/
const SHELL_DIR = path.join(APP_ROOT, 'apps', 'shell')
process.env.WEB_APP_PATH = SHELL_DIR
// Electron sets process.resourcesPath; plain Node does not. The desktop code reads its
// packaged engines (wasm/pdfium.wasm, wasm/hb-subset.wasm, …) from there when node_modules
// is absent, which is always the case in the web image (web/build.mjs copies them).
if (typeof process.resourcesPath !== 'string') {
  process.resourcesPath = process.env.WEB_RESOURCES_PATH || path.join(APP_ROOT, 'resources')
}

// development aid: record which files of the app tree the desktop code reads (container layout)
if (process.env.WEB_TRACE_FS) {
  const seen = new Set()
  const note = (p) => {
    try {
      const abs = path.resolve(String(p instanceof URL ? p.pathname : p))
      if (abs.startsWith(APP_ROOT) && !seen.has(abs)) {
        seen.add(abs)
        fs.appendFileSync(process.env.WEB_TRACE_FS, abs + '\n')
      }
    } catch {}
  }
  for (const name of [
    'openSync',
    'readFileSync',
    'existsSync',
    'statSync',
    'readdirSync',
    'accessSync',
    'createReadStream',
    'readFile',
    'stat',
    'readdir',
    'open',
    'access',
    'realpathSync',
  ]) {
    const orig = fs[name]
    if (typeof orig !== 'function') continue
    fs[name] = function (p, ...rest) {
      if (typeof p === 'string' || p instanceof URL) note(p)
      return orig.call(this, p, ...rest)
    }
  }
  for (const name of ['readFile', 'stat', 'readdir', 'open', 'access', 'realpath']) {
    const orig = fs.promises[name]
    fs.promises[name] = function (p, ...rest) {
      if (typeof p === 'string' || p instanceof URL) note(p)
      return orig.call(this, p, ...rest)
    }
  }
  const origSpawn = require('node:child_process').spawn
  require('node:child_process').spawn = function (cmd, ...rest) {
    note(cmd)
    return origSpawn.call(this, cmd, ...rest)
  }
}

const electron = require('./fake-electron.cjs')
const web = electron.__web

// electron-updater: no updates in the web edition
class CancellationToken {
  cancel() {}
}
const updater = Object.assign(new EventEmitter(), {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  logger: null,
  checkForUpdates: async () => null,
  checkForUpdatesAndNotify: async () => null,
  downloadUpdate: async () => [],
  quitAndInstall() {},
  setFeedURL() {},
  on(...a) {
    return EventEmitter.prototype.on.apply(this, a)
  },
})

const originalLoad = Module._load
Module._load = function (request, _parent, _isMain) {
  if (request === 'electron' || request === 'electron/main' || request === 'electron/common')
    return electron
  if (request === 'electron-updater')
    return {
      autoUpdater: updater,
      CancellationToken,
      AppUpdater: class {},
      NsisUpdater: class {},
      MacUpdater: class {},
    }
  return originalLoad.apply(this, arguments)
}

require('./vertex-auth.cjs').install()

// ---------------------------------------------------------------- link to the gateway
let nextRequest = 1
const pending = new Map()
web.link.send = (msg) => {
  if (process.connected) process.send(msg)
}
web.link.request = (msg) =>
  new Promise((resolve) => {
    const id = 'c' + nextRequest++
    pending.set(id, resolve)
    web.link.send({ ...msg, id })
  })

function ipcEvent(wc, extra = {}) {
  return {
    sender: wc,
    senderFrame: wc.mainFrame,
    frameId: 1,
    processId: wc.id,
    ports: [],
    returnValue: undefined,
    reply: (channel, ...args) => wc.send(channel, ...args),
    preventDefault() {},
    ...extra,
  }
}

// ---------------------------------------------------------------- session confinement
// The desktop main trusts its renderer with any path on the PC (open, list, rename, add a folder).
// On the web every renderer is a stranger's browser, so a path argument must stay inside this
// session's own folder (its home, uploads and samples) or the read-only app tree. Anything else
// (another session under /tmp/hs, /etc, /proc) is refused before a handler sees it.
const SESSION_DIR = path.resolve(process.env.WEB_SESSION_DIR || process.cwd())
const APP_DIR = path.resolve(APP_ROOT)
const inside = (p, dir) => p === dir || p.startsWith(dir + path.sep)
function pathOf(v) {
  if (typeof v !== 'string' || v.length < 1) return null
  let s = v
  if (/^file:\/\//i.test(s)) {
    try {
      s = decodeURIComponent(new URL(s).pathname)
    } catch {
      return null
    }
  }
  if (!path.isAbsolute(s) && !/^~(\/|$)/.test(s)) return null
  return path.resolve(s.replace(/^~(?=\/|$)/, web.paths.home))
}
function foreignPath(v, depth = 0) {
  if (depth > 5 || v == null) return null
  if (typeof v === 'string') {
    const p = pathOf(v)
    return p && !inside(p, SESSION_DIR) && !inside(p, APP_DIR) ? v : null
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const f = foreignPath(x, depth + 1)
      if (f) return f
    }
    return null
  }
  if (typeof v === 'object' && !(v instanceof Uint8Array) && !(v instanceof ArrayBuffer)) {
    for (const k of Object.keys(v)) {
      const f = foreignPath(v[k], depth + 1)
      if (f) return f
    }
  }
  return null
}

function errorText(err) {
  return err instanceof Error ? err.message : String(err)
}

async function onMessage(msg) {
  switch (msg.t) {
    case 'reply': {
      const resolve = pending.get(msg.id)
      pending.delete(msg.id)
      if (resolve) resolve(msg)
      return
    }
    case 'invoke': {
      const wc = web.allContents.get(msg.wc)
      const handler = (wc && wc.ipc.handlers.get(msg.ch)) || web.ipcMain.handlers.get(msg.ch)
      if (!wc || !handler) {
        web.link.send({
          t: 'reply',
          id: msg.id,
          ok: false,
          error: "No handler registered for '" + msg.ch + "'",
        })
        return
      }
      const foreign = foreignPath(msg.args)
      if (foreign) {
        console.warn('[session] refused path outside the session on', msg.ch)
        web.link.send({
          t: 'reply',
          id: msg.id,
          ok: false,
          error: 'This path is not available in the web edition.',
        })
        return
      }
      try {
        const value = await handler(ipcEvent(wc), ...(msg.args || []))
        web.link.send({ t: 'reply', id: msg.id, ok: true, value })
      } catch (err) {
        web.link.send({ t: 'reply', id: msg.id, ok: false, error: errorText(err) })
      }
      return
    }
    case 'send':
    case 'sendSync': {
      const wc = web.allContents.get(msg.wc)
      if (!wc) {
        if (msg.t === 'sendSync')
          web.link.send({ t: 'reply', id: msg.id, ok: true, value: undefined })
        return
      }
      if (foreignPath(msg.args)) {
        console.warn('[session] refused path outside the session on', msg.ch)
        if (msg.t === 'sendSync')
          web.link.send({ t: 'reply', id: msg.id, ok: true, value: undefined })
        return
      }
      const event = ipcEvent(wc)
      try {
        wc.ipc.emit(msg.ch, event, ...(msg.args || []))
        web.ipcMain.emit(msg.ch, event, ...(msg.args || []))
      } catch (err) {
        console.error('[session] ipc', msg.ch, err)
      }
      if (msg.t === 'sendSync')
        web.link.send({ t: 'reply', id: msg.id, ok: true, value: event.returnValue })
      return
    }
    case 'wc-event': {
      const wc = web.allContents.get(msg.wc)
      const result = wc ? wc.fromBrowser(msg.ev, msg.data) : {}
      if (msg.id) web.link.send({ t: 'reply', id: msg.id, ok: true, value: result })
      return
    }
    case 'win-close': {
      const win = web.allWindows.get(msg.win)
      if (win) win.close()
      return
    }
    case 'resize':
      web.resizeViewport(msg.width, msg.height)
      return
    case 'menu-click': {
      const menu = web.menus.get(msg.menu)
      if (menu) menu.click(msg.item, msg.wc)
      return
    }
    case 'menu-closed':
      web.menuClosed(msg.menu)
      return
    case 'proto': {
      try {
        const res = await web.handleProtocolRequest(msg)
        web.link.send({ t: 'reply', id: msg.id, ok: true, value: res })
      } catch (err) {
        web.link.send({
          t: 'reply',
          id: msg.id,
          ok: true,
          value: { status: 500, headers: {}, body: null, error: errorText(err) },
        })
      }
      return
    }
    case 'preload-of': {
      const wc = web.allContents.get(msg.wc)
      web.link.send({ t: 'reply', id: msg.id, ok: true, value: wc ? wc.preload : null })
      return
    }
    case 'open-files': {
      // the browser dropped or picked documents to open in the app
      web.app.emit('open-file', { preventDefault() {} }, msg.path)
      return
    }
  }
}

process.on('message', (msg) => {
  onMessage(msg).catch((err) => console.error('[session] message failed', msg && msg.t, err))
})
process.on('uncaughtException', (err) => console.error('[session] uncaught', err))
process.on('unhandledRejection', (err) => console.error('[session] unhandled', err))
process.on('disconnect', () => process.exit(0))

// ---------------------------------------------------------------- start the desktop app
process.chdir(web.paths.home)
// AI: Gemini on Vertex AI (ADC) unless this session already chose something else.
// The desktop main may move userData (a -Dev folder when unpackaged), so seed wherever it lands.
function seedAiSettings(dir) {
  const file = path.join(dir, 'ai-settings.json')
  if (fs.existsSync(file)) return
  const { vertexBaseUrl } = require('./vertex-auth.cjs')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify({
      provider: 'gemini',
      providers: {
        gemini: {
          apiKey: 'vertex-adc',
          model: process.env.VERTEX_DEFAULT_MODEL || 'gemini-4-argon',
          baseUrl: vertexBaseUrl(),
        },
      },
      internetTools: true,
      subscriptionNoticeSeen: true,
    }),
  )
}
// The web edition's AI is already connected, so the first-run guide (whose middle step
// connects one) would only repeat what the home screen shows: sessions start on home.
function seedAppSettings(dir) {
  const file = path.join(dir, 'app-settings.json')
  let current = {}
  try {
    current = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch {}
  if (current.onboardingSeen === true) return
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ ...current, onboardingSeen: true }))
}
function seedSettings(dir) {
  seedAiSettings(dir)
  seedAppSettings(dir)
}
seedSettings(web.paths.userData)
const setPath = web.app.setPath.bind(web.app)
web.app.setPath = (name, value) => {
  setPath(name, value)
  if (name === 'userData') seedSettings(value)
}
require(path.join(SHELL_DIR, 'out', 'main', 'index.js'))
setImmediate(() => {
  web.app.ready = true
  web.app.emit('will-finish-launching')
  web.app.markReady()
  web.app.emit('ready', {}, {})
  web.link.send({ t: 'ready' })
})
