export type DesktopPage = 'welcome' | 'connection' | 'workspace'

/**
 * Where "시작하기" on the welcome page goes: straight into the workspace,
 * whatever the AI connection is doing. Waiting for the connection check (it
 * takes seconds after launch) left the button doing nothing, and a missing
 * connection is offered from the workspace itself ("연결하기", Settings → AI,
 * and the first-connection notice where the AI is first used).
 */
export function startDestination(_state: 'connected' | 'checking' | 'disconnected'): DesktopPage {
  return 'workspace'
}

import { isSubscriptionProvider, selectAiProvider } from '@genoffice/ai-provider/browser'
import type { AiSettings, AiSubscriptionStatuses } from '@genoffice/ai-provider/browser'

export function desktopConnectionState(
  settings: AiSettings | null,
  statuses: AiSubscriptionStatuses,
): 'connected' | 'checking' | 'disconnected' {
  if (!settings) return 'checking'
  const choice = selectAiProvider(settings, statuses)
  if (choice.connected)
    return isSubscriptionProvider(choice.provider) ? 'connected' : 'disconnected'
  if (
    choice.reason === 'checking' ||
    (choice.selection === 'auto' && Object.values(statuses).some((s) => s?.state === 'checking'))
  )
    return 'checking'
  return 'disconnected'
}
