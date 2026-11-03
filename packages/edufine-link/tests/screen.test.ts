import { describe, expect, it } from 'vitest'
import { detectScreen, findWorkForm, gridDataset, readUnitTable } from '../src/screen'
import { DEFAULT_SCREEN_MAP, parseScreenMap, type ScreenMap } from '../src/screen-map'
import { causeScreen, makeFakeEdufine, pumuiScreen } from './fixtures/fake-nexacro'

const map = DEFAULT_SCREEN_MAP

describe('finding the 품의등록 screen', () => {
  it('recognises the 품의등록 screen without writing anything', () => {
    const fake = makeFakeEdufine(pumuiScreen(map))
    const form = findWorkForm(fake.nx, map)
    expect(form).not.toBeNull()
    expect(detectScreen(form!, map)).toEqual({ kind: 'pumui' })
    expect(gridDataset(form!, map)?.rowcount).toBe(0)
    expect(fake.writes).toEqual([])
  })

  it('names what is missing on another screen', () => {
    const fake = makeFakeEdufine(causeScreen(map))
    const res = detectScreen(findWorkForm(fake.nx, map)!, map)
    expect(res.kind).toBe('other')
    expect(res.kind === 'other' && res.missing).toContain('divMain.form.edtCnsulSj')
  })

  it('returns null when no work screen is open or nexacro is absent', () => {
    expect(findWorkForm(makeFakeEdufine({ ...pumuiScreen(map), frame: 'none' }).nx, map)).toBeNull()
    expect(findWorkForm(undefined, map)).toBeNull()
    expect(findWorkForm({ getApplication: () => { throw new Error('x') } }, map)).toBeNull()
  })

  it('reports a screen whose one name differs from the table', () => {
    const renamed: ScreenMap = { ...map, pumui: { ...map.pumui, title: 'divMain.form.edtSj2' } }
    const fake = makeFakeEdufine(pumuiScreen(map))
    expect(detectScreen(findWorkForm(fake.nx, renamed)!, renamed)).toEqual({
      kind: 'other',
      missing: ['divMain.form.edtSj2'],
    })
  })

  it('follows a changed 화면 이름표 to a renamed screen', () => {
    const renamed: ScreenMap = { ...map, pumui: { ...map.pumui, title: 'divMain.form.edtSj2' } }
    const fake = makeFakeEdufine(pumuiScreen(renamed))
    expect(detectScreen(findWorkForm(fake.nx, renamed)!, renamed)).toEqual({ kind: 'pumui' })
  })

  it('reads the unit table from the visible area', () => {
    for (const unitDiv of ['divThng', 'divServc'] as const) {
      const fake = makeFakeEdufine(pumuiScreen(map, { unitDiv }))
      const table = readUnitTable(findWorkForm(fake.nx, map)!, map)
      expect(table).toContainEqual({ code: '017', name: 'SET' })
    }
  })
})

describe('화면 이름표 files', () => {
  it('reads a valid table and refuses other versions or broken paths', () => {
    expect(parseScreenMap(JSON.stringify(map))).toEqual(map)
    expect(parseScreenMap(JSON.stringify({ ...map, version: 2 }))).toBeNull()
    expect(parseScreenMap(JSON.stringify({ ...map, pumui: { ...map.pumui, title: 'a b; alert(1)' } }))).toBeNull()
    expect(parseScreenMap('not json')).toBeNull()
  })
})

