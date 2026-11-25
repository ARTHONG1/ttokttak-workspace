import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

// The 알림·홍보 목록 (notices.json in the public repository ARTHONG1/ttokttak-notice): the
// popups and the home's promos. The local preview's 관리 screen saves it here, strictly; the
// apps read it again with their own checks (apps/shell/src/shared/notices.ts).

export function popupError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}
const fail = (message) => {
  throw popupError(message)
}
const text = (value, max, name) => {
  if (typeof value !== 'string' || value.length > max) fail(name + '을 확인해 주세요.')
  return value.trim()
}
const UPLOADED = /^\/__web\/popup-media\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/
const PLACEMENTS = ['home', 'app', 'desktop']
export const NOTICE_LIMIT = 12

function https(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}
function youtube(value) {
  if (!https(value)) return false
  const u = new URL(value)
  if (u.port) return false
  if (u.hostname === 'youtu.be') return /^\/[\w-]{11}\/?$/.test(u.pathname)
  return (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
    ].includes(u.hostname) &&
    ((u.pathname === '/watch' && /^[\w-]{11}$/.test(u.searchParams.get('v') || '')) ||
      /^\/(?:shorts|embed|live)\/[\w-]{11}\/?$/.test(u.pathname))
  )
}
function days(raw) {
  const startsAt = text(raw.startsAt ?? '', 10, '시작일'),
    endsAt = text(raw.endsAt ?? '', 10, '끝나는 날')
  for (const day of [startsAt, endsAt])
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('날짜를 확인해 주세요.')
  if (startsAt && endsAt && endsAt < startsAt) fail('끝나는 날이 시작일보다 앞서요.')
  return { startsAt, endsAt }
}
function common(raw, ids) {
  if (!raw || typeof raw !== 'object') fail('항목 형식이 올바르지 않아요.')
  const id = text(raw.id, 80, '식별자')
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) fail('식별자가 중복되거나 잘못됐어요.')
  ids.add(id)
  if (typeof raw.enabled !== 'boolean') fail('표시 여부를 확인해 주세요.')
  const linkUrl = text(raw.linkUrl, 2048, '버튼 주소'),
    linkLabel = text(raw.linkLabel, 80, '버튼 문구')
  if (linkUrl && (!https(linkUrl) || !linkLabel)) fail('버튼에는 HTTPS 주소와 문구가 필요해요.')
  return { id, enabled: raw.enabled, title: text(raw.title, 120, '제목'), linkUrl, linkLabel }
}
function popup(raw, ids) {
  const base = common(raw, ids)
  const body = text(raw.body, 4000, '내용')
  const mediaType = raw.mediaType
  if (!['none', 'image', 'youtube', 'video'].includes(mediaType))
    fail('미디어 종류를 확인해 주세요.')
  const placements = PLACEMENTS.filter(
    (p) => Array.isArray(raw.placements) && raw.placements.includes(p),
  )
  if (placements.length === 0) fail('보일 곳을 하나 이상 골라 주세요.')
  const mediaUrl = mediaType === 'none' ? '' : text(raw.mediaUrl, 2048, '미디어 주소')
  if (mediaType === 'youtube' && !youtube(mediaUrl)) fail('올바른 유튜브 영상 주소를 넣어 주세요.')
  if (
    ['image', 'video'].includes(mediaType) &&
    !https(mediaUrl) &&
    !(mediaType === 'image' && UPLOADED.test(mediaUrl))
  )
    fail('HTTPS 미디어 주소 또는 올린 그림을 사용해 주세요.')
  if (!base.title && !body && mediaType === 'none')
    fail('제목, 내용, 미디어 중 하나는 넣어 주세요.')
  return { ...base, body, mediaType, mediaUrl, placements, ...days(raw) }
}
function promo(raw, ids) {
  const base = common(raw, ids)
  if (!base.title) fail('홍보 칸에는 제목이 필요해요.')
  const imageUrl = text(raw.imageUrl ?? '', 200, '그림')
  if (imageUrl && !UPLOADED.test(imageUrl))
    fail('홍보 칸 그림은 이 화면에서 올린 그림만 쓸 수 있어요.')
  return { ...base, text: text(raw.text ?? '', 300, '설명'), imageUrl, ...days(raw) }
}
export function normalizeNotices(value) {
  if (!value || value.version !== 1) fail('목록 형식이 올바르지 않아요.')
  const popups = Array.isArray(value.popups) ? value.popups : []
  const promos = Array.isArray(value.promos) ? value.promos : []
  if (popups.length > NOTICE_LIMIT || promos.length > NOTICE_LIMIT)
    fail('팝업과 홍보 칸은 각각 ' + NOTICE_LIMIT + '개까지 저장할 수 있어요.')
  const ids = new Set()
  return {
    version: 1,
    popups: popups.map((raw) => popup(raw, ids)),
    promos: promos.map((raw) => promo(raw, ids)),
  }
}
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function createNoticeStore(file) {
  let queue = Promise.resolve()
  async function read() {
    let data
    try {
      data = normalizeNotices(JSON.parse(await readFile(file, 'utf8')))
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw popupError('저장된 목록 파일을 읽지 못했어요. 파일을 확인해 주세요.', 500)
      data = { version: 1, popups: [], promos: [] }
    }
    return { ...data, revision: digest(data) }
  }
  function save(input) {
    const work = queue.then(async () => {
      const data = normalizeNotices(input)
      const current = await read()
      if (input.revision !== current.revision)
        throw popupError('다른 화면에서 변경됐어요. 새로고침 후 다시 수정해 주세요.', 409)
      await mkdir(dirname(file), { recursive: true })
      const temp = file + '.' + randomUUID() + '.tmp'
      try {
        await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
        await rename(temp, file)
      } finally {
        await rm(temp, { force: true }).catch(() => {})
      }
      return { ...data, revision: digest(data) }
    })
    queue = work.catch(() => {})
    return work
  }
  return { read, save }
}
