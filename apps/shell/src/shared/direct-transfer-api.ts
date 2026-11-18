export type DirectFeature = 'neis-record' | 'edufine-pumui'
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

export type DirectTransfer = (feature: string, text: string) => Promise<DirectTransferResult>
