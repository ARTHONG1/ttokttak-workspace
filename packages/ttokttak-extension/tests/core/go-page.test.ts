import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EDUFINE_GO_URL, EXTENSION_ID, goUrl, WEB_APP_ORIGINS } from '../../src/core/ids'

const GO = join(dirname(fileURLToPath(import.meta.url)), '../../../../web/runtime/client')

describe('the /go page the desktop app opens', () => {
  it('talks to this extension (its id is written into the plain script)', () => {
    expect(readFileSync(join(GO, 'go.js'), 'utf8')).toContain("'" + EXTENSION_ID + "'")
  })

  it('lives on the web app the extension accepts messages from', () => {
    expect(goUrl('edufine-pumui')).toBe(WEB_APP_ORIGINS[0] + '/go?feature=edufine-pumui')
    // the address 0.15.5 and earlier open stays
    expect(EDUFINE_GO_URL).toBe(WEB_APP_ORIGINS[0] + '/edufine/go')
    expect(readFileSync(join(GO, 'go.html'), 'utf8')).toContain('src="/go.js"')
  })
})
