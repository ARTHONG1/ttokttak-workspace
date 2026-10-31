/// <reference types="vite/client" />

import type { DesktopApi } from '../shared/ipc'
import type { SubscriptionApi } from '../shared/subscription-api'
import type { ProjectApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'

declare global {
  interface Window {
    desktop: DesktopApi
    projectApi: ProjectApi
    /** absent when the preload predates the subscription channels */
    aiOfficeSubscription?: SubscriptionApi
    /** absent when the preload predates the split-pane bridge (or outside the shell) */
    aiOfficeSplit?: SplitPaneBridge
  }
}

export {}
