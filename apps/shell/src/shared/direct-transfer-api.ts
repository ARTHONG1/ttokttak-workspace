export type DirectFeature = 'neis-record' | 'edufine-pumui'
export type DirectTransferStage =
  | 'browser-opening'
  | 'waiting-login'
  | 'finding-screen'
  | 'waiting-selection'
  | 'writing'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'cancelled'
export interface DirectTransferProgress {
  requestId: string
  feature: DirectFeature
  stage: DirectTransferStage
  elapsedMs: number
}
export type DirectTransferResult =
  | {
      ok: true
      route: 'direct'
      message: string
      written: number
      next: number
      startedFrom?: number
    }
  | { ok: false; route: 'direct'; message: string }

export type DirectTransfer = (
  feature: string,
  text: string,
  requestId?: string,
) => Promise<DirectTransferResult>
