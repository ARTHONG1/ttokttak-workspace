import type { Placement } from './sign-geometry'

/** 똑딱서명: how signatures are put on pages and moved about there (view points, y down). */

export interface PageSize {
  width: number
  height: number
}

/** one signature on one page; `sig` names the picture */
export interface PlacedSign extends Placement {
  id: string
  page: number
  sig: string
}

/** a new signature's size: about a signature line's width, never more than a fifth of the page high */
export function newPlacement(picture: PageSize, page: PageSize): Placement {
  const aspect = picture.height / Math.max(1, picture.width)
  let width = Math.min(160, page.width * 0.25)
  let height = width * aspect
  const maxHeight = page.height * 0.2
  if (height > maxHeight) {
    height = maxHeight
    width = height / aspect
  }
  return { cx: page.width / 2, cy: page.height / 2, width, height, angle: 0 }
}

const wrap = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180
  // -0 compares equal to 0: either way the result is a plain 0
  return d === 0 ? 0 : d
}

/** the rotate handle sits above the centre: pointing straight up is 0°, clockwise positive */
export function angleFromPointer(cx: number, cy: number, px: number, py: number): number {
  return wrap((Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90)
}

/** Shift steps by 15°; otherwise an angle within 4° of a right angle settles onto it */
export function snapAngle(deg: number, steps: boolean): number {
  const d = wrap(deg)
  if (steps) return wrap(Math.round(d / 15) * 15)
  const right = Math.round(d / 90) * 90
  return Math.abs(d - right) <= 4 ? wrap(right) : Math.round(d * 10) / 10
}

/** the signature's centre stays on its page */
export function clampToPage(p: Placement, page: PageSize): Placement {
  return {
    ...p,
    cx: Math.min(Math.max(p.cx, 0), page.width),
    cy: Math.min(Math.max(p.cy, 0), page.height),
  }
}

/** copies of `item` for every other page, at the same place relative to the page */
export function onEveryPage(
  item: PlacedSign,
  sizes: readonly PageSize[],
  makeId: () => string,
): PlacedSign[] {
  const from = sizes[item.page]
  if (!from) return []
  const out: PlacedSign[] = []
  sizes.forEach((size, page) => {
    if (page === item.page) return
    out.push({
      ...item,
      id: makeId(),
      page,
      cx: (item.cx / from.width) * size.width,
      cy: (item.cy / from.height) * size.height,
    })
  })
  return out
}
