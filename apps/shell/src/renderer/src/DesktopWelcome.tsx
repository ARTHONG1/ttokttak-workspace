import { useMemo } from 'react'
import { introLinkKey } from '../../shared/intro-links'
import graph from '../../../../../web/runtime/client/intro/oss-graph.json?raw'
import intro from '../../../../../web/runtime/client/intro.html?raw'
import introCss from '../../../../../web/runtime/client/intro.css?raw'
import poster from '../../../../../web/runtime/client/intro/promo-poster.webp?url'
import video from '../../../../../web/runtime/client/intro/promo-v2-h264.mp4?url'

export function DesktopWelcome({ onConnect, onStart }: { onConnect: () => void; onStart: () => void }) {
  const page = useMemo(() => {
    const doc = new DOMParser().parseFromString(intro, 'text/html')
    doc.querySelectorAll('script, link').forEach((el) => el.remove())
    doc.querySelectorAll('[src="/__web/intro/promo-poster.webp"]').forEach((el) => el.setAttribute('src', poster))
    doc.querySelectorAll('video source').forEach((el) => { if (el.getAttribute('type') === 'video/mp4') el.setAttribute('src', video); else el.remove() })
    doc.querySelectorAll('video').forEach((el) => {
      el.removeAttribute('autoplay')
      el.setAttribute('controls', '')
      el.setAttribute('poster', poster)
    })
    const nav = doc.querySelector('.nav-cta')
    if (nav) { nav.textContent = '시작하기'; nav.setAttribute('data-action', 'start') }
    const primary = doc.querySelector('.cta .primary')
    if (primary) { primary.textContent = '연결하기'; primary.setAttribute('data-action', 'connect') }
    const secondary = doc.querySelector('.cta .ghost')
    if (secondary) { secondary.textContent = '시작하기'; secondary.setAttribute('data-action', 'start') }
    const pill = doc.querySelector('.pill')
    if (pill) { pill.textContent = '내 AI와 함께하는 똑딱작업실'; pill.setAttribute('data-action', 'connect') }
    const data = JSON.parse(graph) as { nodes: [number, number, number, string, string, string][], links: [number, number, number][], groups: [string, string][] }
    const colors: Record<string, string> = { core: '#ffd60a', shell: '#c9ccd6', docs: '#5b8cff', sheets: '#3ecf8e', slides: '#ff8a4c', pdf: '#ff5c6c', hwp: '#4fc3ff', markdown: '#b48cff', html: '#ffb84d', mindmap: '#ff6fb5', epub: '#7ee0d2' }
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '-540 -540 1080 1080')
    svg.setAttribute('aria-label', '오픈소스 구성 관계도')
    svg.setAttribute('style', 'width:100%;height:100%;position:absolute;inset:0')
    for (const [a, b] of data.links) {
      const x = data.nodes[a], y = data.nodes[b]
      if (!x || !y) continue
      const line = doc.createElementNS(svg.namespaceURI, 'line')
      for (const [key, value] of Object.entries({ x1: x[0], y1: x[1], x2: y[0], y2: y[1] })) line.setAttribute(key, String(value))
      line.setAttribute('stroke', '#536079'); line.setAttribute('stroke-opacity', '.25'); svg.append(line)
    }
    for (const [x, y, radius, group, label, license] of data.nodes) {
      const circle = doc.createElementNS(svg.namespaceURI, 'circle')
      circle.setAttribute('cx', String(x)); circle.setAttribute('cy', String(y)); circle.setAttribute('r', String(Math.max(radius, 2)))
      circle.setAttribute('fill', colors[group] ?? '#aaa')
      const title = doc.createElementNS(svg.namespaceURI, 'title'); title.textContent = [label, license].filter(Boolean).join(' · '); circle.append(title); svg.append(circle)
    }
    doc.getElementById('uniCanvas')?.replaceWith(svg)
    const legend = doc.getElementById('uniLegend')
    for (const [key, label] of data.groups) { const li = doc.createElement('li'); const dot = doc.createElement('i'); dot.style.background = colors[key] ?? '#aaa'; li.append(dot, label); legend?.append(li) }
    const licenseLink = doc.querySelector('a[href="/__web/licenses"]')
    licenseLink?.setAttribute('href', 'https://github.com/ARTHONG1/ttokttak-workspace')
    const style = doc.createElement('style')
    style.textContent = `${introCss}
.rv { opacity: 1 !important; transform: none !important; filter: none !important; } .aura { filter: none; animation: none; } .pill i { animation: none; } .frame { transform: none; } *, *::before, *::after { animation: none !important; } .beam { filter: none; }`
    doc.head.append(style)
    return '<!doctype html>' + doc.documentElement.outerHTML
  }, [])
  return <iframe title="똑딱작업실 소개" sandbox="allow-same-origin" srcDoc={page} style={{ border: 0, width: '100%', height: '100%' }} onLoad={(event) => {
    const doc = event.currentTarget.contentDocument
    doc?.addEventListener('click', (e) => {
      const el = (e.target as Element).closest('a')
      if (!el) return
      const action = el.getAttribute('data-action')
      if (action === 'connect') { e.preventDefault(); onConnect() }
      else if (action === 'start') { e.preventDefault(); onStart() }
      else if (!el.getAttribute('href')?.startsWith('#')) {
        e.preventDefault()
        const key = introLinkKey(el.getAttribute('href') ?? '')
        if (key) void window.aiOffice.openFeatureLink(key)
      }
    })
  }} />
}
