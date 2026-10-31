import {
  createIpcTransport,
  type AgentTransport,
  type IpcTransportOptions,
} from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import { aiRunErrorText } from '@genoffice/ui'
import { getLang, t } from '../i18n/locale'

/** What the panel wants to hear from a turn besides its text: the cause of a failure, usage, a cut input */
export type ElectronTransportEvents = Pick<
  IpcTransportOptions<AiSettings>,
  'onStreamError' | 'onSubscriptionUsage' | 'onInputTruncated'
>

/** The shared IPC transport wired to the sheets preload bridge (window.desktopApi). */
export function createElectronTransport(
  getSettings: () => AiSettings,
  events: ElectronTransportEvents = {},
): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.desktopApi.onAiStream(listener),
    start: (request) => window.desktopApi.aiStream(request),
    cancel: (requestId) => void window.desktopApi.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiUnknownError'),
    timeoutErrorText: () => t('aiTimeoutError'),
    networkErrorText: () => t('aiNetworkError'),
    overloadedErrorText: () => t('aiOverloadedError'),
    // the subscription causes are worded the same way in every editor
    errorText: (cause) => aiRunErrorText(getLang(), cause),
    ...events,
  })
}
