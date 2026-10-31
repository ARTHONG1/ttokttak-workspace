// Assembles the Cloud Run build context of the web edition in web/dist.
// The desktop app's built modules run unchanged behind web/runtime (fake 'electron' + gateway).
// Usage (from program/): node web/build.mjs [--rebuild]   (--rebuild runs npm run build:all first)
import { cp, mkdir, rm, writeFile, stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = dirname(fileURLToPath(import.meta.url))
const ROOT = join(WEB, '..')
const DIST = join(WEB, 'dist')
const APP = join(DIST, 'app')
const require = createRequire(join(ROOT, 'package.json'))
const APPS = ['shell', 'docs', 'sheets', 'slides', 'pdf', 'markdown', 'html', 'mindmap', 'hwp', 'epub']

if (process.argv.includes('--rebuild')) execFileSync('npm', ['run', 'build:all'], { cwd: ROOT, stdio: 'inherit' })

await rm(DIST, { recursive: true, force: true })
await mkdir(APP, { recursive: true })
const exists = async (p) => !!(await stat(p).catch(() => null))
const copy = async (rel, filter) => {
  const from = join(ROOT, rel)
  if (!(await exists(from))) return
  await cp(from, join(APP, rel), { recursive: true, filter: filter ?? (() => true) })
}
const noMaps = (src) => !src.endsWith('.map')

for (const app of APPS) {
  if (!(await exists(join(ROOT, 'apps', app, 'out')))) throw new Error('missing build output: apps/' + app + '/out (run with --rebuild)')
  await copy('apps/' + app + '/out', noMaps)
  await copy('apps/' + app + '/resources')
  await copy('apps/' + app + '/package.json')
}
await copy('apps/shell/build', (src) => !/\.(icns|ico)$/.test(src))
await copy('apps/docs/build')
await copy('packages/ui/template-fonts')
await copy('packages/cli/package.json')
await copy('packages/cli/dist', noMaps)
await copy('packages/cli/bin')
await copy('skills')
await copy('vendor/rhwp-core', (src) => !src.includes('/patches'))
// the XLSX engine is compiled for Linux in the image build
for (const f of ['Cargo.toml', 'Cargo.lock', 'src']) await copy('apps/sheets/native/xlsx-engine/' + f)
await copy('web/runtime')

// The engines the desktop installer ships under Resources/wasm (apps/shell/electron-builder.cjs
// extraResources). The bundled main falls back to process.resourcesPath/wasm when node_modules is
// absent, and the web image installs no editor dependencies: without these, PDF saves with text
// edits fail with 'The "path" argument must be of type string' (wasm-path.ts packagedPath).
const WASM = [
  ['node_modules/@embedpdf/pdfium/dist/pdfium.wasm', 'pdfium.wasm'],
  ['apps/pdf/node_modules/harfbuzzjs/hb-subset.wasm', 'hb-subset.wasm'],
  ['node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', 'qpdf.wasm'],
  ['node_modules/@rhwp/core/rhwp_bg.wasm', 'rhwp_bg.wasm'],
]
await mkdir(join(APP, 'resources', 'wasm'), { recursive: true })
for (const [from, name] of WASM) {
  if (!(await exists(join(ROOT, from)))) throw new Error('missing wasm for the web image: ' + from)
  await cp(join(ROOT, from), join(APP, 'resources', 'wasm', name))
}

const version = (n) => require(n + '/package.json').version
await writeFile(
  join(APP, 'package.json'),
  JSON.stringify(
    {
      name: 'hangul-ai-workbench-web',
      private: true,
      dependencies: {
        ws: version('ws'),
        ajv: version('ajv'),
        'ajv-formats': version('ajv-formats'),
        // web-auth.mjs: checks Firebase sign-in tokens
        jose: version('jose'),
        '@rhwp/core': 'file:./vendor/rhwp-core',
      },
    },
    null,
    2,
  ) + '\n',
)
await cp(join(WEB, 'Dockerfile'), join(DIST, 'Dockerfile'))
await cp(join(WEB, 'cloudbuild.yaml'), join(DIST, 'cloudbuild.yaml'))
await writeFile(join(DIST, '.gcloudignore'), '.gcloudignore\n**/node_modules/\n')
console.log('web build context ready:', DIST)

