import { showPopup } from '/__web/announcements.js'

const $ = (id) => document.getElementById(id)
const form = $('popup-form')
const fieldNames = [
  'enabled',
  'placement',
  'title',
  'body',
  'mediaType',
  'mediaUrl',
  'linkLabel',
  'linkUrl',
]
const placements = { home: '홈', app: '앱', both: '홈 · 앱' }
const localMedia =
  /^\/__web\/popup-media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|gif)$/i
let items = []
let revision
let selectedId = null
let baseline = '[]'
let loaded = false
let busy = false

function current() {
  return items.find((item) => item.id === selectedId)
}
function dirty() {
  return JSON.stringify(items) !== baseline
}
function message(id, text) {
  $(id).textContent = text
  $(id).hidden = !text
}
function status(text) {
  message('status', text)
}
function error(text) {
  message('error', text)
}

function controls() {
  $('save').disabled = !loaded || busy || !dirty()
  $('save').textContent = busy ? '처리 중…' : '전체 저장'
  $('add').disabled = !loaded || busy || items.length >= 12
  $('reload').disabled = busy
  $('fields').disabled = !loaded || busy || !current()
  $('popup-list')
    .querySelectorAll('button')
    .forEach((button) => {
      button.disabled = busy || button.dataset.boundary === 'true'
    })
  form.setAttribute('aria-busy', String(busy))
}

function changed() {
  error('')
  message('form-error', '')
  for (const name of fieldNames) form.elements.namedItem(name).removeAttribute('aria-invalid')
  status(dirty() ? '저장하지 않은 변경 사항이 있습니다.' : '저장된 내용과 같습니다.')
  renderList()
  controls()
}

function button(text, className, action) {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = className
  node.textContent = text
  node.addEventListener('click', action)
  return node
}

function renderList() {
  $('count').textContent = `${items.length} / 12`
  $('list-empty').hidden = !loaded || items.length > 0
  $('popup-list').replaceChildren()
  items.forEach((item, index) => {
    const row = document.createElement('li')
    row.className = 'pe-list-row'
    row.classList.toggle('is-selected', item.id === selectedId)
    const select = button('', 'pe-list-select', () => {
      selectItem(item.id)
      form.elements.namedItem('title').focus()
    })
    select.dataset.itemId = item.id
    select.setAttribute('aria-current', item.id === selectedId ? 'true' : 'false')
    const title = document.createElement('strong')
    title.textContent = `${index + 1}. ${item.title.trim() || '제목 없는 팝업'}`
    const meta = document.createElement('span')
    meta.className = 'pe-list-meta'
    const indicator = document.createElement('span')
    indicator.className = item.enabled ? 'pe-state is-on' : 'pe-state'
    indicator.textContent = item.enabled ? '표시 중' : '표시 안 함'
    meta.append(indicator, document.createTextNode(placements[item.placement] || '위치 미설정'))
    select.append(title, meta)
    const moves = document.createElement('div')
    moves.className = 'pe-moves'
    for (const [offset, text, label] of [
      [-1, '↑', '위로'],
      [1, '↓', '아래로'],
    ]) {
      const move = button(text, 'pe-move', () => {
        if (busy) return
        const next = index + offset
        if (next < 0 || next >= items.length) return
        ;[items[index], items[next]] = [items[next], items[index]]
        changed()
        const moved = [...$('popup-list').querySelectorAll('.pe-list-select')].find(
          (node) => node.dataset.itemId === item.id,
        )
        moved?.focus()
      })
      move.setAttribute('aria-label', `${item.title.trim() || '제목 없는 팝업'} ${label} 이동`)
      move.dataset.boundary = String(index + offset < 0 || index + offset >= items.length)
      move.disabled = busy || move.dataset.boundary === 'true'
      moves.append(move)
    }
    row.append(select, moves)
    $('popup-list').append(row)
  })
}

function mediaVisibility() {
  const item = current()
  $('media-fields').hidden = !item || item.mediaType === 'none'
  $('upload-area').hidden = item?.mediaType !== 'image'
  $('media-help').textContent =
    item?.mediaType === 'youtube'
      ? 'YouTube의 동영상·공유·Shorts 주소를 입력하세요. 영상은 자동 재생되지 않습니다.'
      : 'HTTPS 주소 또는 업로드한 이미지 주소를 사용하세요. 영상은 자동 재생되지 않습니다.'
}

function selectItem(id) {
  if (busy) return
  selectedId = id
  const item = current()
  form.hidden = !item
  $('empty').hidden = !!item
  message('form-error', '')
  message('upload-status', '')
  $('image-file').value = ''
  for (const name of fieldNames) {
    const input = form.elements.namedItem(name)
    input.removeAttribute('aria-invalid')
    if (name === 'enabled') input.checked = item?.enabled === true
    else input.value = item?.[name] ?? ''
  }
  $('editor-title').textContent = item?.title.trim() || '새 팝업'
  mediaVisibility()
  renderList()
  controls()
}

function hasControlChar(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function validUrl(value) {
  if (localMedia.test(value)) return true
  if (!/^https:\/\//i.test(value) || /[\s\\]/.test(value) || hasControlChar(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function validYoutube(value) {
  if (!validUrl(value) || value.startsWith('/')) return false
  const url = new URL(value)
  if (url.port) return false
  if (url.hostname === 'youtu.be') return /^\/[\w-]{11}\/?$/.test(url.pathname)
  if (
    ![
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
    ].includes(url.hostname)
  )
    return false
  return url.pathname === '/watch'
    ? /^[\w-]{11}$/.test(url.searchParams.get('v') || '')
    : /^\/(?:embed|shorts|live)\/[\w-]{11}\/?$/.test(url.pathname)
}

function validate(item) {
  if (!item.title.trim()) return ['title', '제목을 입력해 주세요. 목록과 팝업 상단에 표시됩니다.']
  if (!item.body.trim() && item.mediaType === 'none')
    return ['body', '방문자에게 전할 본문 또는 이미지·영상을 넣어 주세요.']
  if (item.mediaType !== 'none') {
    const url = item.mediaUrl.trim()
    if (!url) return ['mediaUrl', '미디어 주소를 입력하거나 이미지 파일을 올려 주세요.']
    if (!validUrl(url))
      return ['mediaUrl', 'HTTPS 주소 또는 이 편집기에서 업로드한 이미지 주소를 사용해 주세요.']
    if (item.mediaType === 'youtube' && !validYoutube(url))
      return ['mediaUrl', '올바른 YouTube 동영상 주소를 입력해 주세요. 영상 ID는 11자리입니다.']
  }
  if (item.linkLabel.trim() && !item.linkUrl.trim())
    return ['linkUrl', '버튼을 누르면 열릴 연결 주소를 입력해 주세요.']
  if (item.linkUrl.trim() && !validUrl(item.linkUrl.trim()))
    return ['linkUrl', '연결 주소는 HTTPS 주소 또는 업로드한 이미지 주소여야 합니다.']
  return null
}

function showValidation(item, issue) {
  selectItem(item.id)
  message('form-error', issue[1])
  const input = form.elements.namedItem(issue[0])
  input.setAttribute('aria-invalid', 'true')
  input.focus()
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    let result
    try {
      result = await response.json()
    } catch {
      throw new Error('서버 응답을 읽을 수 없습니다. 로컬 미리보기 서버를 확인해 주세요.')
    }
    if (response.status === 409)
      throw new Error(
        '다른 화면에서 설정이 변경되었습니다. 작성한 내용을 복사해 둔 뒤 ‘다시 불러오기’를 눌러 최신 내용에 반영해 주세요.',
      )
    if (!response.ok)
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : `요청을 처리하지 못했습니다 (${response.status}).`,
      )
    return result
  } catch (failure) {
    if (failure.name === 'AbortError')
      throw new Error(
        '응답 시간이 초과되었습니다. 입력한 내용은 유지됩니다. 저장 요청이었다면 서버 반영 여부를 다시 확인해 주세요.',
        { cause: failure },
      )
    if (failure instanceof TypeError)
      throw new Error('로컬 서버에 연결할 수 없습니다. 서버 상태를 확인하고 다시 시도해 주세요.', {
        cause: failure,
      })
    throw failure
  } finally {
    clearTimeout(timer)
  }
}

function checkConfig(config) {
  if (
    !config ||
    config.version !== 1 ||
    !Array.isArray(config.items) ||
    config.items.length > 12 ||
    !Object.hasOwn(config, 'revision')
  )
    throw new Error('설정 형식이 올바르지 않아 저장을 중지했습니다.')
  const ids = new Set()
  for (const item of config.items) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.enabled !== 'boolean' ||
      !Object.hasOwn(placements, item.placement) ||
      !['none', 'image', 'youtube', 'video'].includes(item.mediaType) ||
      ['title', 'body', 'mediaUrl', 'linkLabel', 'linkUrl'].some(
        (key) => typeof item[key] !== 'string',
      )
    )
      throw new Error('읽어 온 팝업 설정에 잘못된 항목이 있어 저장을 중지했습니다.')
    ids.add(item.id)
  }
}

async function load() {
  if (busy) return
  if (dirty() && !window.confirm('저장하지 않은 변경 사항을 버리고 다시 불러올까요?')) return
  busy = true
  controls()
  error('')
  status('설정을 불러오는 중입니다…')
  try {
    const config = await request('/__dev/popups/config')
    checkConfig(config)
    items = config.items
    revision = config.revision
    baseline = JSON.stringify(items)
    loaded = true
    selectedId = items.some((item) => item.id === selectedId) ? selectedId : (items[0]?.id ?? null)
    status(
      items.length
        ? '프로젝트에 저장된 설정을 불러왔습니다.'
        : '등록된 팝업이 없습니다. 첫 팝업을 추가해 보세요.',
    )
  } catch (failure) {
    loaded = false
    error(failure.message)
    status('설정을 불러오지 못했습니다. 다시 불러온 뒤 편집할 수 있습니다.')
  } finally {
    busy = false
    selectItem(selectedId)
  }
}

form.addEventListener('submit', (event) => event.preventDefault())
form.addEventListener('input', (event) => {
  const item = current()
  const name = event.target.name
  if (!item || busy || !fieldNames.includes(name)) return
  item[name] = name === 'enabled' ? event.target.checked : event.target.value
  if (name === 'title') $('editor-title').textContent = item.title.trim() || '새 팝업'
  if (name === 'mediaType') mediaVisibility()
  changed()
})

$('add').addEventListener('click', () => {
  if (!loaded || busy || items.length >= 12) return
  const item = {
    id: crypto.randomUUID(),
    enabled: false,
    title: '',
    body: '',
    mediaType: 'none',
    mediaUrl: '',
    linkUrl: '',
    linkLabel: '',
    placement: 'both',
  }
  items.push(item)
  selectItem(item.id)
  changed()
  form.elements.namedItem('title').focus()
})

$('delete').addEventListener('click', () => {
  const item = current()
  if (
    !item ||
    busy ||
    !window.confirm(
      `‘${item.title.trim() || '제목 없는 팝업'}’을 삭제할까요? 전체 저장을 누르면 프로젝트에도 반영됩니다.`,
    )
  )
    return
  const index = items.indexOf(item)
  items.splice(index, 1)
  selectItem(items[Math.min(index, items.length - 1)]?.id ?? null)
  changed()
  if (current()) form.elements.namedItem('title').focus()
  else $('add').focus()
})

$('preview').addEventListener('click', () => {
  const item = current()
  if (!item || busy) return
  const issue = validate(item)
  if (issue) return showValidation(item, issue)
  message('form-error', '')
  try {
    showPopup({ ...item }, { preview: true })
  } catch {
    message('form-error', '팝업 미리보기를 열 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.')
  }
})

$('save').addEventListener('click', async () => {
  if (!loaded || busy || !dirty()) return
  for (const item of items) {
    const issue = validate(item)
    if (issue) return showValidation(item, issue)
  }
  busy = true
  controls()
  error('')
  status('프로젝트에 저장하는 중입니다…')
  try {
    const config = await request('/__dev/popups/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, items, revision }),
    })
    checkConfig(config)
    items = config.items
    revision = config.revision
    baseline = JSON.stringify(items)
    status('미리보기에 저장됨 · 공개 사이트에는 다음 배포 후 반영')
  } catch (failure) {
    error(failure.message)
    status('저장을 확인하지 못했습니다. 작성한 내용은 이 화면에 유지됩니다.')
  } finally {
    busy = false
    selectItem(selectedId)
  }
})

$('image-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]
  const item = current()
  if (!file || !item || busy) return
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
    file.size > 8 * 1024 * 1024 ||
    file.size === 0
  ) {
    message(
      'form-error',
      'PNG, JPG, WebP, GIF 이미지 중 8 MiB 이하의 비어 있지 않은 파일을 선택해 주세요.',
    )
    event.target.value = ''
    return
  }
  busy = true
  controls()
  message('form-error', '')
  message('upload-status', '이미지를 업로드하는 중입니다…')
  try {
    const result = await request('/__dev/popups/media', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (typeof result.url !== 'string' || !localMedia.test(result.url))
      throw new Error('업로드 응답에 올바른 이미지 주소가 없습니다.')
    item.mediaUrl = result.url
    form.elements.namedItem('mediaUrl').value = result.url
    changed()
    message('upload-status', '이미지를 올렸습니다. 전체 저장을 눌러 팝업에 반영하세요.')
  } catch (failure) {
    message('form-error', failure.message)
    message('upload-status', '업로드하지 못했습니다. 다시 파일을 선택해 주세요.')
  } finally {
    busy = false
    event.target.value = ''
    controls()
  }
})

$('reload').addEventListener('click', load)
window.addEventListener('beforeunload', (event) => {
  if (!dirty() && !busy) return
  event.preventDefault()
  event.returnValue = ''
})
void load()
