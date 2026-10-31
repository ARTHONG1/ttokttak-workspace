;(function () {
  'use strict'
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // the bar gets its line once the page moves
  var nav = document.getElementById('nav')
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 4) }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  // sections rise in once as they come into view
  if (!reduce && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js')
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    document.querySelectorAll('.rv').forEach(function (el) { io.observe(el) })
  }

  // before / after on the real document
  var compare = document.getElementById('compare')
  if (compare) {
    var segs = compare.querySelectorAll('[data-show]')
    segs.forEach(function (b) {
      b.addEventListener('click', function () {
        var show = b.getAttribute('data-show')
        compare.setAttribute('data-state', show)
        segs.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false') })
      })
    })
  }
})()
