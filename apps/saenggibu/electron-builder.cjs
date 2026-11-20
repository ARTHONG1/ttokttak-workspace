/**
 * 똑딱생기부's installers: its own app id, name and folders (nothing shared with 똑딱작업실),
 * the built-in 똑딱AI's server from build/local-ai (scripts/prepare-ai.mjs) beside the app
 * (the model is downloaded on first launch), and the NEIS browser driver (playwright-core) in
 * the packaged node_modules. Released on github.com/ARTHONG1/ttokttak-saenggibu; no update
 * feed yet: a new version is installed over the old one.
 */
const { existsSync, readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

/** ASCII: it names the installed app, its folders and the installer files */
const PRODUCT_NAME = 'TtokttakSaenggibu'

module.exports = {
  appId: 'kr.ttokttak.saenggibu',
  productName: PRODUCT_NAME,
  // the installed electron package's exact version (package.json holds a range)
  electronVersion: require('electron/package.json').version,
  copyright: 'Copyright © 2026 똑딱생기부',
  directories: { output: 'release', buildResources: 'resources' },
  files: ['out/**', 'package.json'],
  extraResources: [
    { from: 'build/local-ai', to: 'local-ai' },
    { from: '../../LICENSE', to: 'LICENSE.txt' },
    // the Apache-2.0 NOTICE of the code this app shares its 생기부 page with (똑딱작업실)
    { from: '../../NOTICE', to: 'NOTICE.txt' },
  ],
  npmRebuild: false,
  publish: null,
  mac: {
    category: 'public.app-category.education',
    target: [
      { target: 'dmg', arch: ['arm64'] },
      { target: 'zip', arch: ['arm64'] },
    ],
    // no Apple Developer ID: signed ad hoc (Apple Silicon needs a signature to run at all),
    // not notarized, hardened runtime off as for 똑딱작업실 (its library validation rejects
    // the ad hoc-signed Electron frameworks). First launch needs "Open Anyway".
    identity: '-',
    hardenedRuntime: false,
    notarize: false,
  },
  dmg: {
    sign: false,
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: '똑딱생기부',
    artifactName: '${productName}-Setup-${version}.${ext}',
  },
  // an installer without the built-in 똑딱AI would open and then fail at the first answer
  beforePack: async () => {
    const manifest = join(__dirname, 'build/local-ai/manifest.json')
    if (!existsSync(manifest)) throw new Error('Run scripts/prepare-ai.mjs before packaging')
    const m = JSON.parse(readFileSync(manifest, 'utf8'))
    // the runtime only: the app downloads 똑딱AI's base and 생기부 adapter on first launch. A
    // model left in build/local-ai (an older staging) would push the installer past 2 GB.
    if (!m.downloaded || !Array.isArray(m.models) || m.models.length !== 2)
      throw new Error('build/local-ai is an older staging: run scripts/prepare-ai.mjs again')
    if (
      readdirSync(join(__dirname, 'build/local-ai'), { recursive: true }).some((f) =>
        /\.gguf$/.test(String(f)),
      )
    )
      throw new Error('build/local-ai holds a model: the installer must not include it')
    const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    if (!existsSync(join(__dirname, 'build/local-ai', exe)))
      throw new Error('build/local-ai is missing ' + exe)
  },
}
