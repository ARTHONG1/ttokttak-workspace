/* Runs first in every app page: the Electron renderer environment, then the page's preload. */
;(function () {
  // the shell's screens hide what needs this PC (subscription programs, the agent window)
  try {
    document.documentElement.dataset.edition = 'web'
    // the server has opened the advanced model tier (gateway: WEB_ADVANCED_MODEL_ENABLED=1)
    var me = document.currentScript
    if (me && /[?&]adv=1\b/.test(me.src)) document.documentElement.dataset.webAdvanced = '1'
  } catch (e) {}
  var frameEl = null
  try {
    frameEl = window.frameElement
  } catch (e) {}
  var wc = frameEl && frameEl.dataset ? Number(frameEl.dataset.wc) : 0
  var host = null
  var hostWin = null
  try {
    for (var hw = window.parent; hw; hw = hw.parent) {
      if (hw.__electronHost) {
        host = hw.__electronHost
        hostWin = hw
        break
      }
      if (hw === hw.parent) break
    }
  } catch (e) {}
  if (host && !wc) {
    // A nested iframe inside an app page (the HWP editor draws its document in one). In
    // Electron the window's menu accelerators (Cmd/Ctrl+S, …) fire wherever focus is, so
    // shortcut keys pressed in here go to the app page that owns this frame.
    var owner = 0
    try {
      for (var w = window.parent; w && w !== hostWin && !owner; w = w.parent) {
        var fe = w.frameElement
        if (fe && fe.dataset && fe.dataset.wc) owner = Number(fe.dataset.wc)
        if (w === w.parent) break
      }
    } catch (e) {}
    if (owner) {
      window.addEventListener(
        'keydown',
        function (e) {
          if (!(e.metaKey || e.ctrlKey)) return
          if (host.key(owner, e)) {
            e.preventDefault()
            e.stopPropagation()
          }
        },
        true,
      )
    }
    return
  }
  if (!host || !wc) return

  // ------------------------------------------------------------ codec (built in this realm)
  function toB64(u8) {
    var s = ''
    for (var i = 0; i < u8.length; i += 0x8000)
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
    return btoa(s)
  }
  function fromB64(b) {
    var s = atob(b)
    var out = new Uint8Array(s.length)
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  }
  function enc(v, seen) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'symbol') return undefined
      if (typeof v === 'bigint') return Number(v)
      return v
    }
    if (v instanceof Uint8Array || (ArrayBuffer.isView(v) && !(v instanceof DataView))) {
      var u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
      return { __t: 'u8', b: toB64(u) }
    }
    if (v instanceof ArrayBuffer) return { __t: 'u8', b: toB64(new Uint8Array(v)) }
    if (v instanceof Date) return { __t: 'date', v: v.getTime() }
    if (v instanceof Map) return { __t: 'map', v: enc(Array.from(v.entries()), seen) }
    if (v instanceof Set) return { __t: 'set', v: enc(Array.from(v.values()), seen) }
    if (v instanceof Error) return { __t: 'err', message: v.message }
    if (typeof File !== 'undefined' && v instanceof File)
      return { name: v.name, size: v.size, type: v.type }
    seen = seen || new Set()
    if (seen.has(v)) return undefined
    seen.add(v)
    var out
    if (Array.isArray(v)) {
      out = v.map(function (x) {
        var e = enc(x, seen)
        return e === undefined ? null : e
      })
    } else {
      out = {}
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue
        var e = enc(v[k], seen)
        if (e !== undefined) out[k] = e
      }
    }
    seen.delete(v)
    return out
  }
  function dec(v) {
    if (Array.isArray(v)) return v.map(dec)
    if (v && typeof v === 'object') {
      if (v.__t === 'u8') return fromB64(v.b)
      if (v.__t === 'date') return new Date(v.v)
      if (v.__t === 'map') return new Map(dec(v.v))
      if (v.__t === 'set') return new Set(dec(v.v))
      if (v.__t === 'err') return new Error(v.message)
      var out = {}
      for (var k in v) out[k] = dec(v[k])
      return out
    }
    return v
  }

  // ------------------------------------------------------------ ipcRenderer
  var listeners = new Map()
  function event() {
    return { sender: ipcRenderer, senderId: 0, ports: [], preventDefault: function () {} }
  }
  var ipcRenderer = {
    invoke: function (ch) {
      var args = Array.prototype.slice.call(arguments, 1)
      return new Promise(function (resolve, reject) {
        host.invoke(
          wc,
          String(ch),
          enc(args),
          function (value) {
            resolve(dec(value))
          },
          function (message) {
            reject(new Error("Error invoking remote method '" + ch + "': Error: " + message))
          },
        )
      })
    },
    send: function (ch) {
      host.send(wc, String(ch), enc(Array.prototype.slice.call(arguments, 1)))
    },
    sendSync: function (ch) {
      return dec(host.sendSync(wc, String(ch), enc(Array.prototype.slice.call(arguments, 1))))
    },
    postMessage: function (ch, message) {
      host.send(wc, String(ch), enc([message]))
    },
    sendToHost: function () {},
    on: function (ch, fn) {
      if (!listeners.has(ch)) listeners.set(ch, [])
      listeners.get(ch).push(fn)
      return ipcRenderer
    },
    once: function (ch, fn) {
      function wrapped() {
        ipcRenderer.removeListener(ch, wrapped)
        return fn.apply(this, arguments)
      }
      wrapped.original = fn
      return ipcRenderer.on(ch, wrapped)
    },
    addListener: function (ch, fn) {
      return ipcRenderer.on(ch, fn)
    },
    removeListener: function (ch, fn) {
      var list = listeners.get(ch)
      if (!list) return ipcRenderer
      var i = list.findIndex(function (f) {
        return f === fn || f.original === fn
      })
      if (i >= 0) list.splice(i, 1)
      return ipcRenderer
    },
    off: function (ch, fn) {
      return ipcRenderer.removeListener(ch, fn)
    },
    removeAllListeners: function (ch) {
      if (ch) listeners.delete(ch)
      else listeners.clear()
      return ipcRenderer
    },
    listenerCount: function (ch) {
      return (listeners.get(ch) || []).length
    },
    listeners: function (ch) {
      return (listeners.get(ch) || []).slice()
    },
  }
  host.bindFrame(wc, window, function (ch, rawArgs) {
    var list = (listeners.get(ch) || []).slice()
    if (!list.length) return
    var args = dec(rawArgs || [])
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].apply(null, [event()].concat(args))
      } catch (e) {
        console.error(e)
      }
    }
  })

  var contextBridge = {
    exposeInMainWorld: function (key, api) {
      window[key] = api
    },
    exposeInIsolatedWorld: function (_id, key, api) {
      window[key] = api
    },
    executeInMainWorld: function (opts) {
      return opts.func.apply(null, opts.args || [])
    },
  }
  var webUtils = {
    getPathForFile: function (file) {
      return host.reserveUpload(file)
    },
  }
  var zoom = 1
  var webFrame = {
    setZoomFactor: function (f) {
      zoom = f
      document.documentElement.style.zoom = String(f)
    },
    getZoomFactor: function () {
      return zoom
    },
    setZoomLevel: function (l) {
      webFrame.setZoomFactor(Math.pow(1.2, l))
    },
    getZoomLevel: function () {
      return Math.log(zoom) / Math.log(1.2)
    },
    setVisualZoomLevelLimits: function () {},
    setSpellCheckProvider: function () {},
    insertCSS: function (css) {
      var s = document.createElement('style')
      s.textContent = css
      ;(document.head || document.documentElement).appendChild(s)
      return 'css-' + Math.random()
    },
    removeInsertedCSS: function () {},
    executeJavaScript: function (code) {
      return Promise.resolve((0, eval)(code))
    },
    getResourceUsage: function () {
      return {}
    },
    clearCache: function () {},
  }
  var electron = {
    ipcRenderer: ipcRenderer,
    contextBridge: contextBridge,
    webUtils: webUtils,
    webFrame: webFrame,
    clipboard: {
      writeText: function (t) {
        if (navigator.clipboard) navigator.clipboard.writeText(t)
      },
      readText: function () {
        return ''
      },
    },
    shell: {
      openExternal: function (u) {
        window.open(u, '_blank', 'noopener')
      },
    },
  }
  window.__electronRequire = function (name) {
    if (name === 'electron' || name === 'electron/renderer') return electron
    throw new Error('Cannot find module ' + "'" + name + "'")
  }
  window.__electronProcess = {
    platform: host.platform,
    arch: 'x64',
    env: {},
    argv: [],
    type: 'renderer',
    contextIsolated: true,
    sandboxed: true,
    versions: { electron: '43.0.0', chrome: '140.0.0.0', node: '24.0.0' },
    on: function () {},
    once: function () {},
    off: function () {},
    nextTick: function (fn) {
      Promise.resolve().then(fn)
    },
    cwd: function () {
      return '/'
    },
    getSystemVersion: function () {
      return ''
    },
  }

  // ------------------------------------------------------------ app URLs → web URLs
  function addHs(u) {
    return host && typeof host.withHs === 'function' ? host.withHs(u) : u
  }
  function toWeb(u) {
    if (typeof u !== 'string') return u
    var m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(u)
    if (!m) return u
    var scheme = m[1].toLowerCase()
    if (scheme === 'file') return addHs('/__file' + decodeURI(m[2].replace(/^[^/]*/, '')))
    if (host.schemes.has(scheme)) return addHs('/__proto/' + scheme + '/' + m[2])
    return u
  }
  window.__toWebUrl = toWeb
  function patchProp(proto, prop) {
    if (!proto) return
    var d = Object.getOwnPropertyDescriptor(proto, prop)
    if (!d || !d.set) return
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set: function (v) {
        d.set.call(this, toWeb(v))
      },
    })
  }
  patchProp(HTMLImageElement.prototype, 'src')
  patchProp(HTMLIFrameElement.prototype, 'src')
  patchProp(HTMLScriptElement.prototype, 'src')
  patchProp(HTMLLinkElement.prototype, 'href')
  patchProp(HTMLMediaElement.prototype, 'src')
  patchProp(HTMLSourceElement.prototype, 'src')
  patchProp(HTMLEmbedElement.prototype, 'src')
  patchProp(HTMLObjectElement.prototype, 'data')
  patchProp(HTMLAnchorElement.prototype, 'href')
  var setAttr = Element.prototype.setAttribute
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase()
    if (n === 'src' || n === 'href' || n === 'data' || n === 'poster' || n === 'xlink:href')
      value = toWeb(String(value))
    return setAttr.call(this, name, value)
  }
  var origFetch = window.fetch
  window.fetch = function (input, init) {
    if (typeof input === 'string') input = toWeb(input)
    else if (
      input &&
      input.url &&
      /^[a-z][a-z0-9+.-]*:\/\//i.test(input.url) &&
      toWeb(input.url) !== input.url
    )
      input = new Request(toWeb(input.url), input)
    else if (input instanceof URL) input = toWeb(input.href)
    return origFetch.call(this, input, init)
  }
  var xhrOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments)
    args[1] = toWeb(String(url))
    return xhrOpen.apply(this, args)
  }
  var OrigWorker = window.Worker
  if (OrigWorker) {
    window.Worker = function (url, opts) {
      return new OrigWorker(
        typeof url === 'string' ? toWeb(url) : url instanceof URL ? toWeb(url.href) : url,
        opts,
      )
    }
    window.Worker.prototype = OrigWorker.prototype
  }
  window.open = function (url) {
    host.frameEvent(wc, 'open-window', { url: String(url || '') })
    return null
  }
  new MutationObserver(function (records) {
    for (var r = 0; r < records.length; r++) {
      var nodes = records[r].addedNodes
      for (var i = 0; i < nodes.length; i++) fix(nodes[i])
    }
  }).observe(document, { childList: true, subtree: true })
  function fix(node) {
    if (!node || node.nodeType !== 1) return
    var attrs = ['src', 'href', 'data', 'poster']
    for (var a = 0; a < attrs.length; a++) {
      var v = node.getAttribute && node.getAttribute(attrs[a])
      if (v && /^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
        var w = toWeb(v)
        if (w !== v) setAttr.call(node, attrs[a], w)
      }
    }
    if (node.querySelectorAll) {
      var inner = node.querySelectorAll('[src],[href],[data],[poster]')
      for (var j = 0; j < inner.length; j++) fix2(inner[j])
    }
  }
  function fix2(node) {
    var attrs = ['src', 'href', 'data', 'poster']
    for (var a = 0; a < attrs.length; a++) {
      var v = node.getAttribute(attrs[a])
      if (v && /^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
        var w = toWeb(v)
        if (w !== v) setAttr.call(node, attrs[a], w)
      }
    }
  }

  // ------------------------------------------------------------ input, focus, lifecycle
  window.addEventListener(
    'keydown',
    function (e) {
      if (host.key(wc, e)) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true,
  )
  window.addEventListener(
    'mousedown',
    function (e) {
      host.pointer(wc, e.clientX, e.clientY)
    },
    true,
  )
  window.addEventListener('contextmenu', function (e) {
    host.pointer(wc, e.clientX, e.clientY)
    setTimeout(function () {
      if (e.defaultPrevented) return
      var t = e.target
      var editable = !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName)))
      host.frameEvent(wc, 'context-menu', {
        x: e.clientX,
        y: e.clientY,
        selectionText: String(window.getSelection ? window.getSelection() : ''),
        isEditable: editable,
        editFlags: {
          canCut: editable,
          canCopy: true,
          canPaste: editable,
          canSelectAll: true,
          canUndo: editable,
          canRedo: editable,
          canDelete: editable,
        },
        mediaType: t && t.tagName === 'IMG' ? 'image' : 'none',
        srcURL: t && t.tagName === 'IMG' ? t.src : '',
        linkURL: t && t.closest && t.closest('a') ? t.closest('a').href : '',
        dictionarySuggestions: [],
        misspelledWord: '',
      })
    }, 0)
  })
  window.addEventListener('focus', function () {
    host.frameEvent(wc, 'focus')
  })
  window.addEventListener('blur', function () {
    host.frameEvent(wc, 'blur')
  })
  window.addEventListener('load', function () {
    host.frameEvent(wc, 'did-finish-load', { title: document.title })
  })

  document.write('<script src="' + addHs('/__web/preload.js?wc=' + wc) + '"></' + 'script>')
})()
