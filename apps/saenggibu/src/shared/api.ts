import type { RecordPackage } from './record-package'
import type { NeisClassResult } from './neis-class'

/** what the page asks the built-in 똑딱AI: one 생기부 writing turn (instructions + request) */
export interface AskRequest {
  requestId: string
  system: string
  text: string
  /**
   * 0 (the model's measured setting) unless asked: a rewording that came back word for word
   * is asked once more with some variety
   */
  temperature?: number
  /**
   * the same request in 똑딱AI's short format (record-core.ts COMPACT_SYSTEM and
   * compactRequest): sent instead, at temperature 0, once the pinned 생기부 adapter learned it
   * (shared/model.ts RECORD_FORMAT)
   */
  compact?: { system: string; text: string; observation?: unknown }
}
export type AskResult =
  | { ok: true; text: string }
  | {
      ok: false
      error: string
      /** this request's own problem (too long, an answer that ran on): the next can go on */
      student?: boolean
    }

/**
 * The built-in 똑딱AI, as the page shows it. The model is downloaded once (verifying →
 * downloading → verifying), then the server starts (starting → ready).
 */
export type AiState =
  | { state: 'off' }
  | { state: 'verifying' }
  | { state: 'downloading'; received: number; total: number; rate: number }
  | { state: 'download-failed'; message: string }
  | { state: 'starting' }
  | { state: 'ready' }
  | { state: 'missing' }
  | { state: 'failed'; message: string }

/** the model's size and where a teacher can download it by hand */
export interface ModelInfo {
  name: string
  bytes: number
  page: string
}

/** a roster or a texts file (xlsx, csv, tsv) read as rows of text */
export type TableFileResult =
  | { ok: true; kind: 'text'; name: string; text: string; truncated: boolean }
  | { ok: false; error: string }

/** 나이스로 보내기: filled in the app's own browser window, or why not */
export type NeisResult =
  | { ok: true; route: 'direct'; message: string; written: number; next: number }
  | { ok: false; route: 'direct'; message: string }

export type NeisStage =
  | 'browser-opening'
  | 'waiting-login'
  | 'finding-screen'
  | 'waiting-selection'
  | 'writing'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface NeisProgress {
  requestId: string
  stage: NeisStage
  elapsedMs: number
  hint?: string
}

/** window.saenggibu: everything the page reaches outside itself */
export interface SaenggibuApi {
  ask(request: AskRequest): Promise<AskResult>
  cancel(requestId: string): Promise<void>
  aiState(): Promise<AiState>
  onAiState(handler: (state: AiState) => void): () => void
  modelInfo(): Promise<ModelInfo>
  /** [다시 받기]: resume the model download */
  retryModel(): Promise<void>
  /** [파일로 넣기]: pick a model file downloaded by hand; null = canceled */
  importModel(): Promise<{ ok: true } | { ok: false; error: string } | null>
  /** the release page with the model file, in the system browser */
  openModelPage(): Promise<void>
  /** null = canceled */
  readTableFile(): Promise<TableFileResult | null>
  sendToNeis(text: string, requestId: string): Promise<NeisResult>
  focusNeisSend(requestId: string): Promise<void>
  cancelNeisSend(requestId: string): Promise<void>
  onNeisProgress(handler: (progress: NeisProgress) => void): () => void
  /** 나이스에서 가져오기: the class list and 누가기록 of the NEIS screen in the app's browser */
  readNeisClass(): Promise<NeisClassResult>
  version(): Promise<string>
  /** whether the page holds students' work not yet kept with [임시 저장] (asked about on close) */
  setUnsaved(unsaved: boolean): void
  /** the window is closing and the teacher chose [임시 저장하고 닫기]: save, then closeNow */
  onSaveBeforeClose(handler: () => void): () => void
  /** close the window now (after saving for it) */
  closeNow(): Promise<void>
}

export type { NeisClassResult, RecordPackage }

export const CHANNELS = {
  ask: 'saenggibu:ask',
  cancel: 'saenggibu:cancel',
  aiState: 'saenggibu:ai-state',
  aiStateChanged: 'saenggibu:ai-state-changed',
  modelInfo: 'saenggibu:model-info',
  retryModel: 'saenggibu:retry-model',
  importModel: 'saenggibu:import-model',
  openModelPage: 'saenggibu:open-model-page',
  readTableFile: 'saenggibu:read-table-file',
  sendToNeis: 'saenggibu:send-to-neis',
  focusNeisSend: 'saenggibu:focus-neis-send',
  cancelNeisSend: 'saenggibu:cancel-neis-send',
  neisProgress: 'saenggibu:neis-progress',
  readNeisClass: 'saenggibu:read-neis-class',
  version: 'saenggibu:version',
  unsaved: 'saenggibu:unsaved',
  saveBeforeClose: 'saenggibu:save-before-close',
  closeNow: 'saenggibu:close-now',
} as const
