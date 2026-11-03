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

/** a window as the page script sees it: its globals, its child frames by index and their count */
export interface FrameWin {
  nexacro?: unknown
  location?: { pathname?: string }
  length: number
  [index: number]: FrameWin | undefined
}

const MAX_FRAME_DEPTH = 3
const MAX_FRAMES = 30

/** the nexacro object of one window when it carries a running app; never throws (other origins do) */
function nexacroOf(w: FrameWin): { getApplication(): unknown } | undefined {
  try {
    const nx = w.nexacro as { getApplication?: unknown } | undefined
    return nx && typeof nx.getApplication === 'function' ? (nx as { getApplication(): unknown }) : undefined
  } catch {
    return undefined
  }
}

function childFrames(w: FrameWin): FrameWin[] {
  const out: FrameWin[] = []
  let n = 0
  try {
    n = Math.min(Number(w.length) || 0, MAX_FRAMES)
  } catch {
    return out
  }
  for (let i = 0; i < n; i++) {
    try {
      const child = w[i]
      if (child) out.push(child)
    } catch {
      /* gone while we looked */
    }
  }
  return out
}

/**
 * K-에듀파인's nexacro: on the page itself, or in a same-origin frame inside it (a portal
 * page can wrap the app in one). The page script runs in the top frame only and reaches
 * same-origin frames directly; frames of other origins are skipped.
 */
export function findNexacro<T = { getApplication(): unknown }>(top: FrameWin): T | undefined {
  let level = [top]
  for (let depth = 0; depth <= MAX_FRAME_DEPTH && level.length; depth++) {
    const next: FrameWin[] = []
    for (const w of level) {
      const nx = nexacroOf(w)
      if (nx) return nx as T
      next.push(...childFrames(w))
    }
    level = next
  }
  return undefined
}

export interface FrameInfo {
  depth: number
  /** the frame's path only (never the query, which can carry values); other origins are not readable */
  path: string
  nexacro: boolean
}

/** the page's frames for the diagnostic file: where the app is when the self-check cannot find it */
export function frameSurvey(top: FrameWin): FrameInfo[] {
  const out: FrameInfo[] = []
  const visit = (w: FrameWin, depth: number): void => {
    if (out.length >= MAX_FRAMES) return
    let path = '(다른 주소)'
    try {
      path = String(w.location?.pathname ?? '')
    } catch {
      /* another origin */
    }
    out.push({ depth, path, nexacro: !!nexacroOf(w) })
    if (depth < MAX_FRAME_DEPTH) for (const c of childFrames(w)) visit(c, depth + 1)
  }
  visit(top, 0)
  return out
}

