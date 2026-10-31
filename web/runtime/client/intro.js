;(function () {
  'use strict'
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var nav = document.getElementById('nav')
  var frame = document.getElementById('frame')

  // the window straightens as the page scrolls toward it
  function onScroll() {
    var y = window.scrollY
    nav.classList.toggle('scrolled', y > 8)
    if (reduce) return
    var p = Math.min(1, Math.max(0, y / (window.innerHeight * 0.55)))
    var e = 1 - Math.pow(1 - p, 3)
    frame.style.setProperty('--tilt', (22 * (1 - e)).toFixed(2) + 'deg')
    frame.style.setProperty('--zoom', (0.9 + 0.1 * e).toFixed(4))
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  frame.addEventListener('animationend', function () {
    frame.classList.add('settled')
  })

  // the promo film: muted autoplay while it is on screen, sound on request
  var video = document.getElementById('promo')
  var sound = document.getElementById('promoSound')
  var timers = []
  function startDemo() {
    if (!video) return
    if (reduce) {
      video.removeAttribute('loop')
      return
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) {
              var p = video.play()
              if (p && p.catch) p.catch(function () {})
            } else video.pause()
          })
        },
        { threshold: 0.35 },
      ).observe(video)
    } else video.play()
  }
  if (sound && video) {
    sound.addEventListener('click', function (e) {
      e.stopPropagation()
      var on = video.muted
      video.muted = !on
      if (on && video.paused) video.play()
      sound.setAttribute('aria-pressed', on ? 'true' : 'false')
      sound.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기')
    })
  }

  // entering: the product window grows to fill the screen, then the app takes over
  var portal = document.getElementById('portal')
  var leaving = false
  function enter(e) {
    var href = e.currentTarget.getAttribute('href') || '/app'
    if (reduce || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    e.preventDefault()
    if (leaving) return
    leaving = true
    timers.forEach(clearTimeout)
    var shot = frame.querySelector('.shot').getBoundingClientRect()
    var vw = window.innerWidth,
      vh = window.innerHeight
    var visible = shot.bottom > 0 && shot.top < vh && shot.width > 0
    var r = visible ? shot : { left: vw * 0.2, top: vh * 0.3, width: vw * 0.6, height: vh * 0.6 }
    portal.querySelector('img').src = '/__web/intro/promo-poster.webp'
    portal.style.transition = 'none'
    portal.style.borderRadius = '14px'
    portal.style.transform =
      'translate(' +
      r.left +
      'px,' +
      r.top +
      'px) scale(' +
      r.width / vw +
      ',' +
      r.height / vh +
      ')'
    portal.style.visibility = 'visible'
    void portal.offsetWidth
    portal.style.transition = ''
    portal.classList.add('go')
    document.body.classList.add('leaving')
    requestAnimationFrame(function () {
      portal.style.transform = 'none'
      portal.style.borderRadius = '0'
    })
    setTimeout(function () {
      location.href = href
    }, 1050)
  }
  var links = document.querySelectorAll('a.enter, a.pill')
  for (var k = 0; k < links.length; k++) links[k].addEventListener('click', enter)
  frame.addEventListener('click', function () {
    links[0].click()
  })
  frame.style.cursor = 'pointer'

  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return
    leaving = false
    portal.classList.remove('go')
    portal.style.visibility = 'hidden'
    document.body.classList.remove('leaving')
  })

  // ---- opening: 똑 · 딱 · 똑딱작업실 · yellow flood · the page ----
  var root = document.documentElement
  var opening = document.getElementById('opening')
  var flood = document.getElementById('flood')
  var steps = []
  var finished = false
  function at(ms, fn) {
    steps.push(setTimeout(fn, ms))
  }
  function finish() {
    if (finished) return
    finished = true
    steps.forEach(clearTimeout)
    root.classList.remove('op')
    flood.style.visibility = 'hidden'
    removeSkip()
    startDemo()
  }
  function skip(e) {
    if (e.type !== 'keydown' || !/^(Meta|Control|Alt|Shift)$/.test(e.key)) finish()
  }
  var SKIP = ['pointerdown', 'keydown', 'wheel', 'touchstart']
  function removeSkip() {
    SKIP.forEach(function (t) {
      window.removeEventListener(t, skip)
    })
  }

  function play() {
    var word = document.getElementById('opWord')
    var mark = document.getElementById('opMark')
    var gap = parseFloat(getComputedStyle(word.parentNode).columnGap) || 0
    mark.style.setProperty('--shift', ((word.offsetWidth + gap) / 2).toFixed(1) + 'px')
    SKIP.forEach(function (t) {
      window.addEventListener(t, skip, { passive: true })
    })
    opening.classList.add('s0')
    at(220, function () {
      opening.classList.add('s1')
    })
    at(600, function () {
      opening.classList.add('s2')
    })
    at(1050, function () {
      opening.classList.add('s3')
    })
    at(2150, function () {
      var r = document.getElementById('opBar').getBoundingClientRect()
      var vw = window.innerWidth,
        vh = window.innerHeight
      flood.style.transition = 'none'
      flood.style.clipPath =
        'inset(' +
        r.top +
        'px ' +
        (vw - r.right) +
        'px ' +
        (vh - r.bottom) +
        'px ' +
        r.left +
        'px round ' +
        r.width / 2 +
        'px)'
      flood.style.visibility = 'visible'
      void flood.offsetWidth
      flood.style.transition = 'clip-path .62s cubic-bezier(.76, 0, .24, 1)'
      flood.style.clipPath = 'inset(0px 0px 0px 0px round 0px)'
    })
    at(2820, function () {
      // the page starts revealing under the yellow as it lifts away
      root.classList.remove('op')
      removeSkip()
      flood.style.transition = 'clip-path .78s cubic-bezier(.76, 0, .24, 1)'
      flood.style.clipPath = 'inset(0px 0px ' + window.innerHeight + 'px 0px round 0px)'
    })
    at(3700, function () {
      finished = true
      flood.style.visibility = 'hidden'
      startDemo()
    })
  }

  if (!root.classList.contains('op')) {
    finished = true
    startDemo()
  } else {
    // wait for the display font (at most 700 ms) so the wordmark lands in Pretendard
    var started = false
    var go = function () {
      if (!started) {
        started = true
        window.scrollTo(0, 0)
        play()
      }
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go)
    setTimeout(go, 700)
  }

  // the install prompt for an AI agent: one click copies it
  var copyBtn = document.getElementById('copyPrompt')
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var text = document.getElementById('agentPrompt').textContent
      var done = function () {
        copyBtn.textContent = '복사했어요'
        setTimeout(function () {
          copyBtn.textContent = '요청문 복사'
        }, 1800)
      }
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(text).then(done, function () {})
      else {
        var t = document.createElement('textarea')
        t.value = text
        document.body.appendChild(t)
        t.select()
        try {
          document.execCommand('copy')
          done()
        } catch (e) {}
        t.remove()
      }
    })
  }
})()
