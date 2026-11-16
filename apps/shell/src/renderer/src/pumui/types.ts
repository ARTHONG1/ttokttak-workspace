/** one row of the 품의 목록; the field names are the original's estimateData (unchanged) */
export interface EstimateRow {
  description: string
  specification: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}

/** a row as the verifier reads it: the app contract without the derived amount */
export interface VerifierItem {
  description: string
  specification: string
  unit: string
  quantity: number
  unitPrice: number
}

export type PumuiStatus = 'confirmed' | 'unconfirmed' | 'needs_review'

/** a problem the verifier or the v3 computation found; row is null when it is about the whole list */
export interface PumuiFlag {
  row: number | null
  reason: string
}

export interface VerifyResult {
  status: PumuiStatus
  flags: PumuiFlag[]
  /** a total written in the text matched the total computed from the rows */
  totalVerified: boolean
  goodsTotal: number
  shipping: number
  total: number
}
