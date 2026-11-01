import type { AiSettings, AiSubscriptionStatus } from '@genoffice/ai-provider/browser'

export type DesktopEntryScreen = 'welcome' | 'connect' | 'workspace'
export type DesktopEntryAction = 'connect' | 'start' | 'back' | 'restore-document'

/** The only desktop provider in this release. Claude and API-key flows are not entry options. */
export function codexCanStart(status: AiSubscriptionStatus | undefined): boolean {
  return status?.provider === 'codex' && (
    status.state === 'ready' || (status.state === 'metered' && status.meteredAccepted === true)
  )
}

/** Do not enter the AI workspace before the first-transmission notice is saved. */
export function desktopCanEnterWorkspace(
  status: AiSubscriptionStatus | undefined,
  settings: Pick<AiSettings, 'subscriptionNoticeSeen'> | null,
): boolean {
  return codexCanStart(status) && settings?.subscriptionNoticeSeen === true
}

/** An open/recovered document must never be hidden by a marketing entry screen. */
export function desktopEntryTransition(
  current: DesktopEntryScreen,
  action: DesktopEntryAction,
  canStart: boolean,
): DesktopEntryScreen {
  if (action === 'restore-document') return 'workspace'
  if (current === 'workspace') return 'workspace'
  if (action === 'connect') return 'connect'
  if (action === 'back') return 'welcome'
  return canStart ? 'workspace' : 'connect'
}
