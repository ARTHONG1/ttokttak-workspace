import { showPopup } from '/__web/announcements.js'

// The local preview's 알림·홍보 관리 screen (popup-routes.mjs): the popups and the home's promos
// of the 알림·홍보 목록. 저장 writes the checked-out notice repository, which this preview
// already shows; 게시하기 pushes it to GitHub, where the web and the desktop app read it.

const $ = (id) => document.getElementById(id)
const form = $('popup-form')
const LIMIT = 12
const COMMON = ['enabled', 'title', 'linkLabel', 'linkUrl', 'startsAt', 'endsAt']
const FIELDS = {
  popups: [...COMMON, 'body', 'mediaType', 'mediaUrl'],
  promos: [...COMMON, 'text', 'mediaType', 'mediaUrl'],
}
const KIND_NAME = { popups: '팝업', promos: '홈 홍보 칸' }
const PLACE_NAME = { home: '소개', app: '웹앱', desktop: '데스크톱' }
const localMedia =
  /^\/__web\/popup-media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|gif)$/i
let lists = { popups: [], promos: [] }
let kind = 'popups'
const selected = { popups: null, promos: null }
let revision
let baseline = ''
let pending = null
let loaded = false
let busy = false

const items = () => lists[kind]
function current() {
  return items().find((item) => item.id === selected[kind])
}
function dirty() {
  return loaded && JSON.stringify(lists) !== baseline
}
function message(id, text) {
  $(id).textContent = text
  $(id).hidden = !text
}
const status = (text) => message('status', text)
const error = (text) => message('error', text)

function savedStatus() {
  if (dirty()) return '저장하지 않은 변경 사항이 있습니다.'
  if (pending === true) return '저장했어요. 게시하면 웹과 데스크톱 앱에 반영됩니다.'
  if (pending === false) return '게시된 내용과 같습니다.'
  return '저장된 내용과 같습니다.'
}

function controls() {
  $('save').disabled = !loaded || busy || !dirty()
  $('publish').disabled = !loaded || busy || dirty() || pending !== true
  $('publish').textContent = busy ? '처리 중…' : '게시하기'
  $('add').disabled = !loaded || busy || items().length >= LIMIT
  $('reload').disabled = busy
  $('fields').disabled = !loaded || busy || !current()
  $('popup-list')
    .querySelectorAll('button')
    .forEach((button) => {
      button.disabled = busy || button.dataset.boundary === 'true'
    })
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.disabled = busy
  })
  form.setAttribute('aria-busy', String(busy))
}

function changed() {
  error('')
  message('form-error', '')
  form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'))
  status(savedStatus())
  renderList()
  renderPromoPreview()
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

function period(item) {
  if (!item.startsAt && !item.endsAt) return '기간 없음'
  return (item.startsAt || '지금') + ' ~ ' + (item.endsAt || '계속')
}

function renderList() {
  const list = items()
  $('count').textContent = list.length + ' / ' + LIMIT
  $('list-name').textContent = KIND_NAME[kind]
  $('list-hint').textContent =
    kind === 'popups'
      ? '위에서부터 차례로 표시됩니다.'
      : '홈 맨 아래에 두 개씩 보이고, 홈을 열 때마다 다음 순서로 바뀝니다.'
  $('list-empty').hidden = !loaded || list.length > 0
  $('popup-list').replaceChildren()
  list.forEach((item, index) => {
    const row = document.createElement('li')
    row.className = 'pe-list-row'
    row.classList.toggle('is-selected', item.id === selected[kind])
    const select = button('', 'pe-list-select', () => {
      selectItem(item.id)
      form.elements.namedItem('title').focus()
    })
    select.dataset.itemId = item.id
    select.setAttribute('aria-current', item.id === selected[kind] ? 'true' : 'false')
    const title = document.createElement('strong')
    title.textContent = index + 1 + '. ' + (item.title.trim() || '제목 없는 항목')
    const meta = document.createElement('span')
    meta.className = 'pe-list-meta'
    const indicator = document.createElement('span')
    indicator.className = item.enabled ? 'pe-state is-on' : 'pe-state'
    indicator.textContent = item.enabled ? '보임' : '숨김'
    const where =
      kind === 'popups'
        ? item.placements.map((place) => PLACE_NAME[place]).join(' · ') || '보일 곳 없음'
        : period(item)
    meta.append(indicator, document.createTextNode(where))
    select.append(title, meta)
    const moves = document.createElement('div')
    moves.className = 'pe-moves'
    for (const [offset, text, label] of [
      [-1, '↑', '위로'],
      [1, '↓', '아래로'],
    ]) {
      const move = button(text, 'pe-move', () => {
        const next = index + offset
        if (busy || next < 0 || next >= list.length) return
        ;[list[index], list[next]] = [list[next], list[index]]
        changed()
      })
      move.setAttribute(
        'aria-label',
        (item.title.trim() || '제목 없는 항목') + ' ' + label + ' 이동',
      )
      move.dataset.boundary = String(index + offset < 0 || index + offset >= list.length)
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
  const help = {
    image:
      kind === 'promos'
        ? '아래에서 그림 파일을 올리세요.'
        : 'HTTPS 그림 주소를 넣거나 아래에서 파일을 올리세요. 데스크톱 앱에는 올린 그림만 보입니다.',
    youtube: 'YouTube 동영상·공유·Shorts 주소를 넣으세요. 누르기 전에는 재생되지 않습니다.',
    video: 'mp4처럼 브라우저가 바로 재생하는 HTTPS 동영상 주소를 넣으세요.',
  }
  $('media-help').textContent = help[item?.mediaType] ?? ''
}

/** the 11-character id of a YouTube address, or null */
function youtubeIdOf(value) {
  if (!validYoutube(value)) return null
  const url = new URL(value)
  if (url.hostname === 'youtu.be') return url.pathname.slice(1, 12)
  if (url.pathname === '/watch') return url.searchParams.get('v')
  return url.pathname.split('/')[2]
}

function renderPromoPreview() {
  const item = current()
  if (kind !== 'promos' || !item) return
  const picture = $('promo-picture')
  picture.replaceChildren()
  const url = item.mediaUrl.trim()
  const youtube = item.mediaType === 'youtube' ? youtubeIdOf(url) : null
  if ((item.mediaType === 'image' && localMedia.test(url)) || youtube) {
    const img = document.createElement('img')
    img.src = youtube ? 'https://i.ytimg.com/vi/' + youtube + '/hqdefault.jpg' : url
    img.alt = ''
    picture.append(img)
  } else if (item.mediaType === 'video' && validUrl(url)) {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.preload = 'metadata'
    picture.append(video)
  } else picture.textContent = item.title.trim().slice(0, 1)
  const plays = Boolean(youtube) || (item.mediaType === 'video' && validUrl(url))
  if (plays) {
    const badge = document.createElement('span')
    badge.className = 'pe-promo-play'
    badge.textContent = '▶'
    picture.append(badge)
  }
  $('promo-title').textContent = item.title.trim() || '제목'
  $('promo-text').textContent = item.text
  $('promo-link').textContent = plays
    ? '영상 보기'
    : item.linkUrl
      ? (item.linkLabel || '보러 가기') + ' ↗'
      : ''
}

function showKind() {
  document.querySelectorAll('[data-kind]').forEach((node) => {
    node.hidden = node.dataset.kind !== kind
  })
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === kind))
  })
  $('editor-kind').textContent = KIND_NAME[kind] + ' 편집'
}

function selectItem(id) {
  if (busy) return
  selected[kind] = id
  const item = current()
  form.hidden = !item
  $('empty').hidden = !!item
  message('form-error', '')
  message('upload-status', '')
  $('image-file').value = ''
  showKind()
  for (const name of FIELDS[kind]) {
    const input = form.elements.namedItem(name)
    input.removeAttribute('aria-invalid')
    if (name === 'enabled') input.checked = item?.enabled === true
    else input.value = item?.[name] ?? ''
  }
  form.querySelectorAll('[name="placements"]').forEach((box) => {
    box.checked = kind === 'popups' && !!item?.placements.includes(box.value)
  })
  $('editor-title').textContent = item?.title.trim() || '새 항목'
  mediaVisibility()
  renderList()
  renderPromoPreview()
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
  if (!/^https:\/\//i.test(value) || /[\s\\]/.test(value) || hasControlChar(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function validYoutube(value) {
  if (!validUrl(value)) return false
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

function validate(item, itemKind) {
  if (!item.title.trim()) return ['title', '제목을 입력해 주세요. 목록에도 이 제목이 보입니다.']
  if (itemKind === 'popups') {
    if (item.placements.length === 0) return ['placements', '보일 곳을 하나 이상 골라 주세요.']
    if (!item.body.trim() && item.mediaType === 'none')
      return ['body', '전할 본문 또는 그림·영상을 넣어 주세요.']
  }
  if (item.mediaType !== 'none') {
    const url = item.mediaUrl.trim()
    if (!url) return ['mediaUrl', '미디어 주소를 넣거나 그림 파일을 올려 주세요.']
    if (item.mediaType === 'image' && itemKind === 'promos' && !localMedia.test(url))
      return ['mediaUrl', '홍보 칸 그림은 아래에서 파일을 올려 주세요.']
    if (!validUrl(url) && !(item.mediaType === 'image' && localMedia.test(url)))
      return ['mediaUrl', 'HTTPS 주소 또는 이 화면에서 올린 그림을 사용해 주세요.']
    if (item.mediaType === 'youtube' && !validYoutube(url))
      return ['mediaUrl', '올바른 YouTube 동영상 주소를 넣어 주세요. 영상 ID는 11자리입니다.']
  }
  if (item.linkLabel.trim() && !item.linkUrl.trim())
    return ['linkUrl', '버튼을 누르면 열릴 연결 주소를 넣어 주세요.']
  if (item.linkUrl.trim() && !validUrl(item.linkUrl.trim()))
    return ['linkUrl', '연결 주소는 https://로 시작해야 합니다.']
  if (item.linkUrl.trim() && !item.linkLabel.trim())
    return ['linkLabel', '버튼에 보일 문구를 넣어 주세요.']
  if (item.startsAt && item.endsAt && item.endsAt < item.startsAt)
    return ['endsAt', '끝나는 날이 시작일보다 앞서요.']
  return null
}

function showValidation(itemKind, item, issue) {
  kind = itemKind
  selectItem(item.id)
  message('form-error', issue[1])
  const input =
    issue[0] === 'placements'
      ? form.querySelector('[name="placements"]')
      : form.elements.namedItem(issue[0])
  input.setAttribute('aria-invalid', 'true')
  input.focus()
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
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
        '다른 화면에서 목록이 바뀌었습니다. 작성한 내용을 복사해 둔 뒤 ‘다시 불러오기’를 눌러 주세요.',
      )
    if (!response.ok)
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : '요청을 처리하지 못했습니다 (' + response.status + ').',
      )
    return result
  } catch (failure) {
    if (failure.name === 'AbortError')
      throw new Error('응답 시간이 지났습니다. 입력한 내용은 그대로 있습니다.', { cause: failure })
    if (failure instanceof TypeError)
      throw new Error('로컬 서버에 연결할 수 없습니다. 서버 상태를 확인해 주세요.', {
        cause: failure,
      })
    throw failure
  } finally {
    clearTimeout(timer)
  }
}

function take(config) {
  if (
    !config ||
    config.version !== 1 ||
    !Array.isArray(config.popups) ||
    !Array.isArray(config.promos) ||
    !Object.hasOwn(config, 'revision')
  )
    throw new Error('목록 형식이 올바르지 않아 멈췄습니다.')
  lists = { popups: config.popups, promos: config.promos }
  revision = config.revision
  pending = config.pending ?? null
  baseline = JSON.stringify(lists)
}

async function load() {
  if (busy) return
  if (dirty() && !window.confirm('저장하지 않은 변경 사항을 버리고 다시 불러올까요?')) return
  busy = true
  controls()
  error('')
  status('목록을 불러오는 중입니다…')
  try {
    take(await request('/__dev/popups/config'))
    loaded = true
    for (const each of ['popups', 'promos']) {
      const list = lists[each]
      if (!list.some((item) => item.id === selected[each])) selected[each] = list[0]?.id ?? null
    }
    status(savedStatus())
  } catch (failure) {
    loaded = false
    error(failure.message)
    status('목록을 불러오지 못했습니다. 다시 불러온 뒤 편집할 수 있습니다.')
  } finally {
    busy = false
    selectItem(selected[kind])
  }
}

form.addEventListener('submit', (event) => event.preventDefault())
form.addEventListener('input', (event) => {
  const item = current()
  const name = event.target.name
  if (!item || busy) return
  if (name === 'placements') {
    item.placements = [...form.querySelectorAll('[name="placements"]')]
      .filter((box) => box.checked)
      .map((box) => box.value)
  } else if (FIELDS[kind].includes(name)) {
    item[name] = name === 'enabled' ? event.target.checked : event.target.value
  } else return
  if (name === 'title') $('editor-title').textContent = item.title.trim() || '새 항목'
  if (name === 'mediaType') mediaVisibility()
  changed()
})

document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (busy) return
    kind = tab.dataset.tab
    selectItem(selected[kind])
  })
})

$('add').addEventListener('click', () => {
  if (!loaded || busy || items().length >= LIMIT) return
  const shared = {
    id: crypto.randomUUID(),
    enabled: false,
    title: '',
    linkUrl: '',
    linkLabel: '',
    startsAt: '',
    endsAt: '',
  }
  const item =
    kind === 'popups'
      ? {
          ...shared,
          body: '',
          mediaType: 'none',
          mediaUrl: '',
          placements: ['home', 'app', 'desktop'],
        }
      : { ...shared, text: '', mediaType: 'none', mediaUrl: '' }
  items().push(item)
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
      '‘' + (item.title.trim() || '제목 없는 항목') + '’을 삭제할까요? 저장해야 목록에 반영됩니다.',
    )
  )
    return
  const list = items()
  const index = list.indexOf(item)
  list.splice(index, 1)
  selectItem(list[Math.min(index, list.length - 1)]?.id ?? null)
  changed()
})

$('preview').addEventListener('click', () => {
  const item = current()
  if (!item || busy) return
  const issue = validate(item, kind)
  if (issue) return showValidation(kind, item, issue)
  try {
    showPopup({ ...item }, { preview: true })
  } catch {
    message('form-error', '팝업 미리보기를 열 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.')
  }
})

$('save').addEventListener('click', async () => {
  if (!loaded || busy || !dirty()) return
  for (const each of ['popups', 'promos']) {
    for (const item of lists[each]) {
      const issue = validate(item, each)
      if (issue) return showValidation(each, item, issue)
    }
  }
  busy = true
  controls()
  error('')
  status('저장하는 중입니다…')
  try {
    take(
      await request('/__dev/popups/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, ...lists, revision }),
      }),
    )
    status(savedStatus())
  } catch (failure) {
    error(failure.message)
    status('저장을 확인하지 못했습니다. 작성한 내용은 이 화면에 그대로 있습니다.')
  } finally {
    busy = false
    selectItem(selected[kind])
  }
})

$('publish').addEventListener('click', async () => {
  if (!loaded || busy || dirty() || pending !== true) return
  busy = true
  controls()
  error('')
  status('GitHub에 올리는 중입니다…')
  try {
    const result = await request('/__dev/popups/publish', { method: 'POST' })
    pending = result.pending ?? false
    status('게시했어요. 몇 분 안에 웹과 데스크톱 앱에 반영됩니다.')
  } catch (failure) {
    error(failure.message)
    status('게시하지 못했습니다. 저장한 내용은 그대로 있습니다.')
  } finally {
    busy = false
    controls()
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
    message('form-error', 'PNG, JPG, WebP, GIF 그림 중 8 MiB 이하의 파일을 골라 주세요.')
    event.target.value = ''
    return
  }
  busy = true
  controls()
  message('form-error', '')
  message('upload-status', '그림을 올리는 중입니다…')
  try {
    const result = await request('/__dev/popups/media', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (typeof result.url !== 'string' || !localMedia.test(result.url))
      throw new Error('올린 그림의 주소를 받지 못했습니다.')
    item.mediaUrl = result.url
    form.elements.namedItem('mediaUrl').value = result.url
    message('upload-status', '그림을 올렸습니다. 저장을 눌러 반영하세요.')
  } catch (failure) {
    message('form-error', failure.message)
    message('upload-status', '올리지 못했습니다. 다시 파일을 골라 주세요.')
  } finally {
    busy = false
    event.target.value = ''
    mediaVisibility()
    changed()
  }
})

$('reload').addEventListener('click', load)
window.addEventListener('beforeunload', (event) => {
  if (!dirty() && !busy) return
  event.preventDefault()
  event.returnValue = ''
})
void load()
