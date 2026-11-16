import type { PumuiFlag, PumuiStatus } from './types'

/** what the 품의서 생성 page says for each check result (PUMUI_APP_INTEGRATION.md, 화면) */
export const STATUS_TEXT: Record<PumuiStatus, string> = {
  confirmed: '금액 확인됨: 원문의 합계와 품목 합계가 같습니다.',
  unconfirmed: '원문에 합계가 없어 대조하지 못했습니다. 품목 수와 금액을 확인해 주세요.',
  needs_review: '확인이 필요한 곳이 있어요. 표시한 줄을 원문과 비교해 고쳐 주세요.',
}

const REASON_TEXT: Record<string, string> = {
  price_not_in_source: '이 줄의 단가를 원문에서 찾지 못했습니다',
  quantity_not_in_source: '이 줄의 수량을 원문에서 찾지 못했습니다',
  name_not_in_source: '이 줄의 품명이 원문과 다릅니다',
  spec_not_in_source: '이 줄의 규격이 원문과 다릅니다',
  zero_price: '단가가 0원입니다',
  total_mismatch: '원문의 합계와 품목 합계가 다릅니다',
  shipping_missing: '배송비를 확인해 주세요',
  shipping_partial: '배송비를 확인해 주세요',
  shipping_not_in_source: '배송비를 확인해 주세요',
  shipping_row_form: '배송비를 확인해 주세요',
  duplicate_item: '같은 품목이 두 번 들어 있습니다',
  vat_excluded: '부가세 별도 견적입니다. 금액을 확인해 주세요',
  amount_mismatch: '수량×단가가 원문의 금액과 다릅니다',
  not_divisible: '원문 금액을 나눠 수량(단가)을 구하지 못했습니다. 확인해 주세요',
  price_missing: '이 줄의 가격을 원문에서 찾지 못했습니다',
}

/** one flag in words; a row's format problem is usually a hand edit, so it names the columns */
export function flagText(flag: PumuiFlag): string {
  if (flag.reason === 'format')
    return flag.row === null
      ? '품목을 읽지 못했습니다. 다시 시도해 주세요'
      : '이 줄의 단위·수량·단가를 확인해 주세요'
  return REASON_TEXT[flag.reason] ?? '확인이 필요합니다'
}

/** the different sentences for a list of flags, in order */
export function flagTexts(flags: readonly PumuiFlag[]): string[] {
  return [...new Set(flags.map(flagText))]
}
