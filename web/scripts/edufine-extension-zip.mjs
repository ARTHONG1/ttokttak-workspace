// Builds the 똑딱작업실 extension from source and zips it for the intro page's 테스트 download.
// Usage (from program/): node web/scripts/edufine-extension-zip.mjs [out.zip]
// The default out is web/runtime/client/edufine/extension.zip (git-ignored), which the gateway
// serves at /edufine/extension.zip. web/build.mjs writes it into the web bundle on every build.
import { execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXT = join(ROOT, 'packages', 'ttokttak-extension')

export async function buildExtensionZip(out) {
  // the release build: no test-only host permissions (build.mjs --dev adds those)
  execFileSync(process.execPath, [join(EXT, 'build.mjs')], { cwd: EXT, stdio: 'inherit' })
  await mkdir(dirname(out), { recursive: true })
  await rm(out, { force: true })
  // files at the top level, as Chrome's "load unpacked" expects after unzipping
  execFileSync('zip', ['-r', '-X', '-q', out, '.'], { cwd: join(EXT, 'dist') })
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(
    process.argv[2] ?? join(ROOT, 'web', 'runtime', 'client', 'edufine', 'extension.zip'),
  )
  console.log('extension zip ready:', await buildExtensionZip(out))
}
