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
      '웹에서 보냈다면 로그인하고 품의등록 화면에서 예산 줄과 물품·용역 구분을 골라요. 준비되면 자동으로 채워요.',
      '수동으로 넣으려면 [똑딱]을 열고 내용을 확인한 뒤 [K-에듀파인에 채우기]를 눌러요.',
    ],
  },
  {
    id: 'neis-record',
    title: '생기부 나이스 입력',
    site: 'neis',
    help: '생기부에서 보낸 세특·행발·창체를 나이스 표에 학생 순서대로 넣어요.',
    steps: [
      '똑딱작업실 생기부에서 [나이스로 보내기]를 눌러요.',
      '웹에서 보냈다면 로그인하고 세특·행발·창체 중 보낸 업무의 입력 화면에서 첫 학생 줄을 골라요. 준비되면 자동으로 채워요.',
      '수동으로 넣으려면 [똑딱]을 열고 내용을 확인한 뒤 [나이스에 채우기]를 눌러요.',
    ],
  },
]

export const featuresOf = (site: SiteId): FeatureInfo[] => FEATURES.filter((f) => f.site === site)

export const featureInfo = (id: string): FeatureInfo | undefined =>
  FEATURES.find((f) => f.id === id)
