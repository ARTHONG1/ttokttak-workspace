/**
 * 똑딱생기부's installers: its own app id, name and folders (nothing shared with 똑딱작업실),
 * the built-in 똑딱AI from build/local-ai (scripts/prepare-ai.mjs) beside the app, and the
 * NEIS browser driver (playwright-core) in the packaged node_modules. No update feed yet:
 * releases go to their own repository later.
 */
const { existsSync, readFileSync } = require('node:fs')
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
    for (const file of ['model.gguf', m.adapter.file]) {
      if (!existsSync(join(__dirname, 'build/local-ai', file)))
        throw new Error('build/local-ai is missing ' + file)
    }
  },
}
