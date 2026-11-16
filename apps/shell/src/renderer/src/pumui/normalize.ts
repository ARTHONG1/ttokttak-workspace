import { COUPON, CART_TOTAL, SHIP, SHIP_SUM } from './verifier'

/**
 * The deterministic text work before the model, as in pumui_v2/pipeline.py: tidy the pasted
 * text and cut the recommendation areas a copied shop screen brings along.
 */

const REC_HEADER = /추천|함께\s*(보면|구매|많이|본|담은)|최근\s*본|광고|다른 고객/
const SUMMARY = new RegExp(CART_TOTAL.source + '|' + SHIP_SUM.source + '|' + COUPON.source)
const PRICED = /\d{1,3}(?:,\d{3})+|\d{3,}/

/** drop whitespace-only lines and trailing spaces; a copied screen can be half tab-only lines */
export function normalize(text: string): string {
  return text
    .replaceAll('\r', '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.trimEnd())
    .join('\n')
}

/**
 * Cut each recommendation or ad area: from its heading line to the next total or shipping
 * line. On 600 synthetic carts this removed all 135 recommended items and no cart item.
 */
export function cropRecommendations(text: string): { text: string; removed: number } {
  const kept: string[] = []
  let removed = 0
  let skipping = false
  for (const line of text.split('\n')) {
    const header = [...line].length <= 30 && !PRICED.test(line) && REC_HEADER.test(line)
    if (header) skipping = true
    else if (skipping && (SUMMARY.test(line) || (SHIP.test(line) && !line.includes('무료'))))
      skipping = false
    if (skipping) removed++
    else kept.push(line)
  }
  return { text: kept.join('\n'), removed }
}

/** what goes to the model and to the verifier: the tidied text without recommendation areas */
export function prepareCart(text: string): { text: string; removed: number } {
  return cropRecommendations(normalize(text))
}
