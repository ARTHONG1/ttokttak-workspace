import { useCallback, useEffect, useState } from 'react'

/**
 * The web edition's pace for the AI chat: after a message is sent, the input box waits
 * twenty seconds before the next one, showing the time running down. Only the web
 * edition (frames marked data-edition="web") waits; the desktop app never does.
 *
 * The time the box opens again is kept in localStorage, which every editor frame of the
 * web edition shares (one origin), so moving to another editor does not skip the wait;
 * a 'storage' event tells the other frames at once.
 */

export const SEND_COOLDOWN_MS = 20_000
const KEY = 'ttokttak:ai-send-open-at'

export interface CooldownStore {
  get(): string | null
  set(value: string): void
}

const localStore: CooldownStore = {
  get: () => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set: (value) => {
    try {
      localStorage.setItem(KEY, value)
    } catch {
      // storage blocked: the wait still holds in this frame through React state
    }
  },
}

/** milliseconds until the box opens again (0 = open), never more than one cooldown */
export function cooldownLeft(store: CooldownStore = localStore, now = Date.now()): number {
  const openAt = Number(store.get())
  if (!Number.isFinite(openAt) || openAt <= now) return 0
  return Math.min(openAt - now, SEND_COOLDOWN_MS)
}

export function startCooldown(store: CooldownStore = localStore, now = Date.now()): void {
  store.set(String(now + SEND_COOLDOWN_MS))
}

/** whether this page is the web edition, where sends are paced */
export function sendCooldownApplies(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.edition === 'web'
}

/** milliseconds left before another AI message may be sent here (always 0 on the desktop) */
export function sendCooldownLeft(): number {
  return sendCooldownApplies() ? cooldownLeft() : 0
}

/** call when an AI message is sent; nothing on the desktop */
export function noteAiSend(): void {
  if (sendCooldownApplies()) startCooldown()
}

/** the time left, kept fresh while it runs down; `start` notes a send */
export function useSendCooldown(): { leftMs: number; totalMs: number; start: () => void } {
  const [leftMs, setLeftMs] = useState(() => sendCooldownLeft())
  const running = leftMs > 0
  useEffect(() => {
    if (!sendCooldownApplies()) return
    const read = () => setLeftMs(cooldownLeft())
    // a send in another editor frame arrives as a storage event
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) read()
    }
    window.addEventListener('storage', onStorage)
    // the clock only runs while the wait does
    const timer = running ? window.setInterval(read, 250) : 0
    return () => {
      window.removeEventListener('storage', onStorage)
      if (timer) window.clearInterval(timer)
    }
  }, [running])
  const start = useCallback(() => {
    noteAiSend()
    setLeftMs(sendCooldownLeft())
  }, [])
  return { leftMs, totalMs: SEND_COOLDOWN_MS, start }
}
