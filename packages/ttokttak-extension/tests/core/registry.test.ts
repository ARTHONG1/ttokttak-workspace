import { describe, expect, it } from 'vitest'
import { FEATURES, featureInfo, featuresOf } from '../../src/core/registry'

describe('the feature list', () => {
  it('starts with 에듀파인 품의 on K-에듀파인', () => {
    expect(featuresOf('edufine')).toEqual([
      expect.objectContaining({ id: 'edufine-pumui', title: '에듀파인 품의', site: 'edufine' }),
    ])
  })

  it('finds a feature by id and nothing for an unknown one', () => {
    expect(featureInfo('edufine-pumui')?.title).toBe('에듀파인 품의')
    expect(featureInfo('x')).toBeUndefined()
  })

  it('has 생기부 나이스 입력 on NEIS', () => {
    expect(featuresOf('neis')).toEqual([
      expect.objectContaining({ id: 'neis-record', title: '생기부 나이스 입력', site: 'neis' }),
    ])
  })

  it('keeps ids unique, in the allowed form, with a title and a help line', () => {
    const ids = FEATURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of FEATURES) {
      expect(f.id).toMatch(/^[a-z0-9-]{1,40}$/)
      expect(f.title.trim()).not.toBe('')
      expect(f.help.trim()).not.toBe('')
      expect(f.steps.length).toBeGreaterThan(0)
    }
  })
})
