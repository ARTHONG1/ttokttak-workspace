import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

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
export function normalizePopups(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.items) || value.items.length > 12)
    fail('팝업은 최대 12개까지 저장할 수 있어요.')
  const ids = new Set()
  const items = value.items.map((raw) => {
    if (!raw || typeof raw !== 'object') fail('팝업 형식이 올바르지 않아요.')
    const id = text(raw.id, 80, '식별자')
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) fail('팝업 식별자가 중복되거나 잘못됐어요.')
    ids.add(id)
    if (typeof raw.enabled !== 'boolean') fail('표시 여부를 확인해 주세요.')
    const title = text(raw.title, 120, '제목'),
      body = text(raw.body, 4000, '내용')
    const mediaType = raw.mediaType,
      placement = raw.placement
    if (
      !['none', 'image', 'youtube', 'video'].includes(mediaType) ||
      !['home', 'app', 'both'].includes(placement)
    )
      fail('미디어 또는 표시 위치를 확인해 주세요.')
    const mediaUrl = mediaType === 'none' ? '' : text(raw.mediaUrl, 2048, '미디어 주소')
    if (mediaType === 'youtube' && !youtube(mediaUrl))
      fail('올바른 유튜브 영상 주소를 넣어 주세요.')
    if (
      ['image', 'video'].includes(mediaType) &&
      !https(mediaUrl) &&
      !(
        mediaType === 'image' &&
        /^\/__web\/popup-media\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(mediaUrl)
      )
    )
      fail('HTTPS 미디어 주소 또는 업로드한 이미지를 사용해 주세요.')
    if (!title && !body && mediaType === 'none') fail('제목, 내용, 미디어 중 하나는 넣어 주세요.')
    const linkUrl = text(raw.linkUrl, 2048, '버튼 주소'),
      linkLabel = text(raw.linkLabel, 80, '버튼 문구')
    if (linkUrl && (!https(linkUrl) || !linkLabel)) fail('버튼에는 HTTPS 주소와 문구가 필요해요.')
    return {
      id,
      enabled: raw.enabled,
      title,
      body,
      mediaType,
      mediaUrl,
      linkUrl,
      linkLabel,
      placement,
    }
  })
  return { version: 1, items }
}
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function createPopupStore(file) {
  let queue = Promise.resolve()
  async function read() {
    let data
    try {
      data = normalizePopups(JSON.parse(await readFile(file, 'utf8')))
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw popupError('저장된 팝업 파일을 읽지 못했어요. 파일을 확인해 주세요.', 500)
      data = { version: 1, items: [] }
    }
    return { ...data, revision: digest(data) }
  }
  function save(input) {
    const work = queue.then(async () => {
      const data = normalizePopups(input)
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
