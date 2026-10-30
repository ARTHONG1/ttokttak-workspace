// Builds the intro page's open-source map (web/runtime/client/intro/oss-graph.json).
// The nodes are exactly the npm packages THIRD-PARTY-NOTICES.txt lists; the links are their
// runtime dependencies among themselves, plus the editors (apps/*) that import them directly.
// Positions are laid out here once (d3-force) so the page only draws.
// Run from program/: node web/scripts/make-oss-graph.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceRadial, forceX, forceY } from 'd3-force'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const notices = readFileSync(join(ROOT, 'apps/shell/build/THIRD-PARTY-NOTICES.txt'), 'utf8')
const listed = [...notices.matchAll(/^-{20,}\n(.+?) v([0-9][^ ]*) — (.+)$/gm)].map((m) => ({ name: m[1], version: m[2], license: m[3] }))
const names = new Set(listed.map((p) => p.name))

const APPS = ['shell', 'docs', 'sheets', 'slides', 'pdf', 'hwp', 'markdown', 'html', 'mindmap', 'epub']
const APP_LABEL = { shell: '작업실', docs: '워드', sheets: '엑셀', slides: 'PPT', pdf: 'PDF', hwp: '한글', markdown: '마크다운', html: 'HTML', mindmap: '마인드맵', epub: 'EPUB' }

function pkgJson(name) {
  const dirs = [join(ROOT, 'node_modules', name), ...APPS.map((a) => join(ROOT, 'apps', a, 'node_modules', name)), join(ROOT, 'vendor', name.replace('@rhwp/', 'rhwp-'))]
  for (const d of dirs) if (existsSync(join(d, 'package.json'))) return JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'))
  return null
}

const links = []
const seen = new Set()
const link = (s, t, kind) => {
  const k = s + '>' + t
  if (s === t || seen.has(k)) return
  seen.add(k)
  links.push({ source: s, target: t, kind })
}
for (const p of listed) {
  const j = pkgJson(p.name)
  if (!j) continue
  for (const d of Object.keys({ ...(j.dependencies || {}), ...(j.peerDependencies || {}) })) if (names.has(d)) link(p.name, d, 'dep')
}
// which editor uses a package: directly, or through the internal engines (packages/*) it depends on
const owner = new Map()
const internal = new Map()
for (const d of readdirSync(join(ROOT, 'packages'))) {
  const f = join(ROOT, 'packages', d, 'package.json')
  if (existsSync(f)) { const j = JSON.parse(readFileSync(f, 'utf8')); internal.set(j.name, j) }
}
function reach(deps, out, guard = new Set()) {
  for (const d of Object.keys(deps || {})) {
    if (names.has(d)) out.add(d)
    else if (internal.has(d) && !guard.has(d)) { guard.add(d); reach(internal.get(d).dependencies, out, guard) }
  }
  return out
}
// editors first, the shell last: a package the shell also loads still belongs to its editor
for (const a of [...APPS.filter((x) => x !== 'shell'), 'shell']) {
  const j = JSON.parse(readFileSync(join(ROOT, 'apps', a, 'package.json'), 'utf8'))
  for (const d of reach({ ...(j.dependencies || {}), ...(j.devDependencies || {}) }, new Set())) {
    link('app:' + a, d, 'app')
    if (!owner.has(d)) owner.set(d, a)
  }
}
// packages only reached through others take the editor of whoever pulls them in
const bySource = new Map()
for (const l of links) if (l.kind === 'dep') (bySource.get(l.source) || bySource.set(l.source, []).get(l.source)).push(l.target)
let changed = true
while (changed) {
  changed = false
  for (const [s, ts] of bySource) {
    const o = owner.get(s)
    if (!o) continue
    for (const t of ts) if (!owner.has(t)) { owner.set(t, o); changed = true }
  }
}

const degree = new Map()
for (const l of links) { degree.set(l.source, (degree.get(l.source) || 0) + 1); degree.set(l.target, (degree.get(l.target) || 0) + 1) }
const nodes = [
  { id: 'core', label: '똑딱작업실', group: 'core', r: 18 },
  ...APPS.map((a) => ({ id: 'app:' + a, label: APP_LABEL[a], group: a, r: 9 })),
  ...listed.map((p) => ({ id: p.name, label: p.name, group: owner.get(p.name) || 'shell', license: p.license, version: p.version, r: Math.min(6, 1.4 + Math.sqrt(degree.get(p.name) || 0) * 0.7) })),
]
for (const a of APPS) link('core', 'app:' + a, 'core')
// a few are loaded by the shell process itself (native canvas, browser automation): tie them to it
for (const n of nodes) if (n.license && !degree.has(n.id)) link('app:shell', n.id, 'app')

// the core sits in the middle and the ten editors on an even ring around it, so their
// labels never pile up; the packages settle around whichever editor pulls them in
const RING = 175
nodes[0].fx = 0
nodes[0].fy = 0
APPS.forEach((a, i) => {
  const t = (i / APPS.length) * Math.PI * 2 - Math.PI / 2
  const n = nodes[1 + i]
  n.fx = Math.cos(t) * RING
  n.fy = Math.sin(t) * RING
})
const home = new Map(APPS.map((a, i) => [a, nodes[1 + i]]))
const sim = forceSimulation(nodes)
  .force('link', forceLink(links).id((d) => d.id).distance((l) => (l.kind === 'core' ? RING : l.kind === 'app' ? 95 : 20)).strength((l) => (l.kind === 'dep' ? 0.4 : l.kind === 'app' ? 0.05 : 0)))
  .force('charge', forceManyBody().strength((d) => (d.r >= 9 ? -300 : -16)).distanceMax(360))
  .force('collide', forceCollide().radius((d) => d.r + 1.6))
  .force('x', forceX((d) => (home.get(d.group) ? home.get(d.group).fx * 2.1 : 0)).strength((d) => (d.r >= 9 ? 0 : 0.045)))
  .force('y', forceY((d) => (home.get(d.group) ? home.get(d.group).fy * 2.1 : 0)).strength((d) => (d.r >= 9 ? 0 : 0.045)))
  .force('radial', forceRadial(330, 0, 0).strength((d) => (d.r >= 9 ? 0 : 0.03)))
  .stop()
for (let i = 0; i < 600; i++) sim.tick()

// centre the drawing on the core and fit it into a 1000-unit square the page scales
const span = Math.max(...nodes.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y)) + n.r))
const fit = 500 / span
for (const n of nodes) { n.x *= fit; n.y *= fit }
const round = (n) => Math.round(n * 10) / 10
const index = new Map(nodes.map((n, i) => [n.id, i]))
const out = {
  generated: new Date().toISOString().slice(0, 10),
  packages: listed.length,
  licenses: Object.entries(listed.reduce((m, p) => ((m[p.license] = (m[p.license] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]),
  groups: APPS.map((a) => [a, APP_LABEL[a]]),
  nodes: nodes.map((n) => [round(n.x), round(n.y), round(n.r), n.group, n.label, n.license || '']),
  links: links.map((l) => [index.get(l.source.id ?? l.source), index.get(l.target.id ?? l.target), l.kind === 'dep' ? 0 : 1]),
}
const file = join(ROOT, 'web/runtime/client/intro/oss-graph.json')
writeFileSync(file, JSON.stringify(out))
console.log('graph:', out.nodes.length, 'nodes', out.links.length, 'links', Math.round(JSON.stringify(out).length / 1024) + 'KB', 'unowned', listed.filter((p) => !owner.has(p.name)).length)

