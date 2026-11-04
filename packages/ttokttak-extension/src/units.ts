/**
 * K-에듀파인 takes a unit as a code from its own unit table (dsEAB0005200: code
 * cmmnDetailCd, name cmmnDetailCdNm), read from the screen at fill time. 품의서 생성
 * writes unit names, so a name is matched to a code here; a name that matches nothing
 * stops the fill instead of guessing.
 */

export type UnitTable = { code: string; name: string }[]

/** our name → K-에듀파인 names to try, in order (normalized: no spaces, upper case) */
export const UNIT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  세트: ['SET', '세트'],
  SET: ['SET', '세트'],
  박스: ['상자', 'BOX', '박스'],
  BOX: ['상자', 'BOX', '박스'],
  상자: ['상자', 'BOX', '박스'],
  EA: ['개'],
  개입: ['개'],
  인: ['명'],
  사람: ['명'],
  장: ['매', '장'],
  매: ['매', '장'],
  병: ['병', '개'],
  통: ['통', '개'],
  봉: ['봉', '봉지', '개'],
  봉지: ['봉', '봉지', '개'],
  팩: ['팩', 'PACK', '개'],
  PACK: ['팩', 'PACK'],
  권: ['권', '책'],
  롤: ['롤', 'ROLL'],
  ROLL: ['롤', 'ROLL'],
  켤레: ['켤레', '족'],
  족: ['켤레', '족'],
}

const norm = (s: string): string => s.replace(/\s+/g, '').toUpperCase()

export function matchUnit(name: string, table: UnitTable): string | null {
  const want = norm(name)
  if (!want || table.length === 0) return null
  const byName = new Map(table.map((u) => [norm(u.name), u.code]))
  const direct = byName.get(want)
  if (direct) return direct
  for (const alt of UNIT_ALIASES[want] ?? []) {
    const code = byName.get(norm(alt))
    if (code) return code
  }
  return null
}
