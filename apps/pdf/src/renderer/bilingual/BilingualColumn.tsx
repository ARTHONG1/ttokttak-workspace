/**
 * The translation column beside one page, the outline it draws on the page,
 * and the bar above the pages (reading-assist spec 4.5). Display only: the
 * actions that send or write (task T7) plug into the slots.
 */
import { Fragment, memo } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react'
import type { InlineRun } from '../../../../../packages/pdf-structure/src/tree/types'
import type { TFunc } from '../i18n/locale'
import type {
  BilingualCounts,
  BilingualItem,
  BilingualPage,
  BilingualTableItem,
  BilingualTextItem,
  BilingualUnit,
} from './model'
import { pendingUnits } from './model'
import type { BilingualData } from './useBilingualData'

// ── extension points (task T7 fills them) ──

/** what a page's action slot knows */
export interface BilingualPageContext {
  docHash: string
  lang: string
  /** original page (1-based) in the saved file */
  page: number
  counts: BilingualCounts
  /** the units on the page with nothing stored, in reading order */
  pending: BilingualUnit[]
}

/** what a paragraph's action slot knows */
export interface BilingualParagraphContext {
  docHash: string
  lang: string
  /** page the paragraph starts on */
  page: number
  /** the tree block (the table, for a cell paragraph) */
  itemId: string
  unit: BilingualUnit
}

export interface BilingualSlots {
  /** in each page's column header ("translate this page", "translate the rest (N)") */
  pageActions?: (ctx: BilingualPageContext) => ReactNode
  /** beside each paragraph ("translate again") */
  paragraphActions?: (ctx: BilingualParagraphContext) => ReactNode
  /** a paragraph was double-clicked (open its editor) */
  onParagraphDoubleClick?: (ctx: BilingualParagraphContext) => void
  /** replaces a paragraph's text (its editor while open); undefined keeps the text */
  renderParagraphBody?: (ctx: BilingualParagraphContext) => ReactNode | undefined
  /** in the bar above the pages ("translate all pages") */
  barActions?: (data: BilingualData) => ReactNode
  /** under the bar (what a press met: the connect prompt, the first-connection notice) */
  barPanel?: (data: BilingualData) => ReactNode
}

// ── inline text ──

/** inline runs as text: marks kept, links shown but not followed from the column */
export function BilingualRuns({ runs }: { runs: readonly InlineRun[] }): ReactElement {
  return (
    <>
      {runs.map((r, i) => {
        switch (r.kind) {
          case 'text': {
            let node: ReactNode = r.text
            if (r.href) node = <span className="bl-link">{node}</span>
            if (r.italic) node = <em>{node}</em>
            if (r.bold) node = <strong>{node}</strong>
            return <Fragment key={i}>{node}</Fragment>
          }
          case 'footnoteRef':
            return <sup key={i}>{r.marker ?? '*'}</sup>
          case 'math':
            return (
              <code key={i} className="bl-math">
                {r.latex}
              </code>
            )
          case 'lineBreak':
            return <br key={i} />
          default:
            return null
        }
      })}
    </>
  )
}

// ── the column ──

export interface BilingualColumnProps {
  /** null: a page inserted since the last save (its column stays empty) */
  page: BilingualPage | null
  docHash: string | null
  lang: string | null
  width: number
  height: number
  fontSize: number
  /** inside the drawn window (visible pages and two on each side) */
  drawn: boolean
  /** the linked block under the pointer (column or page) */
  hoverId: string | null
  t: TFunc
  slots: BilingualSlots | undefined
  onHover: (id: string | null) => void
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>) => void
}

const STATE_TIP = {
  pending: 'blPendingTip',
  failed: 'blFailedTip',
} as const

function unitClass(unit: BilingualUnit): string {
  if (unit.state === 'translated') return unit.edited ? ' bl-edited' : ''
  return unit.state === 'failed' ? ' bl-source bl-failed' : ' bl-source'
}

function unitTip(unit: BilingualUnit, t: TFunc): string | undefined {
  if (unit.state === 'translated') return unit.edited ? t('blEditedTip') : undefined
  return t(STATE_TIP[unit.state])
}

function UnitBody({
  unit,
  ctx,
  slots,
}: {
  unit: BilingualUnit
  ctx: BilingualParagraphContext | null
  slots: BilingualSlots | undefined
}): ReactElement {
  const override = ctx ? slots?.renderParagraphBody?.(ctx) : undefined
  return <>{override !== undefined ? override : <BilingualRuns runs={unit.runs} />}</>
}

function Actions({
  ctx,
  slots,
}: {
  ctx: BilingualParagraphContext | null
  slots: BilingualSlots | undefined
}): ReactElement | null {
  const node = ctx ? slots?.paragraphActions?.(ctx) : null
  return node ? <span className="bl-item-actions">{node}</span> : null
}

function TextItem(props: {
  item: BilingualTextItem
  ctxOf: (itemId: string, unit: BilingualUnit) => BilingualParagraphContext | null
  hover: boolean
  t: TFunc
  slots: BilingualSlots | undefined
  onHover: (id: string | null) => void
}): ReactElement {
  const { item, ctxOf, hover, t, slots, onHover } = props
  const { unit } = item
  const ctx = ctxOf(item.id, unit)
  const linked = item.regions.length > 0
  const level = item.role === 'heading' ? Math.min(Math.max(item.level ?? 1, 1), 6) : 0
  return (
    <div
      className={`bl-item bl-${item.role}${level ? ` bl-h${level}` : ''}${unitClass(unit)}${
        linked ? ' bl-linked' : ''
      }${hover ? ' bl-hover' : ''}`}
      data-bl-id={item.id}
      title={unitTip(unit, t)}
      onMouseEnter={linked ? () => onHover(item.id) : undefined}
      onMouseLeave={linked ? () => onHover(null) : undefined}
      onDoubleClick={
        ctx && slots?.onParagraphDoubleClick ? () => slots.onParagraphDoubleClick!(ctx) : undefined
      }
    >
      {item.marker !== undefined &&
        (item.role === 'footnote' ? (
          <sup className="bl-marker">{item.marker}</sup>
        ) : (
          <span className="bl-marker">{item.marker}</span>
        ))}
      <UnitBody unit={unit} ctx={ctx} slots={slots} />
      <Actions ctx={ctx} slots={slots} />
    </div>
  )
}

function TableItem(props: {
  item: BilingualTableItem
  ctxOf: (itemId: string, unit: BilingualUnit) => BilingualParagraphContext | null
  hover: boolean
  t: TFunc
  slots: BilingualSlots | undefined
  onHover: (id: string | null) => void
}): ReactElement {
  const { item, ctxOf, hover, t, slots, onHover } = props
  const linked = item.regions.length > 0
  const rows = Array.from({ length: item.rowCount }, (_, r) =>
    item.cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col),
  )
  return (
    <div
      className={`bl-item bl-table-wrap${linked ? ' bl-linked' : ''}${hover ? ' bl-hover' : ''}`}
      data-bl-id={item.id}
      onMouseEnter={linked ? () => onHover(item.id) : undefined}
      onMouseLeave={linked ? () => onHover(null) : undefined}
    >
      <table className="bl-table">
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((c) => {
                const Cell = c.header ? 'th' : 'td'
                return (
                  <Cell
                    key={`${c.row}.${c.col}`}
                    rowSpan={c.rowSpan > 1 ? c.rowSpan : undefined}
                    colSpan={c.colSpan > 1 ? c.colSpan : undefined}
                  >
                    {c.paragraphs.map((p, k) => {
                      if (!p.unit)
                        return (
                          <div key={k} className="bl-cell-p">
                            <BilingualRuns runs={p.runs} />
                          </div>
                        )
                      const ctx = ctxOf(item.id, p.unit)
                      return (
                        <div
                          key={k}
                          className={`bl-cell-p${unitClass(p.unit)}`}
                          title={unitTip(p.unit, t)}
                          onDoubleClick={
                            ctx && slots?.onParagraphDoubleClick
                              ? () => slots.onParagraphDoubleClick!(ctx)
                              : undefined
                          }
                        >
                          <UnitBody unit={p.unit} ctx={ctx} slots={slots} />
                          <Actions ctx={ctx} slots={slots} />
                        </div>
                      )
                    })}
                  </Cell>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Item(props: {
  item: BilingualItem
  ctxOf: (itemId: string, unit: BilingualUnit) => BilingualParagraphContext | null
  hover: boolean
  t: TFunc
  slots: BilingualSlots | undefined
  onHover: (id: string | null) => void
}): ReactElement {
  return props.item.kind === 'text' ? (
    <TextItem {...props} item={props.item} />
  ) : (
    <TableItem {...props} item={props.item} />
  )
}

/** the translation column of one page */
export const BilingualColumn = memo(function BilingualColumn(
  props: BilingualColumnProps,
): ReactElement {
  const { page, docHash, lang, width, height, fontSize, drawn, hoverId, t, slots } = props
  const style = { width, height, ['--bl-font' as string]: `${fontSize}px` }
  if (!page) {
    return <div className="bl-col bl-col-blank" style={style} aria-hidden="true" />
  }
  const ready = drawn && docHash !== null && lang !== null
  const ctxOf = (itemId: string, unit: BilingualUnit): BilingualParagraphContext | null =>
    docHash !== null && lang !== null ? { docHash, lang, page: page.page, itemId, unit } : null
  const pageActions =
    ready && slots?.pageActions
      ? slots.pageActions({
          docHash: docHash!,
          lang: lang!,
          page: page.page,
          counts: page.counts,
          pending: pendingUnits(page),
        })
      : null
  return (
    <div className="bl-col" style={style} data-bl-page={page.page}>
      <div
        className="bl-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('blResize')}
        onPointerDown={props.onResizeStart}
      />
      <div className="bl-col-head">
        <span className="bl-col-page">{t('blPageHeader', { page: page.page })}</span>
        {page.counts.units > 0 && (
          <span className="bl-col-count">
            {t('blPageCount', { translated: page.counts.translated, units: page.counts.units })}
          </span>
        )}
        {pageActions && <span className="bl-page-actions">{pageActions}</span>}
      </div>
      {ready && (
        <div className="bl-col-body">
          {page.continued.map((c) => (
            <div
              key={`c:${c.id}`}
              className={`bl-continued${hoverId === c.id ? ' bl-hover' : ''}`}
              onMouseEnter={() => props.onHover(c.id)}
              onMouseLeave={() => props.onHover(null)}
            >
              {t('blContinued')}
            </div>
          ))}
          {page.items.map((item) => (
            <Item
              key={item.id}
              item={item}
              ctxOf={ctxOf}
              hover={hoverId === item.id}
              t={t}
              slots={slots}
              onHover={props.onHover}
            />
          ))}
          {page.items.length === 0 && page.continued.length === 0 && (
            <div className="bl-empty">{t('blNoText')}</div>
          )}
        </div>
      )}
    </div>
  )
})

/** a folded column: a thin strip that unfolds it */
export function BilingualFoldedColumn(props: {
  height: number
  width: number
  t: TFunc
  onExpand: () => void
}): ReactElement {
  return (
    <div className="bl-col bl-col-folded" style={{ width: props.width, height: props.height }}>
      <button
        type="button"
        className="bl-expand"
        aria-label={props.t('blExpand')}
        data-tip={props.t('blExpand')}
        onClick={props.onExpand}
      >
        ‹
      </button>
    </div>
  )
}

/** outlines of the hovered block's source boxes on one page (screen only) */
export function BilingualPageOverlay(props: {
  boxes: ReadonlyArray<{ left: number; top: number; width: number; height: number }>
}): ReactElement | null {
  if (props.boxes.length === 0) return null
  return (
    <div className="bl-overlay" aria-hidden="true">
      {props.boxes.map((b, i) => (
        <div
          key={i}
          className="bl-overlay-box"
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
        />
      ))}
    </div>
  )
}
