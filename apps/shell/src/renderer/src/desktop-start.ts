export type DesktopPage = 'welcome' | 'connection' | 'workspace'

export function startDestination(state: 'connected' | 'checking' | 'disconnected'): DesktopPage {
  return state === 'connected' ? 'workspace' : state === 'checking' ? 'welcome' : 'connection'
}

import { isSubscriptionProvider, selectAiProvider } from '@genoffice/ai-provider/browser'
import type { AiSettings, AiSubscriptionStatuses } from '@genoffice/ai-provider/browser'

export function desktopConnectionState(settings: AiSettings | null, statuses: AiSubscriptionStatuses): 'connected' | 'checking' | 'disconnected' {
  if (!settings) return 'checking'
  const choice = selectAiProvider(settings, statuses)
  if (choice.connected) return isSubscriptionProvider(choice.provider) ? 'connected' : 'disconnected'
  if (choice.reason === 'checking' || (choice.selection === 'auto' && Object.values(statuses).some((s) => s?.state === 'checking'))) return 'checking'
  return 'disconnected'
}
