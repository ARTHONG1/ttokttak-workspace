/**
 * The built-in 똑딱AI: the same model as 똑딱작업실's (the model project's sixth generation),
 * the unchanged Qwen3.5-2B Q8_0 base with 똑딱AI's 생기부 adapter on. 똑딱생기부 needs only
 * these two of its files. They are too big for an installer (a GitHub release file stays under
 * 2 GiB and a Windows installer under 2 GB), so the app downloads them once from the shared
 * model release and checks each against its size and SHA256.
 */
export interface ModelSpec {
  /** where it goes, relative to the app's model folder (userData/ai) */
  file: string
  bytes: number
  sha256: string
  url: string
}

export const MODEL_RELEASE = 'model-20261120-2'
const DOWNLOAD =
  'https://github.com/ARTHONG1/ttokttak-workspace/releases/download/' + MODEL_RELEASE + '/'

/** shown to the teacher, with where the files can be downloaded by hand (for 파일로 넣기) */
export const MODEL_NAME = '똑딱AI'
export const MODEL_PAGE =
  'https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/' + MODEL_RELEASE

/** the base first, then the 생기부 adapter (the server loads it on the base) */
export const MODEL_FILES: readonly ModelSpec[] = [
  {
    file: 'base.gguf',
    bytes: 2_012_012_800,
    sha256: '1b04acba824817554f4ce23639bc8495ff70453b8fcb047900c731521021f2c1',
    url: DOWNLOAD + 'ddak-base-qwen3.5-2b-Q8_0.gguf',
  },
  {
    file: 'adapters/school_record.gguf',
    bytes: 149_294_368,
    sha256: 'c4b61189e93ca7ee6ed29a9eef43a00fdcda1f6226710d46b074c90d70e4f2e1',
    url: DOWNLOAD + 'ddak-school-record-adapter.gguf',
  },
]

/** all the files together */
export const MODEL_BYTES = MODEL_FILES.reduce((n, f) => n + f.bytes, 0)
