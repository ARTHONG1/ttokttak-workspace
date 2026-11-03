import { describe, expect, it } from 'vitest'
import { matchUnit, type UnitTable } from '@genoffice/edufine-link/units'
import { PARSE_SYSTEM, PUMUI_UNITS } from '../src/renderer/src/proposal-prompts'

// K-에듀파인 takes units from its own table; 품의서 생성 asks the AI for names that the
// 똑딱 에듀파인 연결 extension can match, so a fill does not stop on an unknown unit.
const edufineNames: UnitTable = [
  '개',
  '명',
  '권',
  '상자',
  'SET',
  '식',
  '매',
  '롤',
  '팩',
  '병',
  '켤레',
  '대',
  '통',
  '장',
].map((name, i) => ({
  code: String(i + 1).padStart(3, '0'),
  name,
}))

describe('품의서 생성 unit names', () => {
  it('asks the AI only for unit names the extension matches', () => {
    for (const unit of PUMUI_UNITS) expect(matchUnit(unit, edufineNames), unit).not.toBeNull()
    for (const unit of PUMUI_UNITS) expect(PARSE_SYSTEM).toContain(unit)
  })
})
