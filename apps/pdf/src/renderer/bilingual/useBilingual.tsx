/**
 * The side-by-side translation view as the editor mounts it (reading-assist
 * spec 4.5): the data (./useBilingualData), the column width and text size,
 * the fold prompt, and the link between a translated paragraph and its
 * source boxes. The editor gets back render pieces to place: the bar above
 * the pages, a column per page row, an outline layer per page, and the width
 * the column takes from the page area.
 *
 * Hover linking: a translated paragraph under the pointer outlines its
 * source boxes (`regions`) on the page, under any unsaved rotation; the
 * pointer over the source text of a block highlights that block's paragraph.
 * Blocks without boxes (AI-read pages) only keep their order.
 *
 * The actions (./BilingualActions) plug into `slots` and call `refresh`
 * after they wrote to the store. Nothing here sends anything or writes to
 * the store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { TFunc } from '../i18n/locale'
import { geomDispSize, type PageGeom } from '../annotations'
import {
  PAGE_GAP,
  SCROLL_PAD,
  clampBilingualFont,
  clampBilingualW,
  loadBilingualFont,
  loadBilingualW,
  saveBilingualFont,
  saveBilingualW,
} from '../view-config'
import {
  BILINGUAL_COLLAPSED_W,
  bilingualRenderWindow,
  columnPageOf,
  hitTestRegions,
  pagePointToTree,
  regionCssBox,
  shouldAskToCollapse,
  type BilingualCounts,
} from './model'
import {
  BilingualColumn,
  BilingualFoldedColumn,
  BilingualPageOverlay,
  type BilingualSlots,
} from './BilingualColumn'
import { BilingualBar } from './BilingualBar'
import { useBilingualData, type BilingualData, type BilingualDataApi } from './useBilingualData'

export interface UseBilingualOptions {
  enabled: boolean
  /** the bar's close button */
  onClose: () => void
  /** the open file as saved */
  filePath: string
  password: string | undefined
  uiLang: Lang
  t: TFunc
  /** bumped after a save that changed the file */
  revision: number
  api: BilingualDataApi | null
  scrollRef: RefObject<HTMLElement | null>
  scale: number
  /** the page's on-screen geometry (saved rotation plus any unsaved one) */
  pageGeom: (origIdx: number) => PageGeom
  /** the page's rotation in the saved file */
  savedRot: (origIdx: number) => number
  /** pages of the saved file (indices past it are inserted, unsaved pages) */
  savedPageCount: number
  rowCount: number
  visibleRows: ReadonlySet<number>
  /** pages inserted, deleted or reordered and not saved */
  unsavedPageEdits: boolean
  /** other columns beside the pages (the comments margin), px */
  reservedWidth: number
  slots?: BilingualSlots
}

export interface BilingualView {
  data: BilingualData
  /** width the column takes beside each page, gap included (0 while off) */
  extraWidth: number
  /** the strip above the pages (null while off) */
  bar: ReactNode
  /** the column after a row's pages (null while off) */
  column: (row: readonly number[], rowIdx: number) => ReactNode
  /** the outline layer inside a page (null when nothing is linked there) */
  overlay: (origIdx: number) => ReactNode
  /** read the stored translation again after a write */
  refresh: () => void
  /** a saved page's counts (null while off or loading) */
  pageCounts: (page: number) => BilingualCounts | null
}

type Hover = { id: string; from: 'column' | 'page' } | null

export function useBilingual(o: UseBilingualOptions): BilingualView {
  const data = useBilingualData({
    enabled: o.enabled,
    filePath: o.filePath,
    password: o.password,
    uiLang: o.uiLang,
    revision: o.revision,
    api: o.api,
  })
  const [width, setWidth] = useState(loadBilingualW)
  const [fontSize, setFontSize] = useState(loadBilingualFont)
  const [collapsed, setCollapsed] = useState(false)
  const [askCollapse, setAskCollapse] = useState(false)
  /** the fold prompt shows once in the tab's life */
  const askedRef = useRef(false)
  const [hover, setHover] = useState<Hover>(null)

  const { enabled, scrollRef } = o
  const extraWidth = enabled ? (collapsed ? BILINGUAL_COLLAPSED_W : width) + PAGE_GAP : 0

  // off: forget the transient view state (the tree is dropped by the data hook)
  useEffect(() => {
    if (enabled) return
    setHover(null)
    setCollapsed(false)
    setAskCollapse(false)
  }, [enabled])

  // the page area got too narrow: ask once whether to fold the column
  const reservedWidth = o.reservedWidth
  useEffect(() => {
    const el = scrollRef.current
    if (!enabled || !el) return
    const check = () => {
      const pageAreaWidth = el.clientWidth - SCROLL_PAD * 2 - extraWidth - reservedWidth
      if (shouldAskToCollapse({ pageAreaWidth, asked: askedRef.current, collapsed })) {
        askedRef.current = true
        setAskCollapse(true)
      }
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled, scrollRef, extraWidth, reservedWidth, collapsed])

  // the pointer over a page's source text highlights that block's paragraph
  const latest = useRef(o)
  latest.current = o
  const modelRef = useRef(data.model)
  modelRef.current = data.model
  useEffect(() => {
    const el = scrollRef.current
    if (!enabled || !el || !data.model) return
    const clearPage = () => setHover((h) => (h?.from === 'page' ? null : h))
    const onMove = (e: MouseEvent) => {
      const model = modelRef.current
      const target = e.target as Element | null
      if (!model || target?.closest?.('.bl-col')) return
      const pageEl = target?.closest?.<HTMLElement>('.pdf-page[data-page]')
      const cur = latest.current
      const origIdx = pageEl ? Number(pageEl.dataset.page) : NaN
      const page = Number.isFinite(origIdx) ? columnPageOf(origIdx, cur.savedPageCount) : null
      if (!pageEl || page === null) {
        clearPage()
        return
      }
      const box = pageEl.getBoundingClientRect()
      const [x, y] = pagePointToTree(
        e.clientX - box.left,
        e.clientY - box.top,
        cur.pageGeom(origIdx),
        cur.savedRot(origIdx),
        cur.scale,
      )
      const id = hitTestRegions(model.regionsByPage.get(page), x, y)
      setHover((h) => {
        if (h?.from === 'column') return h
        if (!id) return h ? null : h
        return h?.id === id ? h : { id, from: 'page' }
      })
    }
    el.addEventListener('mousemove', onMove, { passive: true })
    el.addEventListener('mouseleave', clearPage)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', clearPage)
    }
  }, [enabled, scrollRef, data.model])

  const onColumnHover = useCallback(
    (id: string | null) => setHover(id ? { id, from: 'column' } : null),
    [],
  )

  // drag the column's left edge: wider to the left
  const onResizeStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      let next = startW
      const move = (ev: PointerEvent) => {
        next = clampBilingualW(startW - (ev.clientX - startX))
        setWidth(next)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        saveBilingualW(next)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [width],
  )

  const onFontSize = useCallback((px: number) => {
    const next = clampBilingualFont(px)
    setFontSize(next)
    saveBilingualFont(next)
  }, [])

  const drawnRows = useMemo(
    () => bilingualRenderWindow(o.visibleRows, o.rowCount),
    [o.visibleRows, o.rowCount],
  )

  const t = o.t
  const bar = enabled ? (
    <>
      <BilingualBar
        load={data.load}
        lang={data.lang}
        storedLangs={data.storedLangs}
        uiLang={o.uiLang}
        fontSize={fontSize}
        unsavedPageEdits={o.unsavedPageEdits}
        askCollapse={askCollapse}
        t={t}
        onLang={data.setLang}
        onFontSize={onFontSize}
        onCollapse={() => {
          setCollapsed(true)
          setAskCollapse(false)
        }}
        onDismissCollapse={() => setAskCollapse(false)}
        onClose={o.onClose}
        actions={o.slots?.barActions?.(data)}
      />
      {o.slots?.barPanel?.(data)}
    </>
  ) : null

  const column = (row: readonly number[], rowIdx: number): ReactNode => {
    if (!enabled) return null
    const origIdx = row[0]
    if (origIdx === undefined) return null
    const height = Math.floor(geomDispSize(o.pageGeom(origIdx)).height * o.scale)
    if (collapsed) {
      return (
        <BilingualFoldedColumn
          width={BILINGUAL_COLLAPSED_W}
          height={height}
          t={t}
          onExpand={() => setCollapsed(false)}
        />
      )
    }
    const pageNo = columnPageOf(origIdx, o.savedPageCount)
    const page =
      pageNo === null
        ? null
        : (data.model?.pages.get(pageNo) ?? {
            page: pageNo,
            items: [],
            continued: [],
            counts: { units: 0, translated: 0, failed: 0, pending: 0 },
          })
    return (
      <BilingualColumn
        page={page}
        docHash={data.model ? data.docHash : null}
        lang={data.model ? data.lang : null}
        width={width}
        height={height}
        fontSize={fontSize}
        drawn={drawnRows.has(rowIdx)}
        hoverId={hover?.id ?? null}
        t={t}
        slots={o.slots}
        onHover={onColumnHover}
        onResizeStart={onResizeStart}
      />
    )
  }

  const overlay = (origIdx: number): ReactNode => {
    if (!enabled || hover?.from !== 'column' || !data.model) return null
    const item = data.model.itemsById.get(hover.id)
    const page = columnPageOf(origIdx, o.savedPageCount)
    if (!item || page === null) return null
    const geom = o.pageGeom(origIdx)
    const savedRot = o.savedRot(origIdx)
    const boxes = item.regions
      .filter((r) => r.page === page)
      .map((r) => regionCssBox(r.box, geom, savedRot, o.scale))
    return boxes.length > 0 ? <BilingualPageOverlay boxes={boxes} /> : null
  }

  const pageCounts = (page: number): BilingualCounts | null =>
    data.model?.pages.get(page)?.counts ?? null

  return { data, extraWidth, bar, column, overlay, refresh: data.refresh, pageCounts }
}
