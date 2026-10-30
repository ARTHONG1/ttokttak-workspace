/**
 * Web gateway for the Hangul AI Workbench: one desktop main process per browser
 * session (session-host.cjs on the fake 'electron'), the browser host page, and the
 * HTTP routes the session's frames need.
 */
import { createServer } from 'node:http'
import { fork } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import zlib from 'node:zlib'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(process.env.WEB_APP_ROOT || path.join(HERE, '..', '..'))
const CLIENT = path.join(HERE, 'client')
const SAMPLES = path.join(HERE, 'samples')
// short: the desktop's control socket lives under the session and Unix sockets cap paths near 104 bytes
const SESSIONS_ROOT = process.env.WEB_SESSIONS_ROOT || '/tmp/hs'
const PORT = Number(process.env.PORT || 8080)
// local preview binds to 127.0.0.1 (WEB_HOST); Cloud Run leaves it unset
const HOST = process.env.WEB_HOST || undefined
const IDLE_MS = Number(process.env.WEB_SESSION_IDLE_MS || 15 * 60 * 1000)
const MAX_UPLOAD = 200 * 1024 * 1024
const DOC_EXT = /\.(hwp|hwpx|docx|doc|xlsx|xls|xlsm|csv|pptx|ppt|pdf|md|markdown|html|htm|epub|xmind|txt|odt|rtf|png|jpg|jpeg)$/i
fs.mkdirSync(SESSIONS_ROOT, { recursive: true })

// ---------------------------------------------------------------- codec (browser ⇄ gateway)
function encode(value) {
  return JSON.stringify(value, function (key, v) {
    const raw = this[key]
    if (raw instanceof Uint8Array) return { __t: 'u8', b: Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('base64') }
    if (raw instanceof ArrayBuffer) return { __t: 'u8', b: Buffer.from(raw).toString('base64') }
    if (raw instanceof Date) return { __t: 'date', v: raw.getTime() }
    if (raw instanceof Map) return { __t: 'map', v: [...raw.entries()] }
    if (raw instanceof Set) return { __t: 'set', v: [...raw.values()] }
    if (raw instanceof Error) return { __t: 'err', message: raw.message }
    if (typeof raw === 'bigint') return Number(raw)
    return v
  })
}
function revive(value) {
  if (Array.isArray(value)) return value.map(revive)
  if (value && typeof value === 'object') {
    if (value.__t === 'u8') return new Uint8Array(Buffer.from(value.b, 'base64'))
    if (value.__t === 'date') return new Date(value.v)
    if (value.__t === 'map') return new Map(revive(value.v))
    if (value.__t === 'set') return new Set(revive(value.v))
    if (value.__t === 'err') return new Error(value.message)
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = revive(v)
    return out
  }
  return value
}

// ---------------------------------------------------------------- sessions
const sessions = new Map()

class Session {
  constructor(id) {
    this.id = id
    this.dir = path.join(SESSIONS_ROOT, id)
    this.home = path.join(this.dir, 'home')
    this.uploads = path.join(this.home, '업로드')
    fs.mkdirSync(this.uploads, { recursive: true })
    // the trial's sample documents: every session gets its own copies to edit
    this.samples = path.join(this.home, '예시 문서')
    this.known = new Map()
    if (!fs.existsSync(this.samples)) {
      fs.mkdirSync(this.samples, { recursive: true })
      try {
        for (const name of fs.readdirSync(SAMPLES)) {
          const target = path.join(this.samples, name)
          fs.copyFileSync(path.join(SAMPLES, name), target)
          // a fresh copy is not a document the user saved: no download toast for it
          const info = fs.statSync(target)
          this.known.set(target, { handle: null, announced: false, size: info.size, mtime: info.mtimeMs })
        }
      } catch {}
    }
    this.ws = null
    this.child = null
    this.pending = new Map()
    this.nextId = 1
    this.idleTimer = null
    this.watcher = null
    this.writeTimers = new Map()
  }
  start() {
    this.stop()
    const child = fork(path.join(HERE, 'session-host.cjs'), [], {
      cwd: this.home,
      env: {
        ...process.env,
        HOME: this.home,
        TMPDIR: path.join(this.dir, 'tmp'),
        WEB_SESSION_DIR: this.dir,
        WEB_APP_ROOT: APP_ROOT,
        NODE_ENV: 'production',
      },
      serialization: 'advanced',
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    fs.mkdirSync(path.join(this.dir, 'tmp'), { recursive: true })
    this.child = child
    child.on('message', (msg) => this.fromChild(msg))
    child.on('exit', (code) => {
      if (this.child === child) {
        this.child = null
        this.toBrowser({ t: 'session-ended', code })
      }
    })
    this.watch()
  }
  stop() {
    if (this.child) {
      const c = this.child
      this.child = null
      c.kill()
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const r of this.pending.values()) r({ ok: false, error: 'session restarted' })
    this.pending.clear()
  }
  dispose() {
    this.stop()
    sessions.delete(this.id)
    fsp.rm(this.dir, { recursive: true, force: true }).catch(() => {})
  }
  toChild(msg) {
    if (this.child && this.child.connected) this.child.send(msg)
  }
  requestChild(msg) {
    return new Promise((resolve) => {
      const id = 'g' + this.nextId++
      this.pending.set(id, resolve)
      this.toChild({ ...msg, id })
      setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, error: 'timeout' })
      }, 120_000)
    })
  }
  toBrowser(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(encode(msg))
  }
  fromChild(msg) {
    if (msg.t === 'reply' && typeof msg.id === 'string' && msg.id.startsWith('g')) {
      const resolve = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      if (resolve) resolve(msg)
      return
    }
    if (msg.t === 'dialog') return void this.dialog(msg)
    this.toBrowser(msg)
  }
  /** dialogs: the browser answers in its own terms, paths are made here */
  async dialog(msg) {
    this.toBrowser(msg)
    const answer = await new Promise((resolve) => this.pending.set('d' + msg.id, resolve))
    let reply = { t: 'reply', id: msg.id }
    if (msg.kind === 'message') reply = { ...reply, response: answer.response, checkboxChecked: answer.checkboxChecked }
    else if (msg.kind === 'open') reply = { ...reply, filePaths: (answer.paths || []).filter((p) => this.owns(p)) }
    else if (msg.kind === 'save') {
      if (!answer.name) reply = { ...reply, filePath: '' }
      else {
        const dir = this.saveDirFor(msg.options && msg.options.defaultPath)
        const filePath = path.join(dir, path.basename(String(answer.name)))
        this.known.set(filePath, { handle: answer.handle ?? null, announced: false })
        reply = { ...reply, filePath }
      }
    }
    this.toChild(reply)
  }
  saveDirFor(defaultPath) {
    if (defaultPath && path.isAbsolute(defaultPath)) {
      const dir = path.dirname(defaultPath)
      if (this.owns(dir) && fs.existsSync(dir)) return dir
    }
    const docs = path.join(this.home, 'Documents')
    fs.mkdirSync(docs, { recursive: true })
    return docs
  }
  owns(p) {
    const rel = path.relative(this.dir, path.resolve(String(p)))
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
  }
  /** documents written anywhere under the session's home go back to the browser */
  watch() {
    try {
      this.watcher = fs.watch(this.home, { recursive: true }, (_event, name) => {
        if (!name || !DOC_EXT.test(name) || /(^|\/)\.|\.tmp$|~$/.test(name) || name.includes('/.config/')) return
        const full = path.join(this.home, name)
        clearTimeout(this.writeTimers.get(full))
        this.writeTimers.set(
          full,
          setTimeout(() => this.announce(full), 600),
        )
      })
    } catch (err) {
      console.warn('[gateway] watch failed', err)
    }
  }
  async announce(full) {
    this.writeTimers.delete(full)
    let info
    try {
      info = await fsp.stat(full)
    } catch {
      return
    }
    if (!info.isFile()) return
    const known = this.known.get(full)
    if (known && known.size === info.size && known.mtime === info.mtimeMs) return
    const entry = { handle: known?.handle ?? null, announced: true, size: info.size, mtime: info.mtimeMs }
    this.known.set(full, entry)
    // an upload is registered by /__upload with its size and time, so it returned above;
    // a new file here was written by the app (an opened .hwp saved as .hwpx beside it)
    this.toBrowser({ t: 'file-written', path: full, name: path.basename(full), size: info.size, handle: entry.handle })
  }
}

function sessionFromCookie(req) {
  const m = /(?:^|;\s*)hs=([A-Za-z0-9_-]{16,64})/.exec(req.headers.cookie || '')
  return m ? m[1] : null
}

// ---------------------------------------------------------------- HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf',
}
const FRAME_SCRIPT = '<script src="/__web/frame.js"></script>'

/** App schemes become same-origin paths on the web, so CSP that names a scheme also allows 'self'. */
const WEB_SCHEMES = /^(https?|data|blob|wss?|mediastream|filesystem):$/i
function relaxCsp(csp) {
  return String(csp)
    .split(';')
    .map((d) => {
      const tokens = d.trim().split(/\s+/)
      if (tokens.length < 2) return d
      const hasScheme = tokens.slice(1).some((t) => /^[a-z][a-z0-9+.-]*:$/i.test(t) && !WEB_SCHEMES.test(t))
      if (hasScheme && !tokens.includes("'self'") && !tokens.includes("'none'")) tokens.push("'self'")
      return ' ' + tokens.join(' ')
    })
    .join(';')
    .trim()
}

function injectFrame(html) {
  let text = Buffer.from(html).toString('utf8')
  text = text.replace(/(<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=")([^"]*)(")/gi, (_m, a, csp, b) => a + relaxCsp(csp) + b)
  if (text.includes('/__web/frame.js')) return text
  const head = /<head[^>]*>/i.exec(text)
  if (head) return text.slice(0, head.index + head[0].length) + FRAME_SCRIPT + text.slice(head.index + head[0].length)
  return FRAME_SCRIPT + text
}

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 })
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers })
  res.end(body)
}

// Built editor files carry a content hash in their name (index-B8ntjEV5.js), so they never
// change under one URL: the browser may keep them, and they are sent compressed. The sheets
// bundle alone is 21 MB raw, 3.5 MB with brotli. Compressed copies are made once per file.
const HASHED = /[-.][A-Za-z0-9_]{8}\.(js|mjs|css|wasm|ttf|otf|woff2?|png|svg|json)$/
const COMPRESSIBLE = /\.(js|mjs|css|html|json|wasm|svg|ttf|otf|txt)$/i
const packed = new Map()
function pickEncoding(req) {
  const accept = String(req?.headers?.['accept-encoding'] || '')
  return /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null
}
function packOnce(key, body, enc) {
  const k = enc + ':' + key
  let hit = packed.get(k)
  if (!hit) {
    hit = enc === 'br'
      ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length } })
      : zlib.gzipSync(body, { level: 6 })
    packed.set(k, hit)
  }
  return hit
}
function sendBody(req, res, status, body, headers, { cacheKey = null, immutable = false } = {}) {
  const type = String(headers['Content-Type'] || '')
  const h = { ...headers, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store', Vary: 'Accept-Encoding' }
  const enc = body.length > 1024 && (COMPRESSIBLE.test(cacheKey || '') || /^(text\/|application\/(javascript|json|wasm))/.test(type)) ? pickEncoding(req) : null
  if (enc) {
    body = cacheKey ? packOnce(cacheKey, body, enc) : enc === 'br' ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.gzipSync(body, { level: 6 })
    h['Content-Encoding'] = enc
  }
  h['Content-Length'] = body.length
  res.writeHead(status, h)
  res.end(req?.method === 'HEAD' ? undefined : body)
}

async function serveFile(res, file, { inject = false, req = null } = {}) {
  let body
  try {
    body = await fsp.readFile(file)
  } catch {
    return send(res, 404, 'not found')
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
  if (inject && type.startsWith('text/html')) body = Buffer.from(injectFrame(body))
  const immutable = HASHED.test(file) && !type.startsWith('text/html')
  // app files are the same for every session: compress them once
  const appFile = file.startsWith(APP_ROOT + path.sep) || file.startsWith(CLIENT + path.sep)
  sendBody(req, res, 200, body, { 'Content-Type': type }, { cacheKey: appFile ? file + (inject ? '#i' : '') : null, immutable })
}

async function serveVideo(req, res, file) {
  let info
  try {
    info = await fsp.stat(file)
  } catch {
    return send(res, 404, 'not found')
  }
  const size = info.size
  const base = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' }
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''))
  if (!m) {
    res.writeHead(200, { ...base, 'Content-Length': size })
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res)
  }
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1])
  let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(size - 1, Number(m[2]))
  if (!(start >= 0 && start <= end && end < size)) {
    res.writeHead(416, { ...base, 'Content-Range': 'bytes */' + size })
    return res.end()
  }
  res.writeHead(206, { ...base, 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1 })
  return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start, end }).pipe(res)
}

function allowedAppFile(file) {
  const rel = path.relative(APP_ROOT, file)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false
  return /^(apps\/[^/]+\/out\/renderer\/|apps\/[^/]+\/(public|resources)\/|node_modules\/)/.test(rel.split(path.sep).join('/'))
}

async function handleHttp(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const p = url.pathname
  if (p === '/api/health') return send(res, 200, '{"ok":true}', { 'Content-Type': 'application/json' })
  // the intro page; the trial app itself lives at /app
  if (p === '/' || p === '/index.html') {
    const body = await fsp.readFile(path.join(CLIENT, 'intro.html'))
    return send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8' })
  }
  if (p === '/app' || p === '/app/') {
    const headers = {}
    if (!sessionFromCookie(req)) headers['Set-Cookie'] = 'hs=' + randomBytes(18).toString('base64url') + '; Path=/; HttpOnly; SameSite=Lax' + (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '')
    const body = await fsp.readFile(path.join(CLIENT, 'index.html'))
    return send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8', ...headers })
  }
  if (p.startsWith('/__web/') && p !== '/__web/preload.js') {
    // the license notices the desktop installer ships (apps/shell/build, copied by web/build.mjs)
    if (p === '/__web/licenses') {
      const body = await fsp.readFile(path.join(APP_ROOT, 'apps', 'shell', 'build', 'THIRD-PARTY-NOTICES.txt')).catch(() => null)
      return body ? send(res, 200, body, { 'Content-Type': 'text/plain; charset=utf-8' }) : send(res, 404, 'not found')
    }
    const file = path.normalize(path.join(CLIENT, p.slice('/__web/'.length)))
    if (!file.startsWith(CLIENT)) return send(res, 403, 'forbidden')
    // the intro film: Safari plays video only with byte ranges; cache it, it never changes under one name
    if (file.endsWith('.mp4')) return serveVideo(req, res, file)
    return serveFile(res, file, { req })
  }
  // the app's own built files do not depend on a session
  if (p.startsWith('/__file/')) {
    const file = path.resolve(decodeURIComponent(p.slice('/__file'.length)))
    if (allowedAppFile(file)) return serveFile(res, file, { inject: true, req })
  }
  const sid = sessionFromCookie(req)
  const session = sid ? sessions.get(sid) : null
  if (!session || !session.child) return send(res, 409, 'no session')

  if (p === '/__web/preload.js') {
    const reply = await session.requestChild({ t: 'preload-of', wc: Number(url.searchParams.get('wc')) })
    const file = reply.value
    if (!file || !allowedAppFile(path.resolve(file)) && !/\/apps\/[^/]+\/out\/preload\//.test(file)) {
      return send(res, 200, '/* no preload */', { 'Content-Type': 'text/javascript; charset=utf-8' })
    }
    const code = await fsp.readFile(file, 'utf8')
    const wrapped = '(function(){var require=window.__electronRequire,process=window.__electronProcess,module={exports:{}},exports=module.exports,global=window;\n' + code + '\n})();'
    return send(res, 200, wrapped, { 'Content-Type': 'text/javascript; charset=utf-8' })
  }
  if (p.startsWith('/__proto/')) {
    const rest = p.slice('/__proto/'.length)
    const slash = rest.indexOf('/')
    const scheme = rest.slice(0, slash)
    const original = scheme + '://' + rest.slice(slash + 1) + url.search
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req, MAX_UPLOAD)
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !/^(cookie|host|connection)$/i.test(k)) headers[k] = v
    const reply = await session.requestChild({ t: 'proto', scheme, url: original, method: req.method, headers, body: body ? new Uint8Array(body) : null })
    const out = reply.value || { status: 502, headers: {}, body: null }
    const h = { ...out.headers }
    delete h['content-length']
    delete h['content-encoding']
    delete h['x-frame-options']
    if (h['content-security-policy']) h['content-security-policy'] = relaxCsp(h['content-security-policy'])
    let data = out.body ? Buffer.from(out.body) : Buffer.alloc(0)
    const isHtml = String(h['content-type'] || '').startsWith('text/html')
    if (isHtml) data = Buffer.from(injectFrame(data))
    const status = out.status || 200
    // genoffice-app://<app>/assets/<name>-<hash>.<ext> is a built file: shared across sessions
    const appAsset = status === 200 && scheme === 'genoffice-app' && !isHtml && HASHED.test(url.pathname)
    const headersOut = {}
    for (const [k, v] of Object.entries(h)) if (!/^cache-control$/i.test(k)) headersOut[k === 'content-type' ? 'Content-Type' : k] = v
    return sendBody(req, res, status, data, headersOut, { cacheKey: appAsset ? 'proto:' + url.pathname : null, immutable: appAsset })
  }
  if (p.startsWith('/__file/')) {
    const file = path.resolve(decodeURIComponent(p.slice('/__file'.length)))
    if (!allowedAppFile(file) && !session.owns(file)) return send(res, 403, 'forbidden')
    return serveFile(res, file, { inject: true, req })
  }
  if (p === '/__upload' && req.method === 'POST') {
    const want = String(url.searchParams.get('path') || '')
    const target = path.resolve(want)
    if (!target.startsWith(session.uploads + path.sep)) return send(res, 400, 'bad path')
    const body = await readBody(req, MAX_UPLOAD)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.writeFile(target, body)
    const info = await fsp.stat(target)
    session.known.set(target, { handle: url.searchParams.get('handle') || null, announced: false, size: info.size, mtime: info.mtimeMs })
    return send(res, 200, JSON.stringify({ ok: true, path: target }), { 'Content-Type': 'application/json' })
  }
  if (p === '/__upload-root') {
    return send(res, 200, JSON.stringify({ root: session.uploads, samples: session.samples, sep: path.sep }), { 'Content-Type': 'application/json' })
  }
  if (p === '/__download') {
    const file = path.resolve(String(url.searchParams.get('path') || ''))
    if (!session.owns(file)) return send(res, 403, 'forbidden')
    try {
      const body = await fsp.readFile(file)
      const name = encodeURIComponent(path.basename(file))
      return send(res, 200, body, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': "attachment; filename*=UTF-8''" + name })
    } catch {
      return send(res, 404, 'not found')
    }
  }
  if (p === '/__ipc-sync' && req.method === 'POST') {
    const msg = revive(JSON.parse((await readBody(req, MAX_UPLOAD)).toString('utf8')))
    const reply = await session.requestChild({ t: 'sendSync', wc: msg.wc, ch: msg.ch, args: msg.args })
    return send(res, 200, encode({ value: reply.value }), { 'Content-Type': 'application/json' })
  }
  return send(res, 404, 'not found')
}

const server = createServer((req, res) => {
  handleHttp(req, res).catch((err) => {
    console.error('[gateway]', req.method, req.url, err)
    if (!res.headersSent) send(res, err.status || 500, String(err.message || err))
    else res.end()
  })
})

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_UPLOAD })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  const sid = sessionFromCookie(req)
  if (url.pathname !== '/__ws' || !sid) return socket.destroy()
  wss.handleUpgrade(req, socket, head, (ws) => attach(sid, ws))
})

function attach(sid, ws) {
  let session = sessions.get(sid)
  if (!session) {
    session = new Session(sid)
    sessions.set(sid, session)
  }
  clearTimeout(session.idleTimer)
  if (session.ws && session.ws !== ws) session.ws.close()
  session.ws = ws
  // a (re)loaded page starts the desktop app afresh; the session's files stay
  session.start()
  ws.on('message', (data) => {
    let msg
    try {
      msg = revive(JSON.parse(String(data)))
    } catch {
      return
    }
    if (msg.t === 'dialog-answer') {
      const resolve = session.pending.get('d' + msg.id)
      session.pending.delete('d' + msg.id)
      if (resolve) resolve(msg)
      return
    }
    if (msg.t === 'hello') {
      session.toChild({ t: 'resize', width: msg.width, height: msg.height })
      return
    }
    session.toChild(msg)
  })
  ws.on('close', () => {
    if (session.ws !== ws) return
    session.ws = null
    session.idleTimer = setTimeout(() => session.dispose(), IDLE_MS)
  })
}

server.listen(PORT, HOST, () => console.log('[gateway] Hangul AI Workbench web on ' + (HOST || '') + ':' + PORT + ' (app ' + APP_ROOT + ')'))

