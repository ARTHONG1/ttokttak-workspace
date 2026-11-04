import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCREEN_MAP, parseScreenMap } from '../../../src/sites/edufine/screen-map'

// The web app serves the current 화면 이름표 at /edufine/screen-map.json. It may be
// fixed ahead of an extension release (a different 교육청 or K-에듀파인 version); the
// next release then takes the same table as its default, which this test enforces.
const FILE = join(__dirname, '../../../../../web/runtime/client/edufine/screen-map.json')

describe('the 화면 이름표 the web app serves', () => {
  it('is a table this extension reads and equals the built-in default', () => {
    const map = parseScreenMap(readFileSync(FILE, 'utf8'))
    expect(map).not.toBeNull()
    expect(map).toEqual(DEFAULT_SCREEN_MAP)
  })
})
