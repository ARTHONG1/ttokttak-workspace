import { describe, expect, it } from 'vitest'
import {
  SEND_COOLDOWN_MS,
  cooldownLeft,
  startCooldown,
  type CooldownStore,
} from '../src/send-cooldown'

function memory(): CooldownStore & { value: string | null } {
  return {
    value: null,
    get() {
      return this.value
    },
    set(v: string) {
      this.value = v
    },
  }
}

describe('send cooldown', () => {
  it('waits twenty seconds after a send, counting down', () => {
    const store = memory()
    startCooldown(store, 1_000)
    expect(SEND_COOLDOWN_MS).toBe(20_000)
    expect(cooldownLeft(store, 1_000)).toBe(20_000)
    expect(cooldownLeft(store, 13_500)).toBe(7_500)
    expect(cooldownLeft(store, 21_000)).toBe(0)
    expect(cooldownLeft(store, 99_000)).toBe(0)
  })

  it('is open before any send, and shrugs off a broken stored value', () => {
    const store = memory()
    expect(cooldownLeft(store, 5)).toBe(0)
    store.value = 'nonsense'
    expect(cooldownLeft(store, 5)).toBe(0)
  })

  it('never waits longer than one cooldown, whatever a stored time says', () => {
    // a clock set back, or a hand-edited value, must not lock the box for hours
    const store = memory()
    store.value = String(10 ** 13)
    expect(cooldownLeft(store, 1_000)).toBe(SEND_COOLDOWN_MS)
  })

  it('is shared: a send in one editor holds the box in another', () => {
    const shared = memory()
    startCooldown(shared, 50_000)
    // a second editor frame reads the same store
    expect(cooldownLeft(shared, 55_000)).toBe(15_000)
  })
})
