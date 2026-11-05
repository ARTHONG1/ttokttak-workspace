import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request as httpRequest } from 'node:http'
import { normalizePopups, createPopupStore } from '../runtime/popup-store.mjs'
import { createPopupRoutes, popupDevEnabled } from '../runtime/popup-routes.mjs'

const item = (changes = {}) => ({
  id: 'notice-1',
  enabled: true,
  title: '새 소식',
  body: '설명',
  mediaType: 'none',
  mediaUrl: '',
  linkUrl: '',
  linkLabel: '',
  placement: 'home',
  ...changes,
})

test('validates persisted content, links, IDs and media types', () => {
  assert.equal(normalizePopups({ version: 1, items: [item()] }).items[0].title, '새 소식')
  for (const mediaUrl of [
    'https://youtu.be/tLxKYB8qInY/',
    'https://www.youtube.com/live/tLxKYB8qInY/',
    'https://www.youtube-nocookie.com/embed/tLxKYB8qInY',
  ]) {
    assert.equal(
      normalizePopups({ version: 1, items: [item({ mediaType: 'youtube', mediaUrl })] }).items[0]
        .mediaUrl,
      mediaUrl,
    )
  }
  for (const change of [
    { id: '../x' },
    { enabled: 'true' },
    { title: 'x'.repeat(121) },
    { linkUrl: 'javascript:alert(1)' },
    { linkUrl: 'https://a.com', linkLabel: '' },
    { mediaType: 'image', mediaUrl: '/__web/../secret' },
    { mediaType: 'youtube', mediaUrl: 'https://youtube.com.evil.test/watch?v=abcdefghijk' },
    { mediaType: 'none', title: '', body: '' },
    { placement: 'unknown' },
  ]) {
    assert.throws(() => normalizePopups({ version: 1, items: [item(change)] }))
  }
  assert.throws(() => normalizePopups({ version: 1, items: [item(), item()] }))
  assert.throws(() =>
    normalizePopups({
      version: 1,
      items: Array.from({ length: 13 }, (_, i) => item({ id: 'x' + i })),
    }),
  )
})

test('saves to a project file, survives reopening, and refuses stale or competing saves', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'popup-store-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = createPopupStore(join(dir, 'announcements.json'))
  const first = await store.read()
  const saved = await store.save({ version: 1, items: [item()], revision: first.revision })
  assert.equal(
    JSON.parse(await readFile(join(dir, 'announcements.json'), 'utf8')).items[0].title,
    '새 소식',
  )
  assert.equal(
    (await createPopupStore(join(dir, 'announcements.json')).read()).revision,
    saved.revision,
  )
  await assert.rejects(
    store.save({ version: 1, items: [], revision: first.revision }),
    (e) => e.status === 409,
  )
  const results = await Promise.allSettled(
    ['둘', '셋'].map((title) =>
      store.save({ version: 1, items: [item({ title })], revision: saved.revision }),
    ),
  )
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 409).length, 1)
})

test('development mode requires explicit local preview and is disabled on Cloud Run', () => {
  assert.equal(popupDevEnabled({ WEB_POPUP_EDITOR: '1', WEB_HOST: '127.0.0.1' }), true)
  for (const env of [
    {},
    { WEB_POPUP_EDITOR: '1' },
    { WEB_POPUP_EDITOR: '1', WEB_HOST: '0.0.0.0' },
    { WEB_POPUP_EDITOR: '1', WEB_HOST: '127.0.0.1', K_SERVICE: 'public' },
  ])
    assert.equal(popupDevEnabled(env), false)
})

test('HTTP editor saves locally; public mode, spoofed Host, cross-origin writes and invalid images are refused', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'popup-http-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await mkdir(join(dir, 'client'))
  await mkdir(join(dir, 'dev'))
  await writeFile(join(dir, 'dev', 'index.html'), '<h1>등록</h1>')
  let enabled = true
  const handler = createPopupRoutes({
    clientDir: join(dir, 'client'),
    devDir: join(dir, 'dev'),
    enabled: () => enabled,
  })
  const server = createServer(async (req, res) => {
    if (!(await handler(req, res, new URL(req.url, 'http://localhost').pathname))) {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => new Promise((r) => server.close(r)))
  const base = 'http://127.0.0.1:' + server.address().port
  const request = (path, opts = {}) => fetch(base + path, opts)
  assert.equal((await request('/__dev/popups/')).status, 200)
  const data = await (await request('/__dev/popups/config')).json()
  const options = {
    method: 'PUT',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, items: [item()] }),
  }
  assert.equal(
    (
      await request('/__dev/popups/config', {
        ...options,
        headers: { ...options.headers, Origin: 'https://evil.test' },
      })
    ).status,
    403,
  )
  const spoofed = await new Promise((resolve) => {
    httpRequest(base + '/__dev/popups/config', { headers: { Host: 'evil.test' } }, (res) => {
      res.resume()
      resolve(res.statusCode)
    }).end()
  })
  assert.equal(spoofed, 404)
  assert.equal((await request('/__dev/popups/config', options)).status, 200)
  assert.equal((await request('/__dev/popups/config', options)).status, 409)
  assert.equal(
    (
      await request('/__dev/popups/media', {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'image/png' },
        body: '<svg>not png</svg>',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await request('/__dev/popups/media', {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'image/svg+xml' },
        body: '<svg/>',
      })
    ).status,
    400,
  )
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
    'base64',
  )
  const image = await request('/__dev/popups/media', {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'image/png' },
    body: png,
  })
  assert.equal(image.status, 200)
  const uploaded = await image.json()
  assert.match(uploaded.url, /^\/__web\/popup-media\/[a-f0-9-]+\.png$/)
  assert.deepEqual(await readFile(join(dir, 'client', uploaded.url.replace('/__web/', ''))), png)
  enabled = false
  for (const path of [
    '/__dev/popups/',
    '/__dev/popups/config',
    '/__dev/popups/editor.js',
    '/__dev/popups/media',
  ])
    assert.equal((await request(path)).status, 404)
  assert.equal((await request('/__dev/popups/config', options)).status, 404)
})
