/**
 * The built-in 똑딱AI's model: 똑딱AI 생기부 V7 B (school-record-v7-b), the model project's
 * standalone Q8_0 GGUF as it was measured. It is too big to go inside an installer (a GitHub
 * release file stays under 2 GiB and Windows installers under 2 GB), so the app downloads it
 * once from the app's own GitHub repository and checks it against this size and SHA256.
 */
export interface ModelSpec {
  /** shown to the teacher */
  name: string
  bytes: number
  sha256: string
  url: string
  /** where a teacher can download the file by hand (for 파일로 넣기) */
  page: string
}

export const MODEL: ModelSpec = {
  name: '똑딱AI 생기부 V7 B',
  bytes: 2_076_675_040,
  sha256: 'd31c913928eea57ca2d1bfb2a0a158dcb48ef2b4c6bae6dede91cdd7457d0fdf',
  url: 'https://github.com/ARTHONG1/ttokttak-saenggibu/releases/download/model-v7b/ttokttak-saenggibu-v7b-Q8_0.gguf',
  page: 'https://github.com/ARTHONG1/ttokttak-saenggibu/releases/tag/model-v7b',
}
