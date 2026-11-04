/**
 * Work waiting for the 똑딱작업실 extension, one queue per task. The 품의서 생성 screen and
 * the AI agent tool put checked work here; the extension takes it through native messaging
 * (edufine-host → control channel 'work-take'). Kept in memory only: at most five per task,
 * each for thirty minutes, so nothing lingers after the teacher is done.
 */
import { parsePumuiPackage } from '@genoffice/ttokttak-extension/package'

export const OUTBOX_MAX = 5
export const OUTBOX_TTL_MS = 30 * 60_000

export type Held = { ok: true; title: string } | { ok: false; reason: string }
/** a task's check of its work text: only what the extension would take is held */
export type WorkCheck = (text: string, now: Date) => Held

const CHECKS: Readonly<Record<string, WorkCheck>> = {
  'edufine-pumui': (text, now) => {
    const parsed = parsePumuiPackage(text, now)
    return parsed.ok ? { ok: true, title: parsed.pkg.title } : parsed
  },
}

/** one task's queue, for code that only ever handles that task */
export interface TaskQueue {
  enqueue(text: string, now?: number): Held
  take(now?: number): string | null
  size(now?: number): number
}

export class WorkOutbox {
  private items = new Map<string, { text: string; at: number }[]>()

  constructor(private readonly checks: Readonly<Record<string, WorkCheck>> = CHECKS) {}

  enqueue(feature: string, text: string, now = Date.now()): Held {
    const check = Object.hasOwn(this.checks, feature) ? this.checks[feature] : undefined
    if (!check) return { ok: false, reason: '알 수 없는 업무예요.' }
    const held = check(text, new Date(now))
    if (!held.ok) return held
    const list = this.live(feature, now)
    list.push({ text, at: now })
    while (list.length > OUTBOX_MAX) list.shift()
    this.items.set(feature, list)
    return held
  }

  /** the newest waiting work of a task, removed from its queue */
  take(feature: string, now = Date.now()): string | null {
    return this.live(feature, now).pop()?.text ?? null
  }

  size(feature: string, now = Date.now()): number {
    return this.live(feature, now).length
  }

  of(feature: string): TaskQueue {
    return {
      enqueue: (text, now) => this.enqueue(feature, text, now),
      take: (now) => this.take(feature, now),
      size: (now) => this.size(feature, now),
    }
  }

  private live(feature: string, now: number): { text: string; at: number }[] {
    const list = (this.items.get(feature) ?? []).filter((i) => now - i.at < OUTBOX_TTL_MS)
    if (list.length) this.items.set(feature, list)
    else this.items.delete(feature)
    return list
  }
}

/** the app's queues */
export const workOutbox = new WorkOutbox()
