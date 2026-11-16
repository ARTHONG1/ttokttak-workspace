import { PUMUI_UNITS } from '../proposal-prompts'

/**
 * 품의 표기 규정 v2 (pumui-policy-v2-20261113): the same values as pumui_v2/policy.py in the
 * model project, which the training data, the grader and the verifier follow.
 */
export const UNITS: readonly string[] = PUMUI_UNITS
export const FIELDS = ['description', 'specification', 'unit', 'quantity', 'unitPrice'] as const
export const SHIPPING = '배송비'
/** integers only, at most 9 digits: a larger value is not computed but handed to the user */
export const MAX_NUMBER = 999_999_999

/** a written unit → an allowed unit; anything else (자루, 통, 장 …) and no unit become 개 */
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  개: '개',
  EA: '개',
  ea: '개',
  Ea: '개',
  SET: 'SET',
  set: 'SET',
  Set: 'SET',
  세트: 'SET',
  상자: '상자',
  박스: '상자',
  BOX: '상자',
  box: '상자',
  Box: '상자',
  권: '권',
  팩: '팩',
  매: '매',
  롤: '롤',
  병: '병',
  켤레: '켤레',
  대: '대',
  명: '명',
  식: '식',
}

export function canonicalUnit(surface: string | null | undefined): string {
  const key = (surface ?? '').trim()
  return Object.hasOwn(UNIT_ALIASES, key) ? UNIT_ALIASES[key] : '개'
}

export const isSafeAmount = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_NUMBER
