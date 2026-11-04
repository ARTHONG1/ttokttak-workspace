/**
 * The 받은 작업함: the latest work sent for each task (from the web app or the desktop app),
 * kept in extension storage until the task is done with it or a day has passed. Pure rules
 * only; the background reads and writes chrome.storage with them.
 */

export interface InboxEntry {
  /** the task's own work text (for 에듀파인 품의, a 품의 꾸러미) */
  text: string
  from: 'web' | 'desktop'
  receivedAt: number
}

export const INBOX_MAX_MS = 24 * 3_600_000

export const inboxKey = (feature: string): string => 'inbox:' + feature

/** the key 0.4.0 and earlier kept the one waiting 품의 under */
const OLD_PENDING = 'pending'
const PUMUI = 'edufine-pumui'

/** a stored entry when it is well formed, else null */
function readEntry(entry: unknown): InboxEntry | null {
  const e = entry as Partial<InboxEntry> | null
  if (!e || typeof e !== 'object') return null
  if (typeof e.text !== 'string' || !e.text) return null
  if (e.from !== 'web' && e.from !== 'desktop') return null
  if (typeof e.receivedAt !== 'number') return null
  return { text: e.text, from: e.from, receivedAt: e.receivedAt }
}

/** a stored entry that is well formed and not older than a day, else null */
export function freshEntry(entry: unknown, now: number): InboxEntry | null {
  const e = readEntry(entry)
  return e && now - e.receivedAt <= INBOX_MAX_MS ? e : null
}

export interface StorageChange {
  set: Record<string, unknown>
  remove: string[]
}

/** the storage change that moves a 0.4.0 waiting 품의 into 에듀파인 품의's inbox */
export function migrateInbox(stored: Record<string, unknown>): StorageChange {
  if (!(OLD_PENDING in stored)) return { set: {}, remove: [] }
  const old = readEntry(stored[OLD_PENDING])
  const now = readEntry(stored[inboxKey(PUMUI)])
  const keep = old && (!now || old.receivedAt > now.receivedAt)
  return { set: keep ? { [inboxKey(PUMUI)]: old } : {}, remove: [OLD_PENDING] }
}
