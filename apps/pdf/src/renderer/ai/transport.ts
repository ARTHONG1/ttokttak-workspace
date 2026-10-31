import {
  createIpcTransport,
  type AgentTransport,
  type IpcStreamError,
  type IpcSubscriptionUsage,
} from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import type { Lang } from '@genoffice/i18n'
import { aiRunErrorText } from '@genoffice/ui'
import { t } from '../i18n/locale'

/** What the AI panel learns from a turn besides its text (all optional) */
export interface ElectronTransportHooks {
  /** the UI language the run-error texts are worded in */
  lang(): Lang
  /** structured copy of a failure, delivered right before the loop's onError */
  onStreamError?(error: IpcStreamError): void
  /** rate-limit windows a subscription CLI reported during the turn */
  onSubscriptionUsage?(usage: IpcSubscriptionUsage[]): void
  /** the input was cut to fit a limit; the user must be told */
  onInputTruncated?(): void
  /**
   * 'request': cancelling ends this stream only, not the tab's image and
   * media calls (a document job's call; the AI window's Stop ends both)
   */
  cancelScope?: 'request'
}

/** The shared IPC transport wired to the pdf preload bridge (window.pdfApi). */
export function createElectronTransport(
  getSettings: () => AiSettings,
  hooks?: ElectronTransportHooks,
): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.pdfApi.onAiStream(listener),
    start: (request) => window.pdfApi.aiStream(request),
    cancel: (requestId) =>
      void (hooks?.cancelScope
        ? window.pdfApi.aiStreamCancel(requestId, hooks.cancelScope)
        : window.pdfApi.aiStreamCancel(requestId)),
    getSettings,
    unknownErrorText: () => t('aiUnknownError'),
    timeoutErrorText: () => t('aiTimeoutError'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiNetworkError'),
    overloadedErrorText: () => t('aiOverloadedError'),
    // the subscription causes are worded once for every editor; the kinds above keep pdf's texts
    ...(hooks
      ? {
          errorText: (cause) => aiRunErrorText(hooks.lang(), cause),
          onStreamError: (error) => hooks.onStreamError?.(error),
          onSubscriptionUsage: (usage) => hooks.onSubscriptionUsage?.(usage),
          onInputTruncated: () => hooks.onInputTruncated?.(),
        }
      : {}),
  })
}
