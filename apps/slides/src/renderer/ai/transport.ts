import {
  createIpcTransport,
  type AgentTransport,
  type IpcTransportOptions,
} from '@genoffice/agent-core'
import { aiRunErrorText } from '@genoffice/ui'
import type { AiSettings } from '../../shared/ipc'
import { getLang, t } from '../i18n/locale'

/** What the AI panel wants to hear about a turn besides its text (all optional) */
export type TransportHooks = Pick<
  IpcTransportOptions<AiSettings>,
  'onStreamError' | 'onSubscriptionUsage' | 'onInputTruncated'
>

/** The shared IPC transport wired to the slides preload bridge (window.slidesApi). */
export function createElectronTransport(
  getSettings: () => AiSettings,
  hooks: TransportHooks = {},
): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.slidesApi.onAiStream(listener),
    start: (request) => window.slidesApi.aiStream(request),
    cancel: (requestId) => void window.slidesApi.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiErrUnknown'),
    timeoutErrorText: () => t('aiErrStreamTimeout'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiErrNetwork'),
    overloadedErrorText: () => t('aiErrOverloaded'),
    // the subscription causes are worded once for every editor
    errorText: (cause) => aiRunErrorText(getLang(), cause),
    ...hooks,
  })
}
