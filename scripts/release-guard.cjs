// Release guard: refuses to package or deploy a build that is not the committed code.
//
// 2026-11-03 incident: the web image and an installed app were assembled from
// another work folder whose shell bundle had been built from uncommitted
// changes. That bundle carried PRODUCT_NAME = "똑딱작업실", which is also the AI
// User-Agent and the Codex client name; fetch rejects header characters above
// 255, so every AI request failed ("Cannot convert argument to a ByteString").
//
// Used by web/build.mjs (web image) and apps/shell/electron-builder.cjs
// (beforePack, desktop installers). Checks, from the program root:
//   1. git working tree is clean (tracked and untracked; ignored files are fine)
//   2. no build output is older than a tracked source file
//   3. no built main bundle sets PRODUCT_NAME to anything but printable ASCII
// TTOKTTAK_ALLOW_UNSAFE_BUILD=1 turns failures into warnings, for local
// experiments only; never use it for a release or a deploy.
const { execFileSync } = require('node:child_process')
const { existsSync, statSync } = require('node:fs')
const { join } = require('node:path')

const APPS = [
  'shell',
  'docs',
  'sheets',
  'slides',
  'pdf',
  'markdown',
  'html',
  'mindmap',
  'hwp',
  'epub',
]

/** PRODUCT_NAME values in a bundle that cannot go into an HTTP header */
function nonAsciiProductNames(bundle) {
  const bad = []
  const re = /const PRODUCT_NAME(?:\$\d+)? = "([^"]*)"/g
  for (let m = re.exec(bundle); m; m = re.exec(bundle)) {
    if (!/^[\x20-\x7e]+$/.test(m[1])) bad.push(m[1])
  }
  return bad
}

/** outputs written before the newest source change */
function staleOutputs(outputs, sources) {
  let newest = null
  for (const s of sources) if (!newest || s.mtimeMs > newest.mtimeMs) newest = s
  if (!newest) return []
  return outputs
    .filter((o) => o.mtimeMs < newest.mtimeMs)
    .map((o) => ({ output: o.path, newerSource: newest.path }))
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function checkReleaseTree(root, apps = APPS) {
  const problems = []
  let inGit = true
  try {
    git(root, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    inGit = false
  }

  if (inGit) {
    const dirty = git(root, ['status', '--porcelain']).replace(/\n+$/, '')
    if (dirty.trim()) {
      const lines = dirty.split('\n')
      problems.push(
        'uncommitted changes (커밋 안 된 변경) — commit or stash them first:\n    ' +
          lines.slice(0, 10).join('\n    ') +
          (lines.length > 10 ? '\n    … ' + (lines.length - 10) + ' more' : ''),
      )
    }
  }

  const outputs = []
  for (const app of apps) {
    const rel = 'apps/' + app + '/out/main/index.js'
    const file = join(root, rel)
    if (!existsSync(file)) {
      problems.push('missing build output (빌드 결과 없음): ' + rel + ' — run npm run build:all')
      continue
    }
    outputs.push({ path: rel, mtimeMs: statSync(file).mtimeMs })
    const bad = nonAsciiProductNames(require('node:fs').readFileSync(file, 'utf8'))
    if (bad.length) {
      problems.push(
        rel +
          ' sets PRODUCT_NAME to "' +
          bad[0] +
          '" (내부 이름에 한글) — it goes into HTTP headers and must be ASCII; see packages/i18n/AGENTS.md',
      )
    }
  }

  if (inGit && outputs.length) {
    // :(glob) — a plain 'apps/*/src' pathspec matches no file under the folder
    const tracked = git(root, [
      'ls-files',
      '-z',
      '--',
      ':(glob)apps/*/src/**',
      ':(glob)packages/*/src/**',
      ':(glob)apps/*/package.json',
      ':(glob)packages/*/package.json',
    ])
      .split('\0')
      .filter(Boolean)
    const sources = []
    for (const rel of tracked) {
      const file = join(root, rel)
      if (existsSync(file)) sources.push({ path: rel, mtimeMs: statSync(file).mtimeMs })
    }
    const stale = staleOutputs(outputs, sources)
    if (stale.length) {
      problems.push(
        'build output older than the sources (빌드가 소스보다 오래됨) — run npm run build:all; newest source: ' +
          stale[0].newerSource +
          '\n    ' +
          stale.map((s) => s.output).join('\n    '),
      )
    }
  }
  return problems
}

function assertReleaseTree(root, what, apps) {
  const problems = checkReleaseTree(root, apps)
  if (!problems.length) return
  const text =
    '[release-guard] ' +
    what +
    ' refused (배포·패키징 중단):\n  - ' +
    problems.join('\n  - ') +
    '\nRules: AGENTS.md section 0 of the workspace; build and ship only the committed main.'
  if (process.env.TTOKTTAK_ALLOW_UNSAFE_BUILD === '1') {
    console.warn(
      text +
        '\n[release-guard] TTOKTTAK_ALLOW_UNSAFE_BUILD=1: continuing — NOT for a release or deploy',
    )
    return
  }
  throw new Error(text)
}

module.exports = { APPS, nonAsciiProductNames, staleOutputs, checkReleaseTree, assertReleaseTree }
