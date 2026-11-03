import { describe, expect, it } from 'vitest'
import { matchUnit, UNIT_ALIASES, type UnitTable } from '../src/units'

const table: UnitTable = [
  { code: '001', name: '개' },
  { code: '002', name: '명' },
  { code: '005', name: '권' },
  { code: '010', name: '상자' },
  { code: '017', name: 'SET' },
  { code: '020', name: '식' },
  { code: '031', name: '롤' },
]

describe('matchUnit', () => {
  it('finds the same name', () => {
    expect(matchUnit('개', table)).toBe('001')
    expect(matchUnit('권', table)).toBe('005')
  })

  it('ignores spaces and letter case', () => {
    expect(matchUnit(' set ', table)).toBe('017')
    expect(matchUnit('Set', table)).toBe('017')
  })

  it('follows the aliases', () => {
    expect(matchUnit('세트', table)).toBe('017')
    expect(matchUnit('박스', table)).toBe('010')
    expect(matchUnit('EA', table)).toBe('001')
    expect(matchUnit('ea', table)).toBe('001')
    expect(matchUnit('인', table)).toBe('002')
    expect(matchUnit('BOX', table)).toBe('010')
  })

  it('returns null for a name the table does not know, and for an empty table', () => {
    expect(matchUnit('켤레', table)).toBeNull()
    expect(matchUnit('개', [])).toBeNull()
    expect(matchUnit('', table)).toBeNull()
  })

  it('every alias target is a plain unit name', () => {
    for (const targets of Object.values(UNIT_ALIASES)) for (const t of targets) expect(t.trim()).toBe(t)
  })
})

