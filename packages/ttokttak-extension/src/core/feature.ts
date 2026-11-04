/**
 * A task of 똑딱작업실 on a school work site (a button in the 똑딱 panel). Its names live in
 * core/registry.ts; its page part lives in src/features/<id>/ and gets only this context,
 * so a task never reaches into another task or into how the extension passes work around.
 */
import type { Panel } from '../ext/page-ui'

/** the work sites 똑딱작업실 knows; each new site is a deliberate change of the permissions */
export type SiteId = 'edufine'

export interface FeatureInfo {
  /** stable id: work, storage keys and the /go page use it (a-z, 0-9 and -) */
  id: string
  /** the button the teacher sees */
  title: string
  site: SiteId
  /** one line under the button in the task list */
  help: string
  /** how to use it, shown in the toolbar popup; [buttons] are drawn bold */
  steps: readonly string[]
}

/** what 똑딱작업실 (the desktop app) answered when asked for this task's work */
export interface DesktopTake {
  ok: boolean
  text?: string | null
  state?: string
}

export interface FeatureContext {
  panel: Panel
  /** a line for the diagnostic file's log */
  step(s: string): void
  /** the work waiting for this task (sent from the web app or the desktop app), or null */
  peek(): Promise<string | null>
  /** forget the waiting work once it is done */
  clear(): Promise<void>
  /** ask 똑딱작업실 (the desktop app) for this task's work; it is kept like a waiting one */
  takeDesktop(): Promise<DesktopTake>
  /** back to the 똑딱 home of this site */
  home(): void
  /** the folded 「문제가 있을 때」 part: self-check and diagnostic file */
  trouble(): HTMLElement
}

export interface Feature extends FeatureInfo {
  /** draw the task; work is its waiting work when the home already found it, else null */
  open(ctx: FeatureContext, work: string | null): Promise<void>
}
