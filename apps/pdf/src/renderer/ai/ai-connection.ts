/**
 * The AI panel's decisions under the subscription contract, kept free of React
 * so they can be tested on their own: when a failed run is shown as a blocked
 * notice, and which usage reports are kept. What pressing send does is the send
 * gate every editor shares (`useAiSendGate` in @genoffice/ui).
 */
import type { AiProviderId, AiSubscriptionUsage } from '@genoffice/ai-provider/browser'
import type { IpcStreamError } from '@genoffice/agent-core'
import { isAiBlockedRunKind, type AiBlockedRunKind } from '@genoffice/ui'

/** Why a run stopped, when its connection cannot go on (shown as the blocked notice) */
export interface AiBlockedRun {
  kind: AiBlockedRunKind
  /** the provider the run was blocked on, when the error names one */
  provider?: AiProviderId
  /** epoch milliseconds: when a used-up limit resets */
  resetsAt?: number
}

/**
 * The blocked-run view of a stream failure, or null for a failure that keeps
 * the plain error line (timeouts, network, overload, provider messages).
 */
export function aiBlockedRunOf(error: IpcStreamError | null | undefined): AiBlockedRun | null {
  if (!error || !isAiBlockedRunKind(error.kind)) return null
  return {
    kind: error.kind,
    ...(error.provider ? { provider: error.provider } : {}),
    ...(typeof error.resetsAt === 'number' && Number.isFinite(error.resetsAt)
      ? { resetsAt: error.resetsAt }
      : {}),
  }
}

/**
 * The usage windows known so far after a new report: one entry per provider
 * and window, the newer report replacing the older one. A turn may report its
 * windows one at a time, so a report never drops the windows it does not name.
 */
export function mergeSubscriptionUsage(
  known: readonly AiSubscriptionUsage[],
  reported: readonly AiSubscriptionUsage[],
): AiSubscriptionUsage[] {
  const sameWindow = (a: AiSubscriptionUsage, b: AiSubscriptionUsage) =>
    a.provider === b.provider && a.window === b.window
  const latest = reported.filter(
    (entry, index) => !reported.slice(index + 1).some((later) => sameWindow(entry, later)),
  )
  return [...known.filter((entry) => !latest.some((next) => sameWindow(entry, next))), ...latest]
}
