/// <reference types="vite/client" />

import type { ProjectApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/ui'
import type { MindmapApi } from '../shared/ipc'

declare global {
  interface Window {
    mindmapApi: MindmapApi
    projectApi?: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'>
    /** the shell's split panes; read through @genoffice/ui's split-pane-role helpers */
    aiOfficeSplit?: SplitPaneBridge
  }
}

export {}
