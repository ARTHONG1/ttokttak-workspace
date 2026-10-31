/**
 * The branch lines of a map, as SVG path data.
 *
 * The drawing library asks for one path per branch through two hooks: from
 * the central topic to a main topic, and from any topic to one below it. It
 * hands over boxes only (top, left, width, height of the two ends), so each
 * function here is pure geometry.
 *
 * Three shapes are drawn: a curve that leaves and arrives level, an elbow
 * with both corners rounded, and, for a skeleton whose topics sit on their
 * line, a curve that runs on under the topic's text. In that last one the
 * underline is part of the same path as the branch, so the two cannot come
 * apart; and the branch that leaves such a topic starts at the far end of its
 * underline, at the height the underline was drawn at.
 */
import type { ThemeBranchShape } from '@genoffice/xmind-engine'

/** The boxes the library hands a branch hook (pixels inside the element the path is drawn in). */
export interface BranchBoxes {
  /** the parent's box */
  pT: number
  pL: number
  pW: number
  pH: number
  /** the child's box */
  cT: number
  cL: number
  cW: number
  cH: number
  /** which side of the centre the branch is on: `lhs`, `rhs`, or `down` for the layout that grows downward */
  direction: string
  /** true when the parent is a main topic (hook for the lower branches only) */
  isFirst?: boolean
}

/** What the path functions need to know about the look being drawn. */
export interface BranchGeometry {
  /** how the lines below a main topic run */
  subShape: ThemeBranchShape
  cornerRadius: number
  /** the stroke width of the line a main topic sits on; null when main topics have no underline */
  mainUnderline: number | null
  /** the same for the topics below */
  subUnderline: number | null
  /** how far inside the central topic's edge a main branch starts, so its end is hidden under the topic */
  centralInset: number
  /** the space left and right of a topic below the main level, inside the box the library measures */
  subPadX: number
  /** the space above and below it */
  subPadY: number
  /** the space left and right of such a topic in the downward layout */
  downPadX: number
}

const DOWN = 'down'
const LHS = 'lhs'

function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** Leaves `(sx, sy)` level and arrives at `(ex, ey)` level. */
function levelCurve(sx: number, sy: number, ex: number, ey: number, bend = 0.5): string {
  const mx = sx + (ex - sx) * bend
  return `M ${n(sx)} ${n(sy)} C ${n(mx)} ${n(sy)} ${n(mx)} ${n(ey)} ${n(ex)} ${n(ey)}`
}

/** Leaves `(sx, sy)` downward and arrives at `(ex, ey)` from above. */
function fallingCurve(sx: number, sy: number, ex: number, ey: number): string {
  const my = sy + (ey - sy) * 0.5
  return `M ${n(sx)} ${n(sy)} C ${n(sx)} ${n(my)} ${n(ex)} ${n(my)} ${n(ex)} ${n(ey)}`
}

/** Out level, across on a trunk half way, in level; both corners rounded. */
function levelElbow(sx: number, sy: number, ex: number, ey: number, radius: number): string {
  const dx = ex - sx
  const dy = ey - sy
  if (Math.abs(dy) < 1) return `M ${n(sx)} ${n(sy)} H ${n(ex)}`
  const side = dx >= 0 ? 1 : -1
  const fall = dy >= 0 ? 1 : -1
  const mx = sx + dx / 2
  const r = Math.max(0, Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2))
  return (
    `M ${n(sx)} ${n(sy)} H ${n(mx - side * r)} Q ${n(mx)} ${n(sy)} ${n(mx)} ${n(sy + fall * r)}` +
    ` V ${n(ey - fall * r)} Q ${n(mx)} ${n(ey)} ${n(mx + side * r)} ${n(ey)} H ${n(ex)}`
  )
}

/** Down, across on a trunk half way, down again; both corners rounded. */
function fallingElbow(sx: number, sy: number, ex: number, ey: number, radius: number): string {
  const dx = ex - sx
  const dy = ey - sy
  if (Math.abs(dx) < 1) return `M ${n(sx)} ${n(sy)} V ${n(ey)}`
  const side = dx >= 0 ? 1 : -1
  const my = sy + dy / 2
  const r = Math.max(0, Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2))
  return (
    `M ${n(sx)} ${n(sy)} V ${n(my - r)} Q ${n(sx)} ${n(my)} ${n(sx + side * r)} ${n(my)}` +
    ` H ${n(ex - side * r)} Q ${n(ex)} ${n(my)} ${n(ex)} ${n(my + r)} V ${n(ey)}`
  )
}

/** The height the middle of an underline of this width is drawn at, for a topic whose box ends at `bottom`. */
function underlineY(bottom: number, width: number): number {
  return bottom - width / 2
}

/** From the central topic to a main topic. */
export function mainBranchPath(geometry: BranchGeometry, box: BranchBoxes): string {
  const { pT, pL, pW, pH, cT, cL, cW, cH, direction } = box
  const underline = geometry.mainUnderline
  if (direction === DOWN) {
    const path = fallingCurve(pL + pW / 2, pT + pH - geometry.centralInset, cL + cW / 2, cT)
    if (underline === null) return path
    const y = underlineY(cT + cH, underline)
    return `${path} M ${n(cL)} ${n(y)} H ${n(cL + cW)}`
  }
  const left = direction === LHS
  const sx = left ? pL + geometry.centralInset : pL + pW - geometry.centralInset
  const sy = pT + pH / 2
  const nearX = left ? cL + cW : cL
  if (underline === null) return levelCurve(sx, sy, nearX, cT + cH / 2)
  const farX = left ? cL : cL + cW
  return `${levelCurve(sx, sy, nearX, underlineY(cT + cH, underline))} H ${n(farX)}`
}

/** From a topic to one below it. */
export function subBranchPath(geometry: BranchGeometry, box: BranchBoxes): string {
  const { pT, pL, pW, pH, cT, cL, cW, cH, direction, isFirst } = box
  const underline = geometry.subUnderline
  if (direction === DOWN) {
    const sx = pL + pW / 2
    const sy = pT + pH
    const ex = cL + cW / 2
    const path =
      geometry.subShape === 'rounded-elbow'
        ? fallingElbow(sx, sy, ex, cT, geometry.cornerRadius)
        : fallingCurve(sx, sy, ex, cT)
    if (underline === null) return path
    const y = underlineY(cT + cH, underline)
    return `${path} M ${n(cL + geometry.downPadX)} ${n(y)} H ${n(cL + cW - geometry.downPadX)}`
  }
  const left = direction === LHS
  // a main topic fills the box the library measures; a topic below it has space around it
  const out = isFirst ? 0 : geometry.subPadX
  const sx = left ? pL + out : pL + pW - out
  const parentUnderline = isFirst ? geometry.mainUnderline : geometry.subUnderline
  const sy =
    parentUnderline === null
      ? pT + pH / 2
      : underlineY(pT + pH - (isFirst ? 0 : geometry.subPadY), parentUnderline)
  const nearX = left ? cL + cW - geometry.subPadX : cL + geometry.subPadX
  if (underline !== null) {
    const farX = left ? cL + geometry.subPadX : cL + cW - geometry.subPadX
    const ey = underlineY(cT + cH - geometry.subPadY, underline)
    return `${levelCurve(sx, sy, nearX, ey, 0.55)} H ${n(farX)}`
  }
  const ey = cT + cH / 2
  return geometry.subShape === 'rounded-elbow'
    ? levelElbow(sx, sy, nearX, ey, geometry.cornerRadius)
    : levelCurve(sx, sy, nearX, ey, 0.55)
}
