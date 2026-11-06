const LOCAL_MEDIA =
  /^\/__web\/popup-media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|gif)$/i
let dialogNumber = 0

function hasControlChar(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function safeUrl(value) {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (LOCAL_MEDIA.test(raw)) return raw
  if (!/^https:\/\//i.test(raw) || /[\s\\]/.test(raw) || hasControlChar(raw)) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

function youtubeUrl(value) {
  const safe = safeUrl(value)
  if (!safe || safe.startsWith('/')) return null
  const url = new URL(safe)
  if (url.port) return null
  let id
  if (url.hostname === 'youtu.be') {
    id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1]
  } else if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
    ].includes(url.hostname)
  ) {
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/)?.[1]
  }
  return /^[\w-]{11}$/.test(id || '')
    ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`
    : null
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function dismissed(id) {
  try {
    return localStorage.getItem(`pp-hide:${id}`) === today()
  } catch {
    return false
  }
}

function ensureStyles() {
  if (document.querySelector('link[data-popup-styles], link[href="/__web/announcements.css"]'))
    return
  const link = element('link')
  link.rel = 'stylesheet'
  link.href = '/__web/announcements.css'
  link.dataset.popupStyles = ''
  document.head.append(link)
}

function appendMedia(container, item) {
  if (!item.mediaType || item.mediaType === 'none') return
  const url = item.mediaType === 'youtube' ? youtubeUrl(item.mediaUrl) : safeUrl(item.mediaUrl)
  const failure = () => {
    container.replaceChildren(
      element(
        'p',
        'pp-media-error',
        '미디어를 표시할 수 없습니다. 주소와 연결 상태를 확인해 주세요.',
      ),
    )
  }
  if (!url) {
    failure()
    return
  }
  let media
  if (item.mediaType === 'image') {
    media = element('img')
    media.alt = item.title || '안내 이미지'
    media.decoding = 'async'
    media.referrerPolicy = 'no-referrer'
  } else if (item.mediaType === 'youtube') {
    media = element('iframe')
    media.title = `${item.title || '안내'} 동영상`
    media.allow = 'fullscreen; encrypted-media; picture-in-picture'
    media.allowFullscreen = true
    media.referrerPolicy = 'strict-origin-when-cross-origin'
    media.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation')
  } else if (item.mediaType === 'video') {
    media = element('video')
    media.controls = true
    media.playsInline = true
    media.preload = 'metadata'
    media.muted = true
    media.setAttribute('aria-label', `${item.title || '안내'} 동영상`)
  } else return
  media.addEventListener('error', failure, { once: true })
  media.src = url
  container.append(media)
}

// Returns the dialog so callers may close it programmatically.
export function showPopup(item, { preview = false, onClose } = {}) {
  ensureStyles()
  const previousFocus = document.activeElement
  const dialog = element('dialog', 'pp-dialog')
  const titleId = `pp-title-${++dialogNumber}`
  dialog.setAttribute('aria-labelledby', titleId)
  const header = element('header', 'pp-header')
  header.append(element('span', 'pp-eyebrow', preview ? '저장 전 미리보기' : '새로운 소식'))
  const close = element('button', 'pp-icon-close', '×')
  close.type = 'button'
  close.setAttribute('aria-label', '팝업 닫기')
  close.autofocus = true
  close.addEventListener('click', () => dialog.close())
  header.append(close)
  const content = element('div', 'pp-content')
  const title = element('h2', 'pp-title', item.title || '안내')
  title.id = titleId
  content.append(title)
  if (item.body) content.append(element('p', 'pp-body', item.body))
  if (item.mediaType && item.mediaType !== 'none') {
    const media = element('div', 'pp-media')
    appendMedia(media, item)
    content.append(media)
  }
  const linkUrl = safeUrl(item.linkUrl)
  if (linkUrl) {
    const link = element('a', 'pp-link', item.linkLabel || '자세히 보기')
    link.href = linkUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.setAttribute('aria-label', `${item.linkLabel || '자세히 보기'} (새 창)`)
    content.append(link)
  }
  const footer = element('footer', 'pp-footer')
  const hide = element('input')
  hide.type = 'checkbox'
  if (!preview) {
    const label = element('label', 'pp-hide')
    label.append(hide, document.createTextNode('오늘 하루 보지 않기'))
    footer.append(label)
  } else
    footer.append(element('span', 'pp-preview-note', '방문자의 숨김 설정에는 영향이 없습니다.'))
  const done = element('button', 'pp-close', '닫기')
  done.type = 'button'
  done.addEventListener('click', () => dialog.close())
  footer.append(done)
  dialog.append(header, content, footer)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dialog.close()
  })
  dialog.addEventListener(
    'close',
    () => {
      if (!preview && hide.checked && item.id) {
        try {
          localStorage.setItem(`pp-hide:${item.id}`, today())
        } catch {
          // Storage may be unavailable in private or restricted browsing.
        }
      }
      dialog.querySelectorAll('video').forEach((video) => video.pause())
      dialog.remove()
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function')
        previousFocus.focus({ preventScroll: true })
      onClose?.()
    },
    { once: true },
  )
  document.body.append(dialog)
  try {
    dialog.showModal()
    close.focus({ preventScroll: true })
  } catch (error) {
    dialog.remove()
    throw error
  }
  return dialog
}

function waitForOpening() {
  return new Promise((resolve) => {
    const started = performance.now()
    const check = () => {
      const root = document.documentElement
      const overlay = document.querySelector('.opening, #opening')
      const style = overlay && getComputedStyle(overlay)
      const visible =
        style &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0
      if ((!root.classList.contains('op') && !visible) || performance.now() - started >= 7900)
        resolve()
      else setTimeout(check, 100)
    }
    check()
  })
}

async function init() {
  const placement = document.documentElement.dataset.popupPlacement
  if (!['home', 'app'].includes(placement)) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const [response] = await Promise.all([
      fetch('/__web/announcements.json', {
        signal: controller.signal,
        cache: 'no-cache',
        credentials: 'same-origin',
      }),
      waitForOpening(),
    ])
    if (!response.ok) return
    const config = await response.json()
    if (config.version !== 1 || !Array.isArray(config.items)) return
    for (const item of config.items.slice(0, 12)) {
      if (
        !item ||
        item.enabled !== true ||
        !['both', placement].includes(item.placement) ||
        typeof item.id !== 'string' ||
        dismissed(item.id)
      )
        continue
      await new Promise((resolve) => showPopup(item, { onClose: resolve }))
    }
  } catch {
    // Announcements must never prevent the host application from opening.
  } finally {
    clearTimeout(timeout)
  }
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', init, { once: true })
else void init()
