/** reading K-에듀파인's page objects without ever throwing */

export function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    try {
      cur = (cur as Record<string, unknown>)[key]
    } catch {
      return undefined
    }
  }
  return cur
}

export interface DatasetLike {
  rowcount: number
  getColumn(row: number, col: string): unknown
  setColumn(row: number, col: string, value: unknown): unknown
  deleteRow(row: number): unknown
}

export const isDataset = (v: unknown): v is DatasetLike =>
  !!v &&
  typeof (v as DatasetLike).getColumn === 'function' &&
  typeof (v as DatasetLike).setColumn === 'function' &&
  typeof (v as DatasetLike).rowcount === 'number'

