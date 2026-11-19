import type { RecordPackage } from './record-package'

/** what the page asks the built-in 똑딱AI: one 생기부 writing turn (instructions + request) */
export interface AskRequest {
  requestId: string
  system: string
  text: string
}
export type AskResult = { ok: true; text: string } | { ok: false; error: string }

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
  sendToNeis(text: string): Promise<NeisResult>
  version(): Promise<string>
}

export type { RecordPackage }

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
  version: 'saenggibu:version',
} as const
