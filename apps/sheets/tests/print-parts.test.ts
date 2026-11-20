import { describe, expect, it } from 'vitest'
import { splitPrintParts } from '../src/renderer/print-html'

// a long workbook's whole-file PDF goes in parts that each fit one request (the preload
// refuses print HTML past 20 million characters); a 96-sheet statistics workbook failed
// outright before (2026-11-21)
const sheet = (sheetName: string, size: number) => ({ sheetName, size })
const under = (limit: number) => (run: readonly { size: number }[]) =>
  run.reduce((sum, s) => sum + s.size, 0) <= limit

describe('splitPrintParts', () => {
  it('keeps every sheet, in order, in runs that each fit', () => {
    const sheets = [sheet('a', 4), sheet('b', 4), sheet('c', 4), sheet('d', 1), sheet('e', 9)]
    const { runs, alone } = splitPrintParts(sheets, under(9))
    expect(runs.map((run) => run.map((s) => s.sheetName))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(alone).toEqual([])
  })

  it('names a sheet too large even alone and goes on with the rest', () => {
    const { runs, alone } = splitPrintParts(
      [sheet('a', 2), sheet('huge', 50), sheet('b', 2)],
      under(9),
    )
    expect(runs.map((run) => run.map((s) => s.sheetName))).toEqual([['a'], ['b']])
    expect(alone).toEqual(['huge'])
  })

  it('makes one run of a workbook that fits at once, and none of an empty one', () => {
    expect(splitPrintParts([sheet('a', 1), sheet('b', 1)], under(9)).runs).toHaveLength(1)
    expect(splitPrintParts([], under(9))).toEqual({ runs: [], alone: [] })
  })
})
