/* The browser side of the web edition: windows, views, dialogs and menus of the desktop app. */
;(function () {
  'use strict'
  var platform = /Mac|iPhone|iPad/.test(navigator.platform)
    ? 'darwin'
    : /Win/.test(navigator.platform)
      ? 'win32'
      : 'linux'
  var isMac = platform === 'darwin'
  var root = document.getElementById('desktop')
  var statusEl = document.getElementById('status')
  var wcs = new Map()
  var windows = new Map()
  var pending = new Map()
  var handles = new Map()
  var nextId = 1
  var appMenu = { id: null, items: [] }
  var uploadRoot = ''
  var uploads = new Set()
  var lastPoint = { x: 80, y: 80 }
  var ws = null
  var outbox = Promise.resolve()

  // ------------------------------------------------------------ transport
  function rawSend(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
  }
  function post(msg) {
    if (uploads.size === 0) return rawSend(msg)
    outbox = outbox.then(function () {
      return Promise.all(Array.from(uploads)).then(function () {
        rawSend(msg)
      })
    })
  }
  function connect() {
    status('문서 편집기를 준비하는 중…')
    ws = new WebSocket(
      (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/__ws',
    )
    ws.onopen = function () {
      rawSend({ t: 'hello', width: root.clientWidth, height: root.clientHeight })
      fetch('/__upload-root', { credentials: 'same-origin' })
        .then(function (r) {
          return r.json()
        })
        .then(function (j) {
          uploadRoot = j.root
        })
        .catch(function () {})
    }
    ws.onmessage = function (e) {
      var msg
      try {
        msg = JSON.parse(e.data)
      } catch (err) {
        return
      }
      try {
        handle(msg)
      } catch (err) {
        console.error('[host]', msg.t, err)
      }
    }
    ws.onclose = function () {
      if (sessionOver) return
      recover(
        '연결이 끊어졌습니다',
        '서버와의 연결이 끊겼습니다. 다시 시작하면 새 작업 공간이 열립니다. 내려받지 않은 문서는 다시 열어야 할 수 있습니다.',
      )
    }
  }
  function status(text) {
    statusEl.querySelector('.boot-text').textContent = text || ''
    statusEl.hidden = !text
  }

  // ------------------------------------------------------------ web contents
  function contents(id) {
    var rec = wcs.get(id)
    if (!rec) {
      var iframe = document.createElement('iframe')
      iframe.className = 'wc'
      iframe.dataset.wc = String(id)
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen')
      rec = { id: id, iframe: iframe, dispatch: null, win: null, url: '' }
      wcs.set(id, rec)
    }
    return rec
  }
  function placeIframe(rec, parent) {
    if (rec.iframe.parentNode !== parent) parent.appendChild(rec.iframe)
  }

  // ------------------------------------------------------------ windows
  function createWindow(msg) {
    var el = document.createElement('div')
    el.className = msg.main ? 'win main' : 'win floating'
    var body = document.createElement('div')
    body.className = 'win-body'
    var rec = {
      id: msg.win,
      wc: msg.wc,
      main: msg.main,
      el: el,
      body: body,
      backdrop: null,
      title: null,
    }
    if (!msg.main) {
      var bar = document.createElement('div')
      bar.className = 'win-bar'
      var title = document.createElement('span')
      title.textContent = msg.opts.title || ''
      var close = document.createElement('button')
      close.type = 'button'
      close.className = 'win-close'
      close.title = '닫기'
      close.textContent = '×'
      close.onclick = function () {
        post({ t: 'win-close', win: msg.win })
      }
      bar.appendChild(title)
      bar.appendChild(close)
      el.appendChild(bar)
      rec.title = title
      var w = Math.min(msg.opts.width || 800, window.innerWidth - 40)
      var h = Math.min((msg.opts.height || 600) + 34, window.innerHeight - 40)
      el.style.width = w + 'px'
      el.style.height = h + 'px'
      el.style.left = Math.max(20, (window.innerWidth - w) / 2) + 'px'
      el.style.top = Math.max(20, (window.innerHeight - h) / 2) + 'px'
      if (msg.opts.modal || msg.opts.parent) {
        rec.backdrop = document.createElement('div')
        rec.backdrop.className = 'backdrop'
        root.appendChild(rec.backdrop)
      }
      dragWindow(bar, el)
    }
    el.appendChild(body)
    root.appendChild(el)
    windows.set(msg.win, rec)
    var wrec = contents(msg.wc)
    wrec.win = msg.win
    wrec.iframe.classList.add('own')
    placeIframe(wrec, body)
    setShown(rec, msg.opts.show !== false)
    if (msg.main) {
      status('')
    }
  }
  function setShown(rec, shown) {
    rec.el.hidden = !shown
    rec.el.inert = !shown
    if (shown) rec.el.removeAttribute('aria-hidden')
    else rec.el.setAttribute('aria-hidden', 'true')
    if (rec.backdrop) rec.backdrop.hidden = !shown
  }
  function dragWindow(bar, el) {
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.tagName === 'BUTTON') return
      var sx = e.clientX - el.offsetLeft
      var sy = e.clientY - el.offsetTop
      bar.setPointerCapture(e.pointerId)
      function move(ev) {
        el.style.left = ev.clientX - sx + 'px'
        el.style.top = Math.max(0, ev.clientY - sy) + 'px'
      }
      function up() {
        bar.removeEventListener('pointermove', move)
        bar.removeEventListener('pointerup', up)
      }
      bar.addEventListener('pointermove', move)
      bar.addEventListener('pointerup', up)
    })
  }
  function layoutViews(msg) {
    var win = windows.get(msg.win)
    if (!win) return
    var listed = new Set()
    msg.views.forEach(function (v, i) {
      listed.add(v.wc)
      var rec = contents(v.wc)
      rec.win = msg.win
      placeIframe(rec, win.body)
      rec.iframe.classList.add('view')
      setBounds(rec, v.bounds)
      rec.iframe.style.zIndex = String(10 + i)
      rec.iframe.style.display = v.visible === false ? 'none' : ''
      rec.attached = true
    })
    wcs.forEach(function (rec) {
      if (rec.win === msg.win && rec.iframe.classList.contains('view') && !listed.has(rec.id)) {
        rec.iframe.style.display = 'none'
        rec.attached = false
      }
    })
  }
  function setBounds(rec, b) {
    if (!b) return
    var s = rec.iframe.style
    s.left = b.x + 'px'
    s.top = b.y + 'px'
    s.width = b.width + 'px'
    s.height = b.height + 'px'
  }

  // ------------------------------------------------------------ dialogs
  function modal(build) {
    return new Promise(function (resolve) {
      var back = document.createElement('div')
      back.className = 'dlg-back'
      var box = document.createElement('div')
      box.className = 'dlg'
      back.appendChild(box)
      document.body.appendChild(back)
      function done(value) {
        back.remove()
        resolve(value)
      }
      build(box, done)
      var focusable =
        box.querySelector('[autofocus]') ||
        box.querySelector('button.primary') ||
        box.querySelector('button')
      if (focusable) focusable.focus()
    })
  }
  function messageBox(options) {
    return modal(function (box, done) {
      var title = options.title || ''
      var h = document.createElement('div')
      h.className = 'dlg-msg'
      h.textContent = options.message || title
      box.appendChild(h)
      if (options.detail) {
        var d = document.createElement('div')
        d.className = 'dlg-detail'
        d.textContent = options.detail
        box.appendChild(d)
      }
      var check = null
      if (options.checkboxLabel) {
        var label = document.createElement('label')
        label.className = 'dlg-check'
        check = document.createElement('input')
        check.type = 'checkbox'
        check.checked = !!options.checkboxChecked
        label.appendChild(check)
        label.appendChild(document.createTextNode(' ' + options.checkboxLabel))
        box.appendChild(label)
      }
      var row = document.createElement('div')
      row.className = 'dlg-buttons'
      var buttons = options.buttons && options.buttons.length ? options.buttons : ['확인']
      var cancelId =
        typeof options.cancelId === 'number'
          ? options.cancelId
          : buttons.length > 1
            ? buttons.length - 1
            : 0
      buttons.forEach(function (label, i) {
        var b = document.createElement('button')
        b.type = 'button'
        b.textContent = String(label).replace(/&/g, '')
        if (i === (options.defaultId ?? 0)) b.className = 'primary'
        b.onclick = function () {
          done({ response: i, checkboxChecked: check ? check.checked : false })
        }
        row.appendChild(b)
      })
      box.appendChild(row)
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Escape')
          done({ response: cancelId, checkboxChecked: check ? check.checked : false })
      })
    })
  }
  function acceptOf(filters) {
    var exts = []
    ;(filters || []).forEach(function (f) {
      ;(f.extensions || []).forEach(function (x) {
        if (x !== '*') exts.push('.' + x)
      })
    })
    return exts.join(',')
  }
  // Phones and tablets do not know .hwp, .hwpx and the like, so a picker limited to those
  // names greys the documents out. There the picker shows every file and the name is checked
  // after the pick.
  var touchDevice =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  function allowedByFilters(name, filters) {
    var exts = []
    ;(filters || []).forEach(function (f) {
      ;(f.extensions || []).forEach(function (x) {
        exts.push(String(x).toLowerCase())
      })
    })
    if (!exts.length || exts.indexOf('*') >= 0) return true
    var m = /\.([^.]+)$/.exec(String(name || ''))
    return !!m && exts.indexOf(m[1].toLowerCase()) >= 0
  }
  function pickFiles(options) {
    var props = options.properties || []
    return new Promise(function (resolve) {
      var input = document.createElement('input')
      input.type = 'file'
      input.multiple = props.indexOf('multiSelections') >= 0
      if (props.indexOf('openDirectory') >= 0) input.webkitdirectory = true
      var accept = acceptOf(options.filters)
      if (accept && !touchDevice) input.accept = accept
      input.onchange = function () {
        var files = Array.from(input.files || [])
        if (!touchDevice || input.webkitdirectory) return resolve(files)
        var ok = files.filter(function (f) {
          return allowedByFilters(f.name, options.filters)
        })
        if (ok.length < files.length)
          messageBox({
            message: '이 파일은 열 수 없어요',
            detail:
              files
                .filter(function (f) {
                  return ok.indexOf(f) < 0
                })
                .map(function (f) {
                  return f.name
                })
                .join(', ') +
              '\n한글(HWP·HWPX), 워드, 엑셀, PPT, PDF 같은 문서 파일을 골라 주세요.',
            buttons: ['확인'],
          })
        resolve(ok)
      }
      input.addEventListener('cancel', function () {
        resolve([])
      })
      input.click()
    })
  }
  function openDialog(options) {
    var props = options.properties || []
    var dir = props.indexOf('openDirectory') >= 0
    var picker = window.showOpenFilePicker && !dir
    var chosen = picker
      ? window
          .showOpenFilePicker({
            multiple: props.indexOf('multiSelections') >= 0,
            types: pickerTypes(options.filters),
          })
          .then(function (hs) {
            return Promise.all(
              hs.map(function (h) {
                return h.getFile().then(function (f) {
                  return { file: f, handle: h }
                })
              }),
            )
          })
          .catch(function () {
            return []
          })
      : pickFiles(options).then(function (files) {
          return files.map(function (f) {
            return { file: f, handle: null }
          })
        })
    return chosen.then(function (list) {
      if (!list.length) return { paths: [] }
      var base = uploadRoot + '/' + uploadFolder()
      if (dir) {
        var top = (list[0].file.webkitRelativePath || '').split('/')[0] || '폴더'
        return Promise.all(
          list.map(function (x) {
            return upload(x.file, base + '/' + (x.file.webkitRelativePath || x.file.name), null)
          }),
        ).then(function () {
          return { paths: [base + '/' + top] }
        })
      }
      return Promise.all(
        list.map(function (x) {
          var hid = null
          if (x.handle) {
            hid = 'h' + nextId++
            handles.set(hid, x.handle)
          }
          return upload(x.file, base + '/' + x.file.name, hid)
        }),
      ).then(function (paths) {
        return { paths: paths }
      })
    })
  }
  function pickerTypes(filters) {
    var types = []
    ;(filters || []).forEach(function (f) {
      var exts = (f.extensions || []).filter(function (x) {
        return x !== '*'
      })
      if (exts.length)
        types.push({
          description: f.name || '',
          accept: {
            'application/octet-stream': exts.map(function (x) {
              return '.' + x
            }),
          },
        })
    })
    return types.length ? types : undefined
  }
  function saveDialog(options) {
    var suggested =
      String(options.defaultPath || '')
        .split(/[\\/]/)
        .pop() || '새 문서'
    if (window.showSaveFilePicker) {
      return window
        .showSaveFilePicker({ suggestedName: suggested, types: pickerTypes(options.filters) })
        .then(function (h) {
          var hid = 'h' + nextId++
          handles.set(hid, h)
          return { name: h.name, handle: hid }
        })
        .catch(function () {
          return { name: '' }
        })
    }
    return modal(function (box, done) {
      var h = document.createElement('div')
      h.className = 'dlg-msg'
      h.textContent = options.title || '다른 이름으로 저장'
      var input = document.createElement('input')
      input.type = 'text'
      input.className = 'dlg-input'
      input.value = suggested
      input.setAttribute('autofocus', '')
      var row = document.createElement('div')
      row.className = 'dlg-buttons'
      var ok = document.createElement('button')
      ok.type = 'button'
      ok.className = 'primary'
      ok.textContent = '저장'
      ok.onclick = function () {
        done({ name: input.value.trim() })
      }
      var cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = '취소'
      cancel.onclick = function () {
        done({ name: '' })
      }
      input.onkeydown = function (e) {
        if (e.key === 'Enter') ok.click()
        if (e.key === 'Escape') cancel.click()
      }
      row.appendChild(cancel)
      row.appendChild(ok)
      box.appendChild(h)
      box.appendChild(input)
      box.appendChild(row)
      setTimeout(function () {
        var dot = input.value.lastIndexOf('.')
        input.focus()
        input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
      }, 0)
    })
  }
  function onDialog(msg) {
    var work =
      msg.kind === 'message'
        ? messageBox(msg.options || {})
        : msg.kind === 'open'
          ? openDialog(msg.options || {})
          : saveDialog(msg.options || {})
    work.then(function (answer) {
      rawSend(Object.assign({ t: 'dialog-answer', id: msg.id }, answer))
    })
  }

  // ------------------------------------------------------------ files
  function upload(file, path, handleId) {
    var url =
      '/__upload?path=' +
      encodeURIComponent(path) +
      (handleId ? '&handle=' + encodeURIComponent(handleId) : '')
    var p = fetch(url, { method: 'POST', body: file, credentials: 'same-origin' })
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        return j.path || path
      })
    uploads.add(p)
    p.finally(function () {
      uploads.delete(p)
    })
    return p
  }
  function reserveUpload(file) {
    var path = uploadRoot + '/' + uploadFolder() + '/' + file.name
    upload(file, path, null)
    return path
  }
  // Each pick gets its own folder so two files with the same name never meet; the
  // folder is named by the time it was opened, which is what the home list shows.
  var lastFolder = ''
  var folderSeq = 0
  function uploadFolder() {
    var d = new Date()
    var pad = function (n) {
      return (n < 10 ? '0' : '') + n
    }
    var name =
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    if (name.slice(0, 17) === lastFolder.slice(0, 17)) {
      folderSeq += 1
      name += '-' + folderSeq
    } else folderSeq = 0
    lastFolder = name
    return name
  }
  function download(path, name) {
    var a = document.createElement('a')
    a.href = '/__download?path=' + encodeURIComponent(path)
    a.download = name || ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  function onFileWritten(msg) {
    var h = msg.handle && handles.get(msg.handle)
    if (h) {
      fetch('/__download?path=' + encodeURIComponent(msg.path), { credentials: 'same-origin' })
        .then(function (r) {
          return r.blob()
        })
        .then(function (blob) {
          return h.createWritable().then(function (w) {
            return w.write(blob).then(function () {
              return w.close()
            })
          })
        })
        .then(function () {
          toast('‘' + msg.name + '’ 저장됨')
        })
        .catch(function () {
          // The browser may refuse the write-back (no write permission once the user
          // gesture has expired). The document is saved in the work space, so show the
          // ordinary saved notice with its download button instead of an error.
          toast('‘' + msg.name + '’ 저장됨 — 내 컴퓨터에 보관하려면 내려받으세요.', msg)
        })
      return
    }
    toast('‘' + msg.name + '’ 저장됨 — 내 컴퓨터에 보관하려면 내려받으세요.', msg)
  }
  // Once per browser: web files live on the server only for a while, so say so
  // before the first document is lost to a closed tab.
  var NOTICE_KEY = 'hs-storage-notice-v1'
  // kept for when the first-save notice comes back; nothing calls it now
  function _showStorageNotice() {
    try {
      if (localStorage.getItem(NOTICE_KEY)) return
    } catch (e) {}
    var t = document.createElement('div')
    t.className = 'toast notice'
    t.setAttribute('role', 'note')
    var body = document.createElement('div')
    body.className = 'notice-body'
    var title = document.createElement('strong')
    title.textContent = '웹 버전에서 문서 보관하기'
    var text = document.createElement('span')
    text.textContent =
      '웹에서 연 문서는 서버에 잠시만 보관되고, 15분 동안 쓰지 않거나 페이지를 새로 고치면 지워집니다. 저장한 뒤 알림의 ‘내려받기’로 내 컴퓨터에 받아 두세요.'
    var ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'notice-ok'
    ok.textContent = '알겠습니다'
    ok.onclick = function () {
      try {
        localStorage.setItem(NOTICE_KEY, '1')
      } catch (e) {}
      t.remove()
    }
    body.appendChild(title)
    body.appendChild(text)
    body.appendChild(ok)
    t.appendChild(body)
    document.getElementById('toasts').appendChild(t)
  }
  // an open document tab means a reload or a closed browser tab would lose work
  var sessionOver = false
  window.addEventListener('beforeunload', function (e) {
    if (sessionOver) return
    var editing = false
    wcs.forEach(function (rec) {
      if (rec.url && rec.url.indexOf('/__proto/genoffice-app/') !== -1 && rec.iframe.isConnected)
        editing = true
    })
    if (!editing) return
    e.preventDefault()
    e.returnValue = ''
  })
  function toast(text, file) {
    var t = document.createElement('div')
    t.className = 'toast'
    var span = document.createElement('span')
    span.textContent = text
    t.appendChild(span)
    if (file) {
      var b = document.createElement('button')
      b.type = 'button'
      b.textContent = '내려받기'
      b.onclick = function () {
        download(file.path, file.name)
        t.remove()
      }
      t.appendChild(b)
    }
    var x = document.createElement('button')
    x.type = 'button'
    x.className = 'toast-x'
    x.textContent = '×'
    x.onclick = function () {
      t.remove()
    }
    t.appendChild(x)
    document.getElementById('toasts').appendChild(t)
    setTimeout(
      function () {
        t.remove()
      },
      file ? 20000 : 4000,
    )
  }

  // ------------------------------------------------------------ menus and keys
  var openMenu = null
  function closeMenu(notify) {
    if (!openMenu) return
    var m = openMenu
    openMenu = null
    m.el.remove()
    if (notify !== false) rawSend({ t: 'menu-closed', menu: m.id })
  }
  function popupMenu(msg) {
    closeMenu()
    var at = lastPoint
    if (msg.x !== null && msg.wc) {
      var rec = wcs.get(msg.wc)
      if (rec) {
        var r = rec.iframe.getBoundingClientRect()
        at = { x: r.left + msg.x, y: r.top + msg.y }
      }
    }
    var el = renderMenu(msg.menu, msg.items, msg.wc)
    document.body.appendChild(el)
    var w = el.offsetWidth
    var h = el.offsetHeight
    el.style.left = Math.min(at.x, window.innerWidth - w - 4) + 'px'
    el.style.top = Math.min(at.y, window.innerHeight - h - 4) + 'px'
    openMenu = { id: msg.menu, el: el }
  }
  function renderMenu(menuId, items, wcId) {
    var el = document.createElement('div')
    el.className = 'menu'
    items.forEach(function (item) {
      if (item.type === 'separator') {
        var hr = document.createElement('div')
        hr.className = 'menu-sep'
        el.appendChild(hr)
        return
      }
      var row = document.createElement('div')
      row.className = 'menu-item' + (item.enabled ? '' : ' disabled')
      var check = document.createElement('span')
      check.className = 'menu-check'
      check.textContent = item.checked ? '✓' : ''
      var label = document.createElement('span')
      label.className = 'menu-label'
      label.textContent = String(item.label || '').replace(/&/g, '')
      var acc = document.createElement('span')
      acc.className = 'menu-acc'
      acc.textContent = item.submenu ? '›' : prettyAccel(item.accelerator)
      row.appendChild(check)
      row.appendChild(label)
      row.appendChild(acc)
      if (item.submenu) {
        var sub = renderMenu(menuId, item.submenu, wcId)
        sub.classList.add('submenu')
        row.appendChild(sub)
      } else if (item.enabled) {
        row.addEventListener('click', function (e) {
          e.stopPropagation()
          closeMenu(false)
          rawSend({ t: 'menu-click', menu: menuId, item: item.itemId, wc: wcId })
          rawSend({ t: 'menu-closed', menu: menuId })
        })
      }
      el.appendChild(row)
    })
    return el
  }
  function prettyAccel(a) {
    if (!a) return ''
    return a
      .replace(/CommandOrControl|CmdOrCtrl/gi, isMac ? '⌘' : 'Ctrl')
      .replace(/Command|Cmd/gi, '⌘')
      .replace(/Control|Ctrl/gi, isMac ? '⌃' : 'Ctrl')
      .replace(/Shift/gi, isMac ? '⇧' : 'Shift')
      .replace(/Alt|Option/gi, isMac ? '⌥' : 'Alt')
      .replace(/\+/g, isMac ? '' : '+')
  }
  document.addEventListener('mousedown', function (e) {
    if (openMenu && !openMenu.el.contains(e.target)) closeMenu()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu()
  })
  function accelMatches(accel, e) {
    var parts = accel.split('+')
    var key = parts.pop().toLowerCase()
    var want = { meta: false, ctrl: false, shift: false, alt: false }
    parts.forEach(function (p) {
      p = p.toLowerCase()
      if (p === 'cmdorctrl' || p === 'commandorcontrol') {
        if (isMac) want.meta = true
        else want.ctrl = true
      } else if (p === 'cmd' || p === 'command' || p === 'super' || p === 'meta') want.meta = true
      else if (p === 'ctrl' || p === 'control') want.ctrl = true
      else if (p === 'shift') want.shift = true
      else if (p === 'alt' || p === 'option') want.alt = true
    })
    if (
      want.meta !== e.metaKey ||
      want.ctrl !== e.ctrlKey ||
      want.shift !== e.shiftKey ||
      want.alt !== e.altKey
    )
      return false
    var k = String(e.key).toLowerCase()
    var aliases = {
      plus: '+',
      '=': '=',
      space: ' ',
      tab: 'tab',
      enter: 'enter',
      return: 'enter',
      esc: 'escape',
      escape: 'escape',
      backspace: 'backspace',
      delete: 'delete',
      up: 'arrowup',
      down: 'arrowdown',
      left: 'arrowleft',
      right: 'arrowright',
    }
    var want2 = aliases[key] || key
    if (k === want2) return true
    if (e.code && /^Key[A-Z]$/.test(e.code) && e.code.slice(3).toLowerCase() === want2) return true
    if (e.code && /^Digit\d$/.test(e.code) && e.code.slice(5) === want2) return true
    return false
  }
  function findAccel(items, e) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i]
      if (it.submenu) {
        var f = findAccel(it.submenu, e)
        if (f) return f
      } else if (it.accelerator && it.enabled && accelMatches(it.accelerator, e)) return it
    }
    return null
  }
  var RESERVED = /^(s|o|p|n|w|t|f|z|y|1|2|3|4|5|6|7|8|9|0)$/
  function onKey(wc, e) {
    if (e.type !== 'keydown') return false
    var mod = e.metaKey || e.ctrlKey
    rawSend({
      t: 'wc-event',
      wc: wc,
      ev: 'input',
      data: {
        type: 'keyDown',
        key: e.key,
        code: e.code,
        isAutoRepeat: e.repeat,
        shift: e.shiftKey,
        control: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey,
        modifiers: [],
      },
    })
    if (!mod) return false
    var item = appMenu.id ? findAccel(appMenu.items, e) : null
    if (item) {
      rawSend({ t: 'menu-click', menu: appMenu.id, item: item.itemId, wc: wc })
      return true
    }
    // browser shortcuts that would leave or print the page
    return (
      RESERVED.test(String(e.key).toLowerCase()) && /^(s|o|p)$/.test(String(e.key).toLowerCase())
    )
  }

  // ------------------------------------------------------------ messages from the app
  var schemes = new Set()
  function handle(msg) {
    switch (msg.t) {
      case 'reply': {
        var p = pending.get(msg.id)
        pending.delete(msg.id)
        if (p) {
          if (msg.ok === false) p.reject(msg.error || 'failed')
          else p.resolve(msg.value)
        }
        return
      }
      case 'schemes':
        schemes.clear()
        msg.schemes.forEach(function (s) {
          schemes.add(s)
        })
        return
      case 'wc-create':
        contents(msg.wc)
        return
      case 'win-create':
        return createWindow(msg)
      case 'win-update': {
        var w = windows.get(msg.win)
        if (!w) return
        if ('show' in msg.props) setShown(w, msg.props.show)
        if ('title' in msg.props) {
          if (w.title) w.title.textContent = msg.props.title
          if (w.main) document.title = msg.props.title || '똑딱작업실'
        }
        return
      }
      case 'win-destroy': {
        var wd = windows.get(msg.win)
        if (!wd) return
        windows.delete(msg.win)
        wd.el.remove()
        if (wd.backdrop) wd.backdrop.remove()
        return
      }
      case 'win-views':
        return layoutViews(msg)
      case 'view-bounds':
        return setBounds(contents(msg.wc), msg.bounds)
      case 'view-visible':
        contents(msg.wc).iframe.style.display = msg.visible ? '' : 'none'
        return
      case 'wc-load': {
        var rec = contents(msg.wc)
        rec.url = msg.url
        rec.dispatch = null
        rec.iframe.src = msg.url
        return
      }
      case 'wc-send': {
        var r = wcs.get(msg.wc)
        if (r && r.dispatch) r.dispatch(msg.ch, msg.args)
        return
      }
      case 'wc-destroy': {
        var rd = wcs.get(msg.wc)
        if (rd) {
          rd.iframe.remove()
          wcs.delete(msg.wc)
        }
        return
      }
      case 'wc-focus': {
        var rf = wcs.get(msg.wc)
        var owner = rf && windows.get(rf.win)
        if (rf && (!owner || !owner.el.hidden) && rf.iframe.contentWindow)
          rf.iframe.contentWindow.focus()
        return
      }
      case 'wc-zoom': {
        var rz = wcs.get(msg.wc)
        try {
          rz.iframe.contentDocument.documentElement.style.zoom = String(msg.factor)
        } catch (e) {}
        return
      }
      case 'wc-command': {
        var rc = wcs.get(msg.wc)
        try {
          if (msg.cmd === 'insertText')
            rc.iframe.contentDocument.execCommand('insertText', false, msg.text)
          else rc.iframe.contentDocument.execCommand(msg.cmd)
        } catch (e) {}
        return
      }
      case 'wc-exec': {
        var re = wcs.get(msg.wc)
        var value
        var error
        try {
          value = re.iframe.contentWindow.eval(msg.code)
        } catch (e) {
          error = String(e)
        }
        Promise.resolve(value)
          .then(function (v) {
            rawSend({ t: 'reply', id: msg.id, value: safeClone(v), error: error })
          })
          .catch(function (e) {
            rawSend({ t: 'reply', id: msg.id, error: String(e) })
          })
        return
      }
      case 'wc-print': {
        var rp = wcs.get(msg.wc)
        if (rp && rp.iframe.contentWindow) rp.iframe.contentWindow.print()
        return
      }
      case 'wc-pdf':
      case 'wc-capture':
        rawSend({ t: 'reply', id: msg.id, error: '웹 버전에서는 지원하지 않는 기능입니다.' })
        return
      case 'dialog':
        return onDialog(msg)
      case 'dialog-notice':
        messageBox({ message: msg.title, detail: msg.content, buttons: ['확인'] })
        return
      case 'menu-popup':
        return popupMenu(msg)
      case 'menu-close':
        if (openMenu && openMenu.id === msg.menu) closeMenu()
        return
      case 'app-menu':
        appMenu = { id: msg.menu, items: msg.items || [] }
        return
      case 'open-external':
        if (/^https?:|^mailto:/i.test(msg.url)) window.open(msg.url, '_blank', 'noopener')
        return
      case 'reveal-file':
        download(msg.path, msg.path.split('/').pop())
        return
      case 'clipboard':
        if (navigator.clipboard) navigator.clipboard.writeText(msg.text).catch(function () {})
        return
      case 'notify':
        toast(msg.title + (msg.body ? ' — ' + msg.body : ''))
        return
      case 'file-written':
        return onFileWritten(msg)
      case 'session-ended':
      case 'app-quit':
        return recover(
          '작업 공간이 닫혔습니다',
          '프로그램이 종료되었습니다. 다시 시작하면 새 작업 공간이 열립니다.',
        )
      case 'refused':
        // the gateway would not open a work space (abuse-guard.mjs): say why, do not retry
        return ended(msg.title, msg.detail)
      case 'ready':
        return
    }
  }
  function safeClone(v) {
    try {
      return JSON.parse(JSON.stringify(v))
    } catch (e) {
      return null
    }
  }
  function ended(title, detail) {
    sessionOver = true
    var el = document.getElementById('ended')
    document.getElementById('ended-title').textContent = title
    document.getElementById('ended-detail').textContent = detail || ''
    el.hidden = false
    document.getElementById('restart').focus()
  }
  // The session's program ended or the link dropped: open the workspace again by itself (its
  // uploaded files stay on the server). Only when that keeps failing does the card ask.
  var RECOVER_KEY = 'hs-recover-v1'
  function recover(title, detail) {
    if (sessionOver) return
    var now = Date.now()
    var tries = []
    try {
      tries = JSON.parse(sessionStorage.getItem(RECOVER_KEY) || '[]').filter(function (t) {
        return now - t < 2 * 60 * 1000
      })
    } catch (e) {}
    if (tries.length >= 3) return ended(title, detail)
    tries.push(now)
    try {
      sessionStorage.setItem(RECOVER_KEY, JSON.stringify(tries))
    } catch (e) {}
    sessionOver = true
    status('작업 공간을 다시 여는 중…')
    setTimeout(function () {
      location.reload()
    }, 600)
  }
  document.getElementById('restart').onclick = function () {
    location.reload()
  }

  // ------------------------------------------------------------ API for frames
  window.__electronHost = {
    platform: platform,
    schemes: schemes,
    bindFrame: function (wc, win, dispatch) {
      contents(wc).dispatch = dispatch
    },
    invoke: function (wc, ch, args, resolve, reject) {
      var id = 'b' + nextId++
      pending.set(id, { resolve: resolve, reject: reject })
      post({ t: 'invoke', id: id, wc: wc, ch: ch, args: args })
    },
    send: function (wc, ch, args) {
      post({ t: 'send', wc: wc, ch: ch, args: args })
    },
    sendSync: function (wc, ch, args) {
      var xhr = new XMLHttpRequest()
      xhr.open('POST', '/__ipc-sync', false)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.send(JSON.stringify({ wc: wc, ch: ch, args: args }))
      try {
        return JSON.parse(xhr.responseText).value
      } catch (e) {
        return undefined
      }
    },
    frameEvent: function (wc, ev, data) {
      rawSend({ t: 'wc-event', wc: wc, ev: ev, data: data || null })
    },
    reserveUpload: reserveUpload,
    key: onKey,
    pointer: function (wc, x, y) {
      var rec = wcs.get(wc)
      if (!rec) return
      var r = rec.iframe.getBoundingClientRect()
      lastPoint = { x: r.left + x, y: r.top + y }
      if (openMenu) closeMenu()
    },
  }

  var resizeTimer = null
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(function () {
      rawSend({ t: 'resize', width: root.clientWidth, height: root.clientHeight })
    }, 120)
  })
  // documents dropped on an empty spot open like the desktop's dock drop
  window.addEventListener('dragover', function (e) {
    e.preventDefault()
  })
  window.addEventListener('drop', function (e) {
    e.preventDefault()
  })

  connect()
})()
