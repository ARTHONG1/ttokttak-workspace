/**
 * The tasks of 똑딱작업실, by site. Adding a task is one line here plus its folder in
 * src/features/<id>/ (see ADDING-A-FEATURE.ko.md). Only names live here: the page part is
 * joined in src/ext/page-main.ts, so the background and the popup stay free of task code.
 */
import type { FeatureInfo, SiteId } from './feature'

export const FEATURES: readonly FeatureInfo[] = [
  {
    id: 'edufine-pumui',
    title: '에듀파인 품의',
    site: 'edufine',
    help: '품의서 생성에서 보낸 품의를 K-에듀파인 품의등록 화면에 채워요.',
    steps: [
      '똑딱작업실 품의서 생성에서 [K-에듀파인으로 보내기]를 눌러요.',
      'K-에듀파인에 품의가 뜨면 [K-에듀파인에 채우기]를 눌러요. 안 뜨면 화면 오른쪽 아래 [똑딱]을 눌러요.',
      '예산 줄을 고르라고 하면 골라요. 고르면 바로 이어서 채워요.',
    ],
  },
  {
    id: 'neis-record',
    title: '생기부 나이스 입력',
    site: 'neis',
    help: '생기부에서 보낸 세특·행발을 나이스 표에 학생 순서대로 넣어요.',
    steps: [
      '똑딱작업실 생기부에서 [나이스로 보내기]를 눌러요.',
      '나이스에서 세특이나 행발 입력 화면을 열고, 표에서 첫 학생 줄을 눌러요.',
      '[똑딱] 창에서 확인한 뒤 [나이스에 채우기]를 눌러요. 안 뜨면 화면 오른쪽 아래 [똑딱]을 눌러요.',
    ],
  },
]

export const featuresOf = (site: SiteId): FeatureInfo[] => FEATURES.filter((f) => f.site === site)

export const featureInfo = (id: string): FeatureInfo | undefined =>
  FEATURES.find((f) => f.id === id)
