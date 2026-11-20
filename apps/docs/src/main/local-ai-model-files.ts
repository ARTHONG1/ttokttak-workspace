/**
 * 똑딱AI's model files: not in the installer, downloaded once into the user's folder
 * (userData/local-ai-models) from the model release on GitHub, each accepted only at its
 * pinned size and SHA256. The app's version pins them: a new model set is a new release of
 * files and a new list here; the app downloads it on its first launch and drops the old one.
 *
 * 똑딱AI (sixth generation, the model project's ddak_features.json) is one model: the
 * unchanged Qwen3.5-2B Q8_0 base and one adapter per feature, all loaded in one server. Each
 * request turns on its feature's adapter only: the document adapter by default (한글 and the
 * other documents), the 품의 adapter for 품의서 생성, the 생기부 adapter for 생기부. The 생기부
 * adapter carries 똑딱AI 생기부 V7 B onto this base (close to V7 B, not identical: block 23's
 * small q/k norm changes are not carried). 똑딱생기부 downloads the same base and 생기부 adapter.
 */
export const LOCAL_AI_MODEL_RELEASE = 'model-20261120-2'
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
    file: 'adapters/school_record.gguf',
    bytes: 149_294_368,
    sha256: 'c4b61189e93ca7ee6ed29a9eef43a00fdcda1f6226710d46b074c90d70e4f2e1',
    url: DOWNLOAD + 'ddak-school-record-adapter.gguf',
  },
]

/**
 * The server runs: the model each loads and its adapters, in the order llama-server numbers
 * them (the first on for every request; a feature with an adapter of its own turns that one
 * on instead, for its own requests only). One run since the sixth generation; a later model
 * set with a standalone model would add a run, and the runtime switches between runs.
 */
export const LOCAL_AI_RUNS = {
  main: { model: 'base', adapters: ['document', 'pumui', 'school_record'] },
} as const satisfies Record<string, { model: LocalAiFileId; adapters: readonly LocalAiFileId[] }>

export type LocalAiRun = keyof typeof LOCAL_AI_RUNS

/** the run a feature's requests go to: all of them to the one server since the sixth generation */
export function localAiRunFor(_feature: string | undefined): LocalAiRun {
  return 'main'
}

/** the files a run needs, in the download order */
export function localAiRunFiles(run: LocalAiRun): LocalAiFileId[] {
  const { model, adapters } = LOCAL_AI_RUNS[run]
  return [model, ...adapters]
}
