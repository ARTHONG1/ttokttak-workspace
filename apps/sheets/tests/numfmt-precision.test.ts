import { createRequire } from 'node:module'
import * as numfmt from 'numfmt'
import { describe, expect, it } from 'vitest'

// tools/patch-deps.mjs (npm postinstall): numfmt 3.2.6 showed the binary error of a value
// under a format with many optional decimals, where Excel shows 15 significant digits
const FMT = '#,##0.0#####################'

describe('numfmt keeps 15 significant digits, as Excel', () => {
  it('in the module the grid formats with', () => {
    expect(numfmt.format(FMT, 501.13)).toBe('501.13')
    expect(numfmt.format(FMT, 0.1 + 0.2)).toBe('0.3')
    expect(numfmt.format(FMT, -501.13)).toBe('-501.13')
    expect(numfmt.format(FMT, 1066.46)).toBe('1,066.46')
    expect(numfmt.format('0.00', 2.675)).toBe('2.68')
    expect(numfmt.format('0.000000', 0.000123456)).toBe('0.000123')
    expect(numfmt.format(FMT, 123456789012.5)).toBe('123,456,789,012.5')
  })

  it('in the CommonJS build the command line and main process load', () => {
    const cjs = createRequire(import.meta.url)('numfmt') as typeof numfmt
    expect(cjs.format(FMT, 501.13)).toBe('501.13')
  })
})
