/**
 * The filter between a style value a map file holds and a style on screen.
 *
 * A map file may come from anyone, and its style values are strings the file
 * chose. None of them is ever put into a style as written. A value is read
 * here into one of two shapes, and a style gets only what this module then
 * writes out itself:
 *
 * - a colour: `#` and 3, 4, 6 or 8 hex digits, written back as `#rrggbb` or
 *   `#rrggbbaa` in lower case;
 * - a number: digits, at most one decimal point, and at most one of the units
 *   `pt` and `px`, written back as a number of CSS pixels.
 *
 * Words are taken only when they are in the short lists below, and each stands
 * for a value this app chose (`bold` is 700, `none` is "no fill"). Everything
 * else (another word, a function, a list, a sentence, a sign, an exponent) is
 * no value: the answer is null and the property is drawn the way the theme
 * draws it. The file's own value is never touched by any of this.
 *
 * The same filter is for the screen, exported pictures, print and the preview
 * picture: all of them draw from `ownTopicStyle`.
 */
import type { ViewTopicStyle } from '@genoffice/xmind-engine'

/** A colour as this app writes it: `#rrggbb` or `#rrggbbaa`, lower case. */
export type SafeColor = `#${string}`

/** The word for "this topic has no fill". */
export const NO_FILL = 'none'

/** What a topic's own style values come to. Null: draw that property as the theme does. */
export interface OwnTopicStyle {
  color: SafeColor | null
  fill: SafeColor | typeof NO_FILL | null
  /** 100 to 900 */
  fontWeight: number | null
  /** CSS pixels */
  fontSize: number | null
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
/** up to four digits, up to three decimals, one known unit or none */
const NUMBER = /^(\d{1,4}(?:\.\d{1,3})?)(pt|px)?$/

const PX_PER_PT = 96 / 72

/** Font sizes a file may mean, in the unit it gives; outside them the value is no size. */
const FONT_SIZE_MEANT = { min: 1, max: 400 } as const
/** What a topic is drawn with at the least and at the most, in CSS pixels. */
export const FONT_SIZE_DRAWN = { min: 8, max: 96 } as const
/** Line widths a file may mean, and the widest one drawn (CSS pixels). */
const LINE_WIDTH_MEANT = { min: 0, max: 64 } as const
export const LINE_WIDTH_DRAWN_MAX = 12

/** The words this app knows for a weight, and the weight each stands for here. */
const WEIGHT_WORDS: Readonly<Record<string, number>> = { normal: 400, bold: 700 }

/** A colour value of the file as a colour this app writes; null for anything that is not a `#` hex colour. */
export function safeColor(value: unknown): SafeColor | null {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return null
  const digits = value.slice(1).toLowerCase()
  const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits
  return `#${full}`
}

/** A number value of the file with its unit; null for anything that is not number-shaped. */
function readNumber(value: unknown): { amount: number; unit: 'pt' | 'px' | null } | null {
  if (typeof value !== 'string') return null
  const match = NUMBER.exec(value)
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount)
    ? { amount, unit: (match[2] as 'pt' | 'px' | undefined) ?? null }
    : null
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * A font size in CSS pixels. A bare number is points, the unit the format
 * writes sizes in. A size no file means is no value; one that is meant is
 * drawn inside `FONT_SIZE_DRAWN`.
 */
export function safeFontSize(value: unknown): number | null {
  const read = readNumber(value)
  if (!read) return null
  if (read.amount < FONT_SIZE_MEANT.min || read.amount > FONT_SIZE_MEANT.max) return null
  const pixels = read.unit === 'px' ? read.amount : read.amount * PX_PER_PT
  return round(Math.min(FONT_SIZE_DRAWN.max, Math.max(FONT_SIZE_DRAWN.min, pixels)))
}

/** A font weight from 100 to 900: a bare whole number, or one of the two known words. */
export function safeFontWeight(value: unknown): number | null {
  if (typeof value === 'string' && Object.hasOwn(WEIGHT_WORDS, value)) return WEIGHT_WORDS[value]!
  const read = readNumber(value)
  if (!read || read.unit !== null || !Number.isInteger(read.amount)) return null
  if (read.amount < 1 || read.amount > 1000) return null
  return Math.min(900, Math.max(100, read.amount))
}

/** A fill: a colour, or the known word for "no fill". */
export function safeFill(value: unknown): SafeColor | typeof NO_FILL | null {
  return value === NO_FILL ? NO_FILL : safeColor(value)
}

/** A line width in CSS pixels, at most `LINE_WIDTH_DRAWN_MAX`. A bare number is points. */
export function safeLineWidth(value: unknown): number | null {
  const read = readNumber(value)
  if (!read) return null
  if (read.amount < LINE_WIDTH_MEANT.min || read.amount > LINE_WIDTH_MEANT.max) return null
  const pixels = read.unit === 'px' ? read.amount : read.amount * PX_PER_PT
  return round(Math.min(LINE_WIDTH_DRAWN_MAX, pixels))
}

/** The style values set on a topic itself, as far as they may reach a style. */
export function ownTopicStyle(style: ViewTopicStyle | null | undefined): OwnTopicStyle {
  return {
    color: safeColor(style?.color),
    fill: safeFill(style?.fill),
    fontWeight: safeFontWeight(style?.fontWeight),
    fontSize: safeFontSize(style?.fontSize),
  }
}

/** Whether a topic sets nothing of its own that is drawn. */
export function isPlainStyle(own: OwnTopicStyle): boolean {
  return own.color === null && own.fill === null && own.fontWeight === null && own.fontSize === null
}

/** The `#rrggbb` part of a safe colour and its opacity from 0 to 1. */
export function splitAlpha(color: SafeColor): { solid: string; alpha: number } {
  if (color.length !== 9) return { solid: color, alpha: 1 }
  return { solid: color.slice(0, 7), alpha: Number.parseInt(color.slice(7), 16) / 255 }
}
