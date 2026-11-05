import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createPopupStore, popupError } from './popup-store.mjs'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
export function popupDevEnabled(env = process.env) {
  return (
    env.WEB_POPUP_EDITOR === '1' && ['127.0.0.1', '::1'].includes(env.WEB_HOST) && !env.K_SERVICE
  )
}
export function popupLocalRequest(req) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return false
  try {
    const host = new URL('http://' + req.headers.host)
    return (
      ['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) &&
      Number(host.port || 80) === req.socket.localPort
    )
  } catch {
    return false
  }
}
function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'self'",
  })
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data))
}
async function body(req, max) {
  const chunks = []
  let size = 0
  for await (const part of req) {
    size += part.length
    if (size > max) throw popupError('파일 또는 내용이 너무 커요.', 413)
    chunks.push(part)
  }
  return Buffer.concat(chunks)
}
function imageExtension(bytes, type) {
  if (
    type === 'image/png' &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png'
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'jpg'
  if (type === 'image/gif' && /GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'gif'
  if (
    type === 'image/webp' &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'webp'
  throw popupError('PNG, JPG, WebP, GIF 이미지 파일을 골라 주세요.')
}
export function createPopupRoutes({ clientDir, devDir, enabled = () => popupDevEnabled() }) {
  const store = createPopupStore(join(clientDir, 'announcements.json'))
  const files = {
    '/__dev/popups/': ['index.html', 'text/html; charset=utf-8'],
    '/__dev/popups/editor.js': ['editor.js', 'text/javascript; charset=utf-8'],
    '/__dev/popups/editor.css': ['editor.css', 'text/css; charset=utf-8'],
  }
  return async function handle(req, res, p) {
    if (!p.startsWith('/__dev/popups')) return false
    if (!enabled() || !popupLocalRequest(req)) {
      send(res, 404, 'not found', 'text/plain')
      return true
    }
    try {
      if (req.method === 'GET' && files[p]) {
        const [file, type] = files[p]
        send(res, 200, await readFile(join(devDir, file)), type)
      } else if (req.method === 'GET' && p === '/__dev/popups/config')
        send(res, 200, await store.read())
      else if (['PUT', 'POST'].includes(req.method)) {
        if (req.headers.origin !== 'http://' + req.headers.host)
          throw popupError('미리보기 화면에서 다시 시도해 주세요.', 403)
        if (req.method === 'PUT' && p === '/__dev/popups/config') {
          if (!String(req.headers['content-type']).startsWith('application/json'))
            throw popupError('JSON 형식이 필요해요.')
          let input
          try {
            input = JSON.parse((await body(req, 96 * 1024)).toString())
          } catch (e) {
            if (e.status) throw e
            throw popupError('내용을 읽을 수 없어요.')
          }
          send(res, 200, await store.save(input))
        } else if (req.method === 'POST' && p === '/__dev/popups/media') {
          const bytes = await body(req, 8 * 1024 * 1024),
            ext = imageExtension(bytes, req.headers['content-type'])
          const name = randomUUID() + '.' + ext,
            dir = join(clientDir, 'popup-media')
          await mkdir(dir, { recursive: true })
          await writeFile(join(dir, name), bytes, { flag: 'wx' })
          send(res, 200, { url: '/__web/popup-media/' + name })
        } else send(res, 405, { error: '지원하지 않는 요청이에요.' })
      } else send(res, 405, { error: '지원하지 않는 요청이에요.' })
    } catch (e) {
      send(res, e.status || 500, {
        error: e.status ? e.message : '저장하지 못했어요. 다시 시도해 주세요.',
      })
    }
    return true
  }
}
