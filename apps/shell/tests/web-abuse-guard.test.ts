import { describe, expect, it } from 'vitest'
// the web edition's gateway module (plain ESM, no build)
import { clientIp, createSessionGuard } from '../../../web/runtime/abuse-guard.mjs'

const opts = {
  maxSessions: 4,
  maxPerIp: 2,
  newPerIp: 3,
  windowMs: 60_000,
  strikes: 2,
  banMs: 600_000,
}
const live = (...list: [string, string, number | null][]) =>
  list.map(([sid, ip, idleSince]) => ({ sid, ip, idleSince }))

describe('createSessionGuard', () => {
  it('lets a reload back into its own work space whatever the limits', () => {
    const g = createSessionGuard({ ...opts, maxSessions: 1 })
    expect(g.admit({ ip: 'a', sid: 's1', live: live(['s1', 'a', null]) }, 0)).toEqual({
      ok: true,
      evict: [],
    })
  })

  it('makes room from the same address by closing its longest idle work space', () => {
    const g = createSessionGuard(opts)
    const r = g.admit({ ip: 'a', sid: 'new', live: live(['s1', 'a', 50], ['s2', 'a', 10]) }, 100)
    expect(r).toEqual({ ok: true, evict: ['s2'] })
  })

  it('refuses one address more work spaces than it may hold when none is idle', () => {
    const g = createSessionGuard(opts)
    const r = g.admit({ ip: 'a', sid: 'new', live: live(['s1', 'a', null], ['s2', 'a', null]) }, 0)
    expect(r).toEqual({ ok: false, reason: 'ip-full' })
    // another address still gets in
    expect(
      g.admit({ ip: 'b', sid: 'n2', live: live(['s1', 'a', null], ['s2', 'a', null]) }, 0).ok,
    ).toBe(true)
  })

  it('says the server is full when every work space is in use', () => {
    const g = createSessionGuard(opts)
    const busy = live(['1', 'a', null], ['2', 'b', null], ['3', 'c', null], ['4', 'd', null])
    expect(g.admit({ ip: 'e', sid: 'x', live: busy }, 0)).toEqual({
      ok: false,
      reason: 'server-full',
    })
    const oneIdle = live(['1', 'a', null], ['2', 'b', 5], ['3', 'c', null], ['4', 'd', null])
    expect(g.admit({ ip: 'e', sid: 'x', live: oneIdle }, 0)).toEqual({ ok: true, evict: ['2'] })
  })

  it('slows an address that opens too many, then blocks it for a while after repeated tries', () => {
    const g = createSessionGuard(opts)
    for (let i = 0; i < 3; i++)
      expect(g.admit({ ip: 'a', sid: 'n' + i, live: [] }, i).ok).toBe(true)
    expect(g.admit({ ip: 'a', sid: 'n3', live: [] }, 10)).toEqual({ ok: false, reason: 'too-fast' })
    expect(g.admit({ ip: 'a', sid: 'n4', live: [] }, 20)).toEqual({ ok: false, reason: 'banned' })
    expect(g.bannedUntil('a', 30)).toBe(600_020)
    // still blocked after the window, free once the ban ends
    expect(g.admit({ ip: 'a', sid: 'n5', live: [] }, 120_000)).toEqual({
      ok: false,
      reason: 'banned',
    })
    expect(g.admit({ ip: 'a', sid: 'n6', live: [] }, 700_000).ok).toBe(true)
    // others were never affected
    expect(g.admit({ ip: 'b', sid: 'm', live: [] }, 20).ok).toBe(true)
  })

  it('forgets openings older than the window', () => {
    const g = createSessionGuard(opts)
    for (let i = 0; i < 3; i++) g.admit({ ip: 'a', sid: 'n' + i, live: [] }, i)
    expect(g.admit({ ip: 'a', sid: 'later', live: [] }, 61_000).ok).toBe(true)
  })
})

describe('clientIp', () => {
  it('takes the address the front end appended, not one the caller wrote', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, socket: {} })).toBe(
      '203.0.113.9',
    )
    expect(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1')
  })
})
