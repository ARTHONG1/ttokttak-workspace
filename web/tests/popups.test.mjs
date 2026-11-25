import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request as httpRequest } from 'node:http'
import { normalizeNotices, createNoticeStore } from '../runtime/popup-store.mjs'
import { createPopupRoutes, popupDevEnabled } from '../runtime/popup-routes.mjs'
import { createNoticeFeed } from '../runtime/notice-feed.mjs'

const popup = (changes = {}) => ({
  id: 'notice-1',
  enabled: true,
  title: '새 소식',
  body: '설명',
  mediaType: 'none',
  mediaUrl: '',
  linkUrl: '',
  linkLabel: '',
  placements: ['home'],
  startsAt: '',
  endsAt: '',
  ...changes,
})
const promo = (changes = {}) => ({
  id: 'promo-1',
  enabled: true,
  title: '교실로 ON 제미나이',
  text: '교실에서 Gemini 바로 쓰기',
  imageUrl: '',
  linkUrl: 'https://example.com/book',
  linkLabel: '책 보기',
  startsAt: '2026-12-01',
  endsAt: '2027-01-06',
  ...changes,
})
const list = (popups = [], promos = []) => ({ version: 1, popups, promos })
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })

test('validates popups and promos, their links, places, pictures and dates', () => {
  const ok = normalizeNotices(list([popup()], [promo()]))
  assert.equal(ok.popups[0].title, '새 소식')
  assert.equal(ok.promos[0].endsAt, '2027-01-06')
  for (const mediaUrl of [
    'https://youtu.be/tLxKYB8qInY/',
    'https://www.youtube.com/live/tLxKYB8qInY/',
    'https://www.youtube-nocookie.com/embed/tLxKYB8qInY',
  ]) {
    assert.equal(
      normalizeNotices(list([popup({ mediaType: 'youtube', mediaUrl })])).popups[0].mediaUrl,
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
    { placements: [] },
    { placements: ['moon'] },
    { startsAt: '2026/12/01' },
    { startsAt: '2026-12-02', endsAt: '2026-12-01' },
  ]) {
    assert.throws(() => normalizeNotices(list([popup(change)])), JSON.stringify(change))
  }
  for (const change of [
    { title: '' },
    { imageUrl: 'https://evil.test/x.png' },
    { text: 'x'.repeat(301) },
  ]) {
    assert.throws(() => normalizeNotices(list([], [promo(change)])), JSON.stringify(change))
  }
  // one id for one item across both lists
  assert.throws(() => normalizeNotices(list([popup({ id: 'same' })], [promo({ id: 'same' })])))
  assert.throws(() =>
    normalizeNotices(
      list(
        [],
        Array.from({ length: 13 }, (_, i) => promo({ id: 'x' + i })),
      ),
    ),
  )
})

test('saves to the notice file, survives reopening, and refuses stale or competing saves', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'notice-store-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'notices.json')
  const store = createNoticeStore(file)
  const first = await store.read()
  const saved = await store.save({ ...list([popup()], [promo()]), revision: first.revision })
  assert.equal(JSON.parse(await readFile(file, 'utf8')).promos[0].title, '교실로 ON 제미나이')
  assert.equal((await createNoticeStore(file).read()).revision, saved.revision)
  await assert.rejects(store.save({ ...list(), revision: first.revision }), (e) => e.status === 409)
  const results = await Promise.allSettled(
    ['둘', '셋'].map((title) =>
      store.save({ ...list([popup({ title })]), revision: saved.revision }),
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

test('the 관리 screen saves into the notice repository and 게시하기 pushes it; public mode, spoofed Host, cross-origin writes and invalid images are refused', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'notice-http-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const origin = join(dir, 'origin.git')
  const repo = join(dir, 'notice')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
  execFileSync('git', ['clone', '-q', origin, repo])
  git(repo, 'config', 'user.name', 'test')
  git(repo, 'config', 'user.email', 'test@example.com')
  await writeFile(join(repo, 'notices.json'), JSON.stringify(list()) + '\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'start')
  git(repo, 'push', '-q', 'origin', 'HEAD:main')
  git(repo, 'branch', '-q', '--set-upstream-to=origin/main')
  const devDir = join(dir, 'dev')
  execFileSync('mkdir', [devDir])
  await writeFile(join(devDir, 'index.html'), '<h1>관리</h1>')
  let enabled = true
  const handler = createPopupRoutes({ repoDir: repo, devDir, enabled: () => enabled })
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
  assert.equal(data.pending, false)
  const options = {
    method: 'PUT',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, popups: [popup()], promos: [promo()] }),
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
  const saved = await request('/__dev/popups/config', options)
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).pending, true)
  assert.equal((await request('/__dev/popups/config', options)).status, 409)
  for (const [type, body] of [
    ['image/png', '<svg>not png</svg>'],
    ['image/svg+xml', '<svg/>'],
  ]) {
    const refused = await request('/__dev/popups/media', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': type },
      body,
    })
    assert.equal(refused.status, 400)
  }
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
  const name = uploaded.url.split('/').pop()
  assert.deepEqual(await readFile(join(repo, 'media', name)), png)

  // 게시하기: committed and pushed, nothing left to publish
  const published = await request('/__dev/popups/publish', {
    method: 'POST',
    headers: { Origin: base },
  })
  assert.equal(published.status, 200)
  assert.equal((await published.json()).pending, false)
  const remote = JSON.parse(git(origin, 'show', 'main:notices.json'))
  assert.equal(remote.promos[0].title, '교실로 ON 제미나이')
  assert.ok(git(origin, 'ls-tree', '-r', '--name-only', 'main').includes('media/' + name))

  enabled = false
  for (const path of [
    '/__dev/popups/',
    '/__dev/popups/config',
    '/__dev/popups/editor.js',
    '/__dev/popups/media',
    '/__dev/popups/publish',
  ])
    assert.equal((await request(path)).status, 404)
  assert.equal((await request('/__dev/popups/config', options)).status, 404)
})

test('the web server asks GitHub only after 5 minutes, with the ETag, and keeps the last good list', async () => {
  const asked = []
  let body = JSON.stringify(list([popup()], [promo()]))
  let tag = '"one"'
  let broken = false
  const fetchImpl = async (url, init) => {
    const ifNone = new Headers(init?.headers).get('If-None-Match')
    asked.push({ url, ifNone })
    if (broken) throw new Error('offline')
    if (url.endsWith('.png')) return new Response(Buffer.from('png'))
    if (ifNone === tag) return new Response(null, { status: 304 })
    return new Response(body, { headers: { etag: tag } })
  }
  let clock = 0
  const feed = createNoticeFeed({ base: 'https://raw.test/', fetchImpl, now: () => clock })
  assert.equal((await feed.list()).promos[0].id, 'promo-1')
  await feed.list()
  assert.equal(asked.length, 1)
  clock += 5 * 60 * 1000
  await feed.list()
  assert.equal(asked.at(-1).ifNone, '"one"')
  // a broken list is not taken; the last good one stays
  body = '{"version":1,"popups":[{"id":"../x"}]}'
  tag = '"two"'
  clock += 5 * 60 * 1000
  assert.equal((await feed.list()).popups[0].id, 'notice-1')
  broken = true
  clock += 5 * 60 * 1000
  assert.equal((await feed.list()).promos.length, 1)
  broken = false
  const name = '0f8fad5b-d9cb-469f-a165-70867728950e.png'
  assert.equal(String(await feed.picture(name)), 'png')
  await feed.picture(name)
  assert.equal(asked.filter((a) => a.url.endsWith('.png')).length, 1)
  assert.equal(await feed.picture('../secret.png'), null)
})
