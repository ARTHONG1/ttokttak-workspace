import { describe, expect, it } from 'vitest'
import { openMenu } from '../../../src/sites/edufine/menu'
import { DEFAULT_SCREEN_MAP, parseScreenMap } from '../../../src/sites/edufine/screen-map'

const map = DEFAULT_SCREEN_MAP
const PUMUI = map.menu!.pumuiMenuId

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

describe('openMenu', () => {
  it('opens the 품의등록 menu with K-에듀파인 own function', () => {
    const { nx, calls } = app()
    expect(openMenu(nx, map, PUMUI)).toBe('opened')
    expect(calls).toEqual(['A00FAA0104001001'])
  })

  it("opens another task's menu by its id, and refuses an id that is not one", () => {
    const { nx, calls } = app()
    expect(openMenu(nx, map, 'A00FAA0105001001')).toBe('opened')
    expect(openMenu(nx, map, "x'); alert(1")).toBe('unavailable')
    expect(openMenu(nx, map, undefined)).toBe('unavailable')
    expect(calls).toEqual(['A00FAA0105001001'])
  })

  it('waits while the menu list is still loading', () => {
    const { nx, calls } = app({ menuRows: 0 })
    expect(openMenu(nx, map, PUMUI)).toBe('not-ready')
    expect(calls).toEqual([])
  })

  it('leaves a K-에듀파인 without that function alone, and a table without menu names too', () => {
    expect(openMenu(app({ noFn: true }).nx, map, PUMUI)).toBe('unavailable')
    expect(openMenu(app().nx, { ...map, menu: undefined }, PUMUI)).toBe('unavailable')
    expect(openMenu(undefined, map, PUMUI)).toBe('unavailable')
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
