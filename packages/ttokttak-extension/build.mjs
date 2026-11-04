// Builds the 똑딱작업실 extension into dist/ (and the test page into dist-test/).
// node build.mjs [--dev]   --dev adds http://127.0.0.1 to the host permissions and
//                          the web app matches, for the browser tests on this machine.
import { build } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, 'dist')
const dev = process.argv.includes('--dev')
const pkg = JSON.parse(await readFile(join(HERE, 'package.json'), 'utf8'))
const ids = await readFile(join(HERE, 'src/core/ids.ts'), 'utf8')
const key = /EXTENSION_PUBLIC_KEY =\s*'([^']+)'/.exec(ids)?.[1]
if (!key) throw new Error('EXTENSION_PUBLIC_KEY not found in src/core/ids.ts')

await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })
await build({
  entryPoints: ['page-main', 'page-bridge', 'background', 'popup'].map((n) =>
    join(HERE, 'src/ext', n + '.ts'),
  ),
  outdir: DIST,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  charset: 'utf8',
  legalComments: 'none',
  define: { __DEV__: JSON.stringify(dev), __VERSION__: JSON.stringify(pkg.version) },
})
const manifest = JSON.parse(await readFile(join(HERE, 'extension/manifest.json'), 'utf8'))
manifest.version = pkg.version
manifest.key = key
if (dev) {
  manifest.name += ' (개발)'
  manifest.host_permissions.push('http://127.0.0.1/*')
  manifest.externally_connectable.matches.push('http://127.0.0.1/*')
  for (const script of manifest.content_scripts) script.matches.push('http://127.0.0.1/*')
}
await writeFile(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await cp(join(HERE, 'extension/popup.html'), join(DIST, 'popup.html'))
await cp(join(HERE, 'extension/icons'), join(DIST, 'icons'), { recursive: true })

if (dev) {
  const TEST = join(HERE, 'dist-test')
  await rm(TEST, { recursive: true, force: true })
  await build({
    entryPoints: [
      join(HERE, 'tests/fixtures/fake-page.ts'),
      join(HERE, 'tests/fixtures/web-sender.ts'),
    ],
    outdir: TEST,
    bundle: true,
    format: 'iife',
    target: 'chrome110',
    charset: 'utf8',
  })
  await cp(join(HERE, 'tests/fixtures/fake-edufine.html'), join(TEST, 'fake-edufine.html'))
  await cp(join(HERE, 'tests/fixtures/web-sender.html'), join(TEST, 'web-sender.html'))
  // the web app's /go page (also at /edufine/go), served from the test server like the web app
  const GO = join(HERE, '../../web/runtime/client')
  await mkdir(join(TEST, 'edufine'), { recursive: true })
  await cp(join(GO, 'go.html'), join(TEST, 'go.html'))
  await cp(join(GO, 'go.html'), join(TEST, 'edufine', 'go.html'))
  await cp(join(GO, 'go.js'), join(TEST, 'go.js'))
  // the native messaging host as Chrome starts it, for e2e/native.spec.ts
  await build({
    entryPoints: [join(HERE, 'tests/fixtures/native-host-entry.ts')],
    outfile: join(TEST, 'native-host.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
  })
}
console.log('built', dev ? 'dev' : 'release', 'extension', pkg.version, '→', DIST)
