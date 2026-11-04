import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WEB_APP_ORIGINS } from '../src/core/ids'
// @ts-expect-error a plain .mjs build script
import { storeManifest } from '../scripts/store-zip.mjs'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(HERE, 'extension/manifest.json'), 'utf8'))

describe('the Chrome Web Store package', () => {
  it('leaves out the key the store refuses', () => {
    expect(storeManifest({ ...manifest, key: 'K' })).not.toHaveProperty('key')
  })

  it('is called 똑딱작업실 and asks only for go.kr and the web app', () => {
    const m = storeManifest(manifest)
    expect(m.name).toBe('똑딱작업실')
    expect(m.host_permissions).toEqual(['https://*.go.kr/*', WEB_APP_ORIGINS[0] + '/*'])
    expect(m.permissions).toEqual(['storage', 'scripting', 'nativeMessaging'])
    expect(m.description.length).toBeLessThanOrEqual(132)
  })
})
