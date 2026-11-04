import { describe, expect, it } from 'vitest'
import { openPumuiMenu } from '../../../src/sites/edufine/menu'
import { DEFAULT_SCREEN_MAP, parseScreenMap } from '../../../src/sites/edufine/screen-map'

const map = DEFAULT_SCREEN_MAP

function app(opts: { menuRows?: number; noFn?: boolean } = {}) {
  const calls: unknown[] = []
  const left = opts.noFn ? {} : { gfnOpenMenu: (id: string) => calls.push(id) }
  const nx = {
    getApplication: () => ({
      mainframe: { MainVFrameSet: { SubHFrameSet: { LeftFrame: { form: left } } } },
      gdsMenu: {
        rowcount: opts.menuRows ?? 1,
        getColumn: () => '',
        setColumn: () => true,
      },
    }),
  }
  return { nx, calls }
}

describe('openPumuiMenu', () => {
  it('opens the 품의등록 menu with K-에듀파인 own function', () => {
    const { nx, calls } = app()
    expect(openPumuiMenu(nx, map)).toBe('opened')
    expect(calls).toEqual(['A00FAA0104001001'])
  })

  it('waits while the menu list is still loading', () => {
    const { nx, calls } = app({ menuRows: 0 })
    expect(openPumuiMenu(nx, map)).toBe('not-ready')
    expect(calls).toEqual([])
  })

  it('leaves a K-에듀파인 without that function alone, and a table without menu names too', () => {
    expect(openPumuiMenu(app({ noFn: true }).nx, map)).toBe('unavailable')
    expect(openPumuiMenu(app().nx, { ...map, menu: undefined })).toBe('unavailable')
    expect(openPumuiMenu(undefined, map)).toBe('unavailable')
  })

  it('reads 화면 이름표 files with or without the menu part, and refuses a broken one', () => {
    const { menu: _menu, ...old } = map
    expect(parseScreenMap(JSON.stringify(old))).not.toBeNull()
    expect(parseScreenMap(JSON.stringify(map))?.menu?.pumuiMenuId).toBe('A00FAA0104001001')
    expect(
      parseScreenMap(JSON.stringify({ ...map, menu: { ...map.menu, openFn: 'x(); alert' } })),
    ).toBeNull()
  })
})
