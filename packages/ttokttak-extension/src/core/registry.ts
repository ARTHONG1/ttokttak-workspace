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
]

export const featuresOf = (site: SiteId): FeatureInfo[] => FEATURES.filter((f) => f.site === site)

export const featureInfo = (id: string): FeatureInfo | undefined =>
  FEATURES.find((f) => f.id === id)
