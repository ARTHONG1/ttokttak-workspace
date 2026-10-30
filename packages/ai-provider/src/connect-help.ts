/**
 * The connect help in the product README: the steps of connecting an AI. The
 * connect guide links to it; the address is fixed here and a renderer names
 * only the path the user is on. Browser-safe.
 */
import { PRODUCT_WEBSITE } from '@genoffice/i18n'
import type { AiSubscriptionProviderId } from './types'

/** A way to connect the guide offers: one of the two subscriptions, or the free connections */
export type SubscriptionConnectHelpPath = AiSubscriptionProviderId | 'free'

/** The README section for each path (GitHub's anchors of its Korean headings) */
const CONNECT_HELP_SECTIONS: Record<SubscriptionConnectHelpPath, string> = {
  'claude-code': '구독-연결하기',
  codex: '구독-연결하기',
  free: '구독-없이-무료로-쓰기',
}

/** The connect help page, at the section of `path` when it names a known path */
export function subscriptionConnectHelpUrl(path?: unknown): string {
  const base = PRODUCT_WEBSITE
  return typeof path === 'string' && Object.hasOwn(CONNECT_HELP_SECTIONS, path)
    ? `${base}#${encodeURIComponent(CONNECT_HELP_SECTIONS[path as SubscriptionConnectHelpPath])}`
    : base
}
