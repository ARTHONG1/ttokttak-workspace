/**
 * The shape of a fake K-에듀파인 screen, shared by the test fake and specFromDiagnostic
 * (a field diagnostic file turned into a fake screen for the tests). Types only.
 */
import type { ScreenMap } from './screen-map'

export type FakeRow = Record<string, unknown>

export type FakeObject =
  | { path: string; kind: 'edit' }
  | { path: string; kind: 'dataset'; columns: string[]; rows?: FakeRow[] }
  | { path: string; kind: 'grid'; bind: string }
  | { path: string; kind: 'button' }
  | { path: string; kind: 'div'; visible?: boolean }
  | { path: string; kind: 'function'; behavior: 'row-add' | 'forbidden' | 'none' }

export interface FakeSpec {
  frame: 'active' | 'none'
  map: ScreenMap
  objects: FakeObject[]
  /** the dataset the row-add function grows */
  rowAddTarget?: string
  budgetSelected?: boolean
  /** 1-based call number at which the row-add function silently adds nothing */
  failAddAt?: number
  /** the screen in front at the start; 'other' until the 품의등록 menu is opened */
  startOn?: 'pumui' | 'other'
}
