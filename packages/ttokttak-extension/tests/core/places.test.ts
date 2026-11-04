import { describe, expect, it } from 'vitest'
import { migratePlaces, placeKey, readPlace } from '../../src/core/places'

const place = { origin: 'https://klef.x.go.kr', path: '/keris_ui/main.do' }

describe('the site addresses the extension remembers', () => {
  it('keeps one per site', () => {
    expect(placeKey('edufine')).toBe('place:edufine')
  })

  it('carries a 0.4.0 K-에듀파인 address and tab over', () => {
    expect(migratePlaces({ edufinePlace: place, edufineTabId: 7 })).toEqual({
      set: { 'place:edufine': { ...place, tabId: 7 } },
      remove: ['edufinePlace', 'edufineTabId'],
    })
    expect(migratePlaces({ edufinePlace: place })).toEqual({
      set: { 'place:edufine': place },
      remove: ['edufinePlace', 'edufineTabId'],
    })
  })

  it('keeps an address already learned under the new key', () => {
    const now = { origin: 'https://klef.y.go.kr', path: '/' }
    expect(migratePlaces({ edufinePlace: place, 'place:edufine': now })).toEqual({
      set: {},
      remove: ['edufinePlace', 'edufineTabId'],
    })
  })

  it('does nothing without old keys', () => {
    expect(migratePlaces({})).toEqual({ set: {}, remove: [] })
  })

  it('reads only a well-formed address', () => {
    expect(readPlace({ ...place, tabId: 3 })).toEqual({ ...place, tabId: 3 })
    expect(readPlace({ ...place, tabId: 'x' })).toEqual(place)
    expect(readPlace({ origin: 5, path: '/' })).toBeNull()
    expect(readPlace(undefined)).toBeNull()
  })
})
