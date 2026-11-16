import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check, numbers } from '../src/renderer/src/pumui/verifier'
import type { VerifierItem } from '../src/renderer/src/pumui/types'

// Copied from 인공지능 모델/experiments/document-specialist/pumui_v2/fixtures/verifier-vectors.json
// (policy pumui-policy-v2-20261113, sha256 a2f5a8e0a9009de7e0d146a9ac4e66b487daedede2f249619e99d47356daa8fe).
// The Python verifier is the reference; regenerate there with `python -m pumui_v2.vectors` and copy again.
interface Vector {
  id: string
  source: string
  items: VerifierItem[]
  expected: { status: string; total_verified: boolean; reasons: string[] }
}
const vectors = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/pumui-verifier-vectors.json'), 'utf8'),
) as { policy: string; cases: Vector[] }

describe('품의 verifier', () => {
  it('gives every reference vector the Python status, total check and reasons', () => {
    expect(vectors.cases).toHaveLength(240)
    const differ: string[] = []
    for (const v of vectors.cases) {
      const got = check(v.source, v.items)
      const reasons = [...new Set(got.flags.map((f) => f.reason))].sort()
      const same =
        got.status === v.expected.status &&
        got.totalVerified === v.expected.total_verified &&
        JSON.stringify(reasons) === JSON.stringify(v.expected.reasons)
      if (!same)
        differ.push(
          v.id + ' ' + got.status + ' ' + reasons.join(',') + ' / ' + JSON.stringify(v.expected),
        )
    }
    expect(differ).toEqual([])
  })

  it('reads "5,360" as 5360 and as 5 and 360', () => {
    const found = numbers('합계 5,360원')
    for (const n of [5360, 5, 360]) expect(found.has(n), String(n)).toBe(true)
  })

  it('leaves the rows it checks as they were', () => {
    const items: VerifierItem[] = [
      { description: '볼펜', specification: '', unit: '개', quantity: 3, unitPrice: 1000 },
    ]
    const before = JSON.stringify(items)
    check('볼펜 1,000원 3개\n총 상품금액 4,000원', items)
    expect(JSON.stringify(items)).toBe(before)
  })
})
