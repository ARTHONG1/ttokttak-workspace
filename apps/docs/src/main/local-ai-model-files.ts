/**
 * 똑딱AI's model files: not in the installer, downloaded once into the user's folder
 * (userData/local-ai-models) from the model release on GitHub, each accepted only at its
 * pinned size and SHA256. The app's version pins them: a new model set is a new release of
 * files and a new list here; the app downloads it on its first launch and drops the old one.
 *
 * Two server runs use them. Documents, HWPX editing and 품의서 생성 run on the unchanged
 * Qwen3.5-2B Q8_0 base with the document adapter on and the 품의 adapter for 품의 requests;
 * 생기부 runs on 똑딱AI 생기부 V7 B, a standalone model, as it was trained (the file
 * 똑딱생기부 uses). Both are the original files: nothing is quantized again or converted.
 */
export const LOCAL_AI_MODEL_RELEASE = 'model-20261120'
export const LOCAL_AI_MODEL_PAGE =
  'https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/' + LOCAL_AI_MODEL_RELEASE
const DOWNLOAD =
  'https://github.com/ARTHONG1/ttokttak-workspace/releases/download/' + LOCAL_AI_MODEL_RELEASE + '/'

/** the folder in userData the files go to */
export const LOCAL_AI_MODELS_DIR = 'local-ai-models'

export type LocalAiFileId = 'base' | 'document' | 'pumui' | 'school_record'

export interface LocalAiModelFile {
  id: LocalAiFileId
  /** where it goes, relative to the models folder */
  file: string
  bytes: number
  sha256: string
  url: string
}

export const LOCAL_AI_MODEL_FILES: readonly LocalAiModelFile[] = [
  {
    id: 'base',
    file: 'base.gguf',
    bytes: 2_012_012_800,
    sha256: '1b04acba824817554f4ce23639bc8495ff70453b8fcb047900c731521021f2c1',
    url: DOWNLOAD + 'ddak-base-qwen3.5-2b-Q8_0.gguf',
  },
  {
    id: 'document',
    file: 'adapters/document.gguf',
    bytes: 2_723_072,
    sha256: '76fac99858b21d136835cc4bdda02edf8721adaf820280ef5aba31c8d506ace9',
    url: DOWNLOAD + 'ddak-document-adapter.gguf',
  },
  {
    id: 'pumui',
    file: 'adapters/pumui.gguf',
    bytes: 22_434_368,
    sha256: '7f4304879415d92d87b1c9401819135383a06c2e6e1e39c74e321c44cf7b99ac',
    url: DOWNLOAD + 'ddak-pumui-adapter.gguf',
  },
  {
    id: 'school_record',
    file: 'school-record.gguf',
    bytes: 2_076_675_040,
    sha256: 'd31c913928eea57ca2d1bfb2a0a158dcb48ef2b4c6bae6dede91cdd7457d0fdf',
    url: DOWNLOAD + 'ddak-school-record-v7b-Q8_0.gguf',
  },
]

/**
 * The server runs: the model each loads and its adapters, in the order llama-server numbers
 * them (the first on for every request; a feature with an adapter of its own turns that one
 * on instead, for its own requests only).
 */
export const LOCAL_AI_RUNS = {
  main: { model: 'base', adapters: ['document', 'pumui'] },
  school_record: { model: 'school_record', adapters: [] },
} as const satisfies Record<string, { model: LocalAiFileId; adapters: readonly LocalAiFileId[] }>

export type LocalAiRun = keyof typeof LOCAL_AI_RUNS

/** the run a feature's requests go to: 생기부 on V7 B, everything else on the base */
export function localAiRunFor(feature: string | undefined): LocalAiRun {
  return feature === 'school_record' ? 'school_record' : 'main'
}

/** the files a run needs, in the download order */
export function localAiRunFiles(run: LocalAiRun): LocalAiFileId[] {
  const { model, adapters } = LOCAL_AI_RUNS[run]
  return [model, ...adapters]
}
