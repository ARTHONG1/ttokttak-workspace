;(function () {
  'use strict'
  // ---- open-source universe: 575 packages and how they lean on each other ----
  var stage = document.getElementById('uniStage')
  var canvas = document.getElementById('uniCanvas')
  if (!stage || !canvas || !canvas.getContext) return
  var tip = document.getElementById('uniTip')
  var legend = document.getElementById('uniLegend')
  var ctx = canvas.getContext('2d')
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var COLORS = { core: '#ffd60a', shell: '#c9ccd6', docs: '#5b8cff', sheets: '#3ecf8e', slides: '#ff8a4c', pdf: '#ff5c6c', hwp: '#4fc3ff', markdown: '#b48cff', html: '#ffb84d', mindmap: '#ff6fb5', epub: '#7ee0d2' }
  var data = null, nodes = [], links = [], adj = [], W = 0, H = 0, dpr = 1, scale = 1
  var hover = -1, focusGroup = null, born = 0, visible = false, raf = 0, rot = 0
  var mouse = { x: -1, y: -1 }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16)
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
  }
  function resize() {
    var r = stage.getBoundingClientRect()
    dpr = Math.min(2, window.devicePixelRatio || 1)
    W = r.width; H = r.height
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    scale = Math.min(W, H) / 1080
  }
  function load() {
    fetch('/__web/intro/oss-graph.json').then(function (r) { return r.json() }).then(function (g) {
      data = g
      nodes = g.nodes.map(function (n, i) {
        return { x: n[0], y: n[1], r: n[2], group: n[3], label: n[4], license: n[5], i: i, tw: Math.random() * Math.PI * 2, delay: Math.hypot(n[0], n[1]) / 520 }
      })
      adj = nodes.map(function () { return [] })
      links = g.links.map(function (l) { adj[l[0]].push(l[1]); adj[l[1]].push(l[0]); return { a: l[0], b: l[1], strong: l[2] === 1 } })
      g.groups.forEach(function (gr) {
        var li = document.createElement('li')
        li.innerHTML = '<i style="color:' + COLORS[gr[0]] + ';background:' + COLORS[gr[0]] + '"></i>' + gr[1]
        li.addEventListener('mouseenter', function () { focusGroup = gr[0]; li.classList.add('on') })
        li.addEventListener('mouseleave', function () { focusGroup = null; li.classList.remove('on') })
        legend.appendChild(li)
      })
      resize()
      watch()
    })
  }
  function watch() {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting
        if (visible && !born) born = performance.now()
        if (visible && !raf) raf = requestAnimationFrame(frame)
      })
    }, { threshold: 0.15 })
    io.observe(stage)
  }
  function pos(n, t) {
    // the whole sky turns slowly; every star breathes a little on its own
    var a = rot, c = Math.cos(a), s = Math.sin(a)
    var bx = n.x * c - n.y * s, by = n.x * s + n.y * c
    var wob = reduce || n.group === 'core' ? 0 : 1.6
    return { x: W / 2 + (bx + Math.sin(t * 0.0006 + n.tw) * wob) * scale, y: H / 2 + (by + Math.cos(t * 0.0005 + n.tw) * wob) * scale }
  }
  function grow(n, t) {
    if (reduce) return 1
    var k = (t - born) / 1600 - n.delay * 0.9
    k = Math.max(0, Math.min(1, k))
    return 1 - Math.pow(1 - k, 3)
  }
  function frame(t) {
    raf = 0
    if (!data) return
    if (!reduce) rot += 0.00018
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    var P = new Array(nodes.length)
    for (var i = 0; i < nodes.length; i++) {
      var g = grow(nodes[i], t)
      var p = pos(nodes[i], t)
      // stars fly out from the centre as the section first appears
      P[i] = { x: W / 2 + (p.x - W / 2) * g, y: H / 2 + (p.y - H / 2) * g, g: g }
    }
    var hot = hover >= 0 ? new Set(adj[hover].concat([hover])) : null
    // links
    ctx.lineWidth = 1
    for (var k = 0; k < links.length; k++) {
      var l = links[k], A = P[l.a], B = P[l.b]
      var ga = Math.min(A.g, B.g)
      if (ga <= 0) continue
      var na = nodes[l.a], nb = nodes[l.b]
      var lit = hot ? (l.a === hover || l.b === hover) : focusGroup ? (na.group === focusGroup || nb.group === focusGroup) : false
      var col = COLORS[nb.group] || '#9aa'
      var alpha = (hot || focusGroup) ? (lit ? 0.55 : 0.025) : (l.strong ? 0.16 : 0.07)
      ctx.strokeStyle = hexA(col, alpha * ga)
      ctx.lineWidth = lit ? 1.2 : l.strong ? 0.9 : 0.6
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke()
    }
    // signals travel along the editor spokes
    if (!reduce && !hot) {
      for (var s = 0; s < links.length; s += 23) {
        var L = links[s]
        if (!L.strong) continue
        var a2 = P[L.a], b2 = P[L.b]
        var f = ((t * 0.00035 + s * 0.137) % 1)
        ctx.fillStyle = hexA(COLORS[nodes[L.b].group] || '#fff', 0.8 * Math.min(a2.g, b2.g) * Math.sin(f * Math.PI))
        ctx.beginPath(); ctx.arc(a2.x + (b2.x - a2.x) * f, a2.y + (b2.y - a2.y) * f, 1.4, 0, 7); ctx.fill()
      }
    }
    // nodes
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j], q = P[j]
      if (q.g <= 0) continue
      var dim = (hot && !hot.has(j)) || (focusGroup && n.group !== focusGroup && n.group !== 'core' && !(n.label && nodes[j].i <= 10)) ? 0.18 : 1
      var tw = reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 0.002 + n.tw * 3)
      var rr = Math.max(0.8, n.r * scale * 1.15) * (j === hover ? 1.8 : 1)
      var c = COLORS[n.group] || '#ccc'
      if (n.r >= 9) {
        var glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr * 4.5)
        glow.addColorStop(0, hexA(c, 0.45 * dim)); glow.addColorStop(1, hexA(c, 0))
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(q.x, q.y, rr * 4.5, 0, 7); ctx.fill()
      }
      ctx.fillStyle = hexA(c, Math.min(1, (0.55 + 0.45 * tw) * dim * q.g))
      ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, 7); ctx.fill()
    }
    // labels: the core and the editors always, a hovered star on demand
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (var m = 0; m <= 10; m++) {
      var z = P[m]
      if (z.g < 0.6) continue
      ctx.font = (m === 0 ? '800 ' + Math.round(15 * Math.max(.8, scale * 1.6)) : '650 ' + Math.round(12 * Math.max(.85, scale * 1.5))) + 'px "Pretendard Variable", Pretendard, sans-serif'
      ctx.fillStyle = m === 0 ? 'rgba(255,240,170,' + z.g + ')' : 'rgba(245,245,242,' + (0.82 * z.g * ((hot && !hot.has(m)) ? 0.3 : 1)) + ')'
      if (m === 0) { ctx.textBaseline = 'top'; ctx.fillText(nodes[m].label, z.x, z.y + nodes[m].r * scale * 1.2 + 8) }
      else {
        var ox = z.x - P[0].x, oy = z.y - P[0].y, ol = Math.hypot(ox, oy) || 1
        ctx.textBaseline = 'middle'
        ctx.fillText(nodes[m].label, z.x + (ox / ol) * 22, z.y + (oy / ol) * 22)
      }
    }
    if (hover >= 0) {
      var h = P[hover], hn = nodes[hover]
      tip.hidden = false
      tip.style.left = h.x + 'px'; tip.style.top = h.y + 'px'
      tip.innerHTML = '<b></b><span></span>'
      tip.firstChild.textContent = hn.label
      tip.lastChild.textContent = hover === 0 ? '편집기 10개 · 오픈소스 575개' : hn.license ? hn.license + ' · ' + adj[hover].length + '개와 연결' : '편집기 · ' + adj[hover].length + '개와 연결'
    } else tip.hidden = true
    if (visible) raf = requestAnimationFrame(frame)
    lastP = P
  }
  var lastP = null
  function pick(x, y) {
    if (!lastP) return -1
    var best = -1, bd = 14 * 14
    for (var i = 0; i < lastP.length; i++) {
      var dx = lastP[i].x - x, dy = lastP[i].y - y, d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = i }
    }
    return best
  }
  function onMove(e) {
    var r = canvas.getBoundingClientRect()
    var pt = e.touches ? e.touches[0] : e
    mouse.x = pt.clientX - r.left; mouse.y = pt.clientY - r.top
    hover = pick(mouse.x, mouse.y)
    stage.classList.add('touched')
    if (!raf && visible) raf = requestAnimationFrame(frame)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onMove)
  canvas.addEventListener('pointerleave', function () { hover = -1 })
  window.addEventListener('resize', function () { resize() })
  if ('IntersectionObserver' in window) load()
})()
