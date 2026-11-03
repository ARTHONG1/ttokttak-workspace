/**
 * 품의 waiting for the 똑딱 에듀파인 연결 extension. The 품의서 생성 screen and the AI
 * agent tool put a checked 품의 here; the extension takes it through native messaging
 * (edufine-host → control channel 'pumui-take'). Kept in memory only: at most five,
 * each for thirty minutes, so nothing lingers after the teacher is done.
 */
import { parsePumuiPackage } from '@genoffice/edufine-link/package'

export const OUTBOX_MAX = 5
export const OUTBOX_TTL_MS = 30 * 60_000

export class PumuiOutbox {
  private items: { text: string; at: number }[] = []

  enqueue(
    text: string,
    now = Date.now(),
  ): { ok: true; title: string } | { ok: false; reason: string } {
    const parsed = parsePumuiPackage(text, new Date(now))
    if (!parsed.ok) return { ok: false, reason: parsed.reason }
    this.prune(now)
    this.items.push({ text, at: now })
    while (this.items.length > OUTBOX_MAX) this.items.shift()
    return { ok: true, title: parsed.pkg.title }
  }

  /** the newest waiting 품의, removed from the queue */
  take(now = Date.now()): string | null {
    this.prune(now)
    return this.items.pop()?.text ?? null
  }

  size(now = Date.now()): number {
    this.prune(now)
    return this.items.length
  }

  private prune(now: number): void {
    this.items = this.items.filter((i) => now - i.at < OUTBOX_TTL_MS)
  }
}

/** the app's one queue */
export const pumuiOutbox = new PumuiOutbox()
