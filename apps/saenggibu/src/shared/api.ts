import type { RecordPackage } from './record-package'

/** what the page asks the built-in 똑딱AI: one 생기부 writing turn (instructions + request) */
export interface AskRequest {
  requestId: string
  system: string
  text: string
}
export type AskResult = { ok: true; text: string } | { ok: false; error: string }

/** the built-in 똑딱AI, as the page shows it */
export type AiState =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'ready' }
  | { state: 'missing' }
  | { state: 'failed'; message: string }

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
  readTableFile: 'saenggibu:read-table-file',
  sendToNeis: 'saenggibu:send-to-neis',
  version: 'saenggibu:version',
} as const
