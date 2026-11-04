import { describe, expect, it } from 'vitest'
import { homeChoice } from '../../src/core/home'
import type { FeatureInfo } from '../../src/core/feature'

const a: FeatureInfo = { id: 'a', title: 'A', site: 'edufine', help: 'a', steps: [] }
const b: FeatureInfo = { id: 'b', title: 'B', site: 'edufine', help: 'b', steps: [] }

describe('what the 똑딱 button opens', () => {
  it('opens the only feature, waiting work or not', () => {
    expect(homeChoice([a], {})).toEqual({ kind: 'open', id: 'a' })
    expect(homeChoice([a], { a: 5 })).toEqual({ kind: 'open', id: 'a' })
  })

  it('opens the feature that has work waiting', () => {
    expect(homeChoice([a, b], { b: 5 })).toEqual({ kind: 'open', id: 'b' })
  })

  it('opens the latest when several have work waiting', () => {
    expect(homeChoice([a, b], { a: 9, b: 5 })).toEqual({ kind: 'open', id: 'a' })
    expect(homeChoice([a, b], { a: 1, b: 5 })).toEqual({ kind: 'open', id: 'b' })
  })

  it('lists the features when none has work waiting', () => {
    expect(homeChoice([a, b], {})).toEqual({ kind: 'list', ids: ['a', 'b'] })
  })

  it('ignores work for a feature of another site', () => {
    expect(homeChoice([a, b], { neis: 9 })).toEqual({ kind: 'list', ids: ['a', 'b'] })
  })
})
