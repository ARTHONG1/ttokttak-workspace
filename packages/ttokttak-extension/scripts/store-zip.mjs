// The Chrome Web Store package of the 똑딱작업실 extension.
// Usage (from program/): node packages/ttokttak-extension/scripts/store-zip.mjs [--key key.pem] [out.zip]
// The store refuses a manifest "key"; the extension id comes instead from key.pem at the top
// of the zip on the first upload only (--key; the private key is kept off this repository).
// Later uploads go without it. The default out is packages/ttokttak-extension/dist-store/.
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')

/** the release manifest as the store takes it */
export function storeManifest(manifest) {
  const { key: _key, ...rest } = manifest
  return rest
}

export async function buildStoreZip(out, keyFile) {
  execFileSync(process.execPath, [join(HERE, 'build.mjs')], { cwd: HERE, stdio: 'inherit' })
  const stage = join(HERE, 'dist-store', 'stage')
  await rm(stage, { recursive: true, force: true })
  await cp(join(HERE, 'dist'), stage, { recursive: true })
  const manifest = JSON.parse(await readFile(join(stage, 'manifest.json'), 'utf8'))
  await writeFile(
    join(stage, 'manifest.json'),
    JSON.stringify(storeManifest(manifest), null, 2) + '\n',
  )
  if (keyFile) await cp(resolve(keyFile), join(stage, 'key.pem'))
  await mkdir(dirname(out), { recursive: true })
  await rm(out, { force: true })
  execFileSync('zip', ['-r', '-X', '-q', out, '.'], { cwd: stage })
  await rm(stage, { recursive: true, force: true })
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const k = args.indexOf('--key')
  const keyFile = k >= 0 ? args.splice(k, 2)[1] : undefined
  const { version } = JSON.parse(await readFile(join(HERE, 'package.json'), 'utf8'))
  const out = resolve(args[0] ?? join(HERE, 'dist-store', 'ttokttak-extension-' + version + '.zip'))
  console.log(
    'store zip ready:',
    await buildStoreZip(out, keyFile),
    keyFile ? '(with key.pem)' : '',
  )
}
