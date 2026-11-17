import { XMLValidator } from 'fast-xml-parser'
import {
  contentTypeOf,
  declarePart,
  defaultTypes,
  dropUnreachable,
  freshPartName,
  freshRelId,
  hasOverride,
  readRels,
  relativeTarget,
  resolveTarget,
  writeRels,
  xmlUnescape,
  type Rel,
} from './opc'
import { readText, writeBytes, writeText, type ZipPackage } from './zip'

/**
 * 똑딱정리 for Word files. A Word file does not store its pages (Word lays them out when it
 * opens), so the units here are the parts between the breaks the author put in: page breaks
 * and section breaks. Keeping some parts keeps their section settings (paper, margins,
 * headers); joining files puts each one in its own section, so each keeps its own paper and
 * headers, and copies what its text points at: pictures, links, styles it lacks, list
 * numbering, footnotes.
 */

export class DocxShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocxShapeError'
  }
}

/** one element at the top of w:body, as text */
interface Child {
  xml: string
  name: string
}

const TAG =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([\w:.-]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g

/** the top-level elements of an XML fragment, in order (text between them is dropped) */
export function topElements(xml: string): Child[] {
  const out: Child[] = []
  let depth = 0
  let start = -1
  let name = ''
  TAG.lastIndex = 0
  for (let m = TAG.exec(xml); m; m = TAG.exec(xml)) {
    if (m[2] === undefined) continue
    const closing = m[1] === '/'
    const selfClosing = m[4] === '/'
    if (closing) {
      depth--
      if (depth < 0) throw new DocxShapeError('unbalanced XML')
      if (depth === 0) out.push({ xml: xml.slice(start, m.index + m[0].length), name })
    } else if (selfClosing) {
      if (depth === 0) out.push({ xml: m[0], name: m[2] })
    } else {
      if (depth === 0) {
        start = m.index
        name = m[2]
      }
      depth++
    }
  }
  if (depth !== 0) throw new DocxShapeError('unbalanced XML')
  return out
}

export interface DocxBody {
  part: string
  /** the document part up to and with the opening w:body tag */
  head: string
  children: Child[]
  /** the body's own w:sectPr (the last section's settings) */
  sectPr: string
  /** from the closing w:body tag on */
  tail: string
}

export function mainPartOf(pkg: ZipPackage): string {
  const rel = readRels(pkg, '').find((r) => r.kind === 'officeDocument')
  if (!rel) throw new DocxShapeError('no main document')
  return resolveTarget('', rel.target)
}

export function readBody(pkg: ZipPackage): DocxBody {
  const part = mainPartOf(pkg)
  const xml = readText(pkg, part)
  if (!xml) throw new DocxShapeError('no main document')
  const open = /<w:body\b[^>]*>/.exec(xml)
  const close = xml.lastIndexOf('</w:body>')
  if (!open || close < 0) throw new DocxShapeError('no body')
  const inner = xml.slice(open.index + open[0].length, close)
  const children = topElements(inner)
  let sectPr = ''
  if (children.length > 0 && children[children.length - 1]!.name === 'w:sectPr') {
    sectPr = children.pop()!.xml
  }
  return {
    part,
    head: xml.slice(0, open.index + open[0].length),
    children,
    sectPr,
    tail: xml.slice(close),
  }
}

const hasSectionBreak = (c: Child): boolean => c.name === 'w:p' && /<w:sectPr\b/.test(c.xml)

const PAGE_BR = /<w:br\b[^>]*w:type="page"[^>]*\/>/g
const CONTENT = /<w:t[\s>]|<w:drawing\b|<w:pict\b|<w:object\b|<w:tab\/>|<w:sym\b/

/** a paragraph whose last content is a page break: the page ends after it */
function endsWithPageBreak(c: Child): boolean {
  if (c.name !== 'w:p') return false
  const at = [...c.xml.matchAll(PAGE_BR)].pop()
  return at !== undefined && !CONTENT.test(c.xml.slice(at.index + at[0].length))
}

/** a paragraph whose first content is a page break: the page starts with it */
function startsWithPageBreak(c: Child): boolean {
  if (c.name !== 'w:p') return false
  const at = c.xml.search(PAGE_BR)
  return at >= 0 && !CONTENT.test(c.xml.slice(0, at))
}

const BREAK_BEFORE = /<w:pageBreakBefore(?:\s+w:val="(?:1|true|on)")?\s*\/>/

const pageBreakBefore = (c: Child): boolean => c.name === 'w:p' && BREAK_BEFORE.test(c.xml)

/** the parts between the author's page and section breaks, as [first, last] child indexes */
export function partsOf(body: DocxBody): [number, number][] {
  const parts: [number, number][] = []
  let start = 0
  const n = body.children.length
  for (let i = 0; i < n; i++) {
    const c = body.children[i]!
    // a paragraph holding only a page break ends the page before it; one with text after its
    // break starts the next page
    if (i > start && (pageBreakBefore(c) || (startsWithPageBreak(c) && !endsWithPageBreak(c)))) {
      parts.push([start, i - 1])
      start = i
    }
    if (hasSectionBreak(c) || endsWithPageBreak(c)) {
      parts.push([start, i])
      start = i + 1
    }
  }
  if (start < n) parts.push([start, n - 1])
  return parts
}

export function textOf(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((m) => xmlUnescape(m[1]!))
    .join('')
}

/** the w:sectPr inside a section-break paragraph */
const paragraphSectPr = (c: Child): string =>
  /<w:sectPr\b[\s\S]*<\/w:sectPr>|<w:sectPr\b[^>]*\/>/.exec(c.xml)?.[0] ?? ''

/** the section settings that rule a child: the next section break at or after it */
function sectPrRuling(body: DocxBody, index: number): string {
  for (let i = index; i < body.children.length; i++) {
    const c = body.children[i]!
    if (hasSectionBreak(c)) return paragraphSectPr(c)
  }
  return body.sectPr
}

const stripLastPageBreak = (xml: string): string => {
  const at = [...xml.matchAll(PAGE_BR)].pop()
  return at ? xml.slice(0, at.index) + xml.slice(at.index + at[0].length) : xml
}

const stripFirstPageBreak = (xml: string): string =>
  startsWithPageBreak({ xml, name: 'w:p' })
    ? xml.replace(/<w:br\b[^>]*w:type="page"[^>]*\/>/, '')
    : xml

/** relationship kinds the body points at by id; one no longer pointed at can go */
const BODY_KINDS = new Set([
  'image',
  'hyperlink',
  'chart',
  'oleObject',
  'package',
  'diagramData',
  'diagramLayout',
  'diagramQuickStyle',
  'diagramColors',
  'diagramDrawing',
  'video',
  'audio',
  'media',
  'header',
  'footer',
])

const referencedIds = (xml: string): Set<string> =>
  new Set([...xml.matchAll(/\sr:[A-Za-z]+="([^"]*)"/g)].map((m) => m[1]!))

/** drop what the main document no longer points at */
function tidyRels(pkg: ZipPackage, part: string): void {
  const used = referencedIds(readText(pkg, part) ?? '')
  writeRels(
    pkg,
    part,
    readRels(pkg, part).filter((r) => !BODY_KINDS.has(r.kind) || used.has(r.id)),
  )
  dropUnreachable(pkg)
}

/** the file with only the parts at these positions (0-based); returns the text it should hold */
export function keepParts(pkg: ZipPackage, keep: number[]): string {
  const body = readBody(pkg)
  const parts = partsOf(body)
  const kept = [...new Set(keep)].filter((i) => i >= 0 && i < parts.length).sort((x, y) => x - y)
  if (kept.length === 0) throw new DocxShapeError('nothing kept')
  const out: string[] = []
  let finalSectPr = body.sectPr
  let wanted = ''
  for (let k = 0; k < kept.length; k++) {
    const [a, b] = parts[kept[k]!]!
    const lastOfAll = k === kept.length - 1
    const lastOfRun = lastOfAll || kept[k + 1] !== kept[k]! + 1
    for (let i = a; i <= b; i++) {
      const child = body.children[i]!
      let xml = child.xml
      if (out.length === 0) xml = stripFirstPageBreak(xml.replace(BREAK_BEFORE, ''))
      if (lastOfAll && i === b) {
        if (hasSectionBreak(child)) {
          finalSectPr = paragraphSectPr(child)
          xml = xml.replace(finalSectPr, '')
        } else if (endsWithPageBreak(child)) xml = stripLastPageBreak(xml)
      }
      out.push(xml)
      wanted += textOf(child.xml)
    }
    if (lastOfAll) {
      if (!hasSectionBreak(body.children[b]!)) finalSectPr = sectPrRuling(body, b)
    } else if (lastOfRun && !hasSectionBreak(body.children[b]!)) {
      // the part's own section settings sit in a part that is left out: carry them along
      out.push('<w:p><w:pPr>' + sectPrRuling(body, b) + '</w:pPr></w:p>')
    }
  }
  writeText(pkg, body.part, body.head + out.join('') + finalSectPr + body.tail)
  tidyRels(pkg, body.part)
  return wanted
}

/** checks a part is still well-formed XML */
export function assertWellFormed(pkg: ZipPackage, part: string): void {
  const xml = readText(pkg, part)
  if (xml === null) return
  if (XMLValidator.validate(xml) !== true) throw new DocxShapeError('broken XML in ' + part)
}

/** the parts a join or a keep may have touched */
export function wordParts(pkg: ZipPackage): string[] {
  return pkg.order.filter((n) => /^word\/[^/]+\.xml$/.test(n))
}

// ------------------------------------------------------------------ joining

export interface DocxMergeNotes {
  /** style names both files define: the first file's look wins */
  sharedStyles: number
  /** comments not carried over */
  comments: number
}

const maxNumber = (xml: string, re: RegExp): number =>
  Math.max(0, ...[...xml.matchAll(re)].map((m) => Number(m[1]) || 0))

const escapeRe = (s: string): string => s.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')

/** the root element's start tag of a part */
const rootTag = (xml: string): RegExpExecArray | null => /<(?![?!])[\w:.-]+\b[^>]*>/.exec(xml)

/** add the namespace declarations (and ignorable prefixes) of 'from' that 'into' lacks */
function mergeNamespaces(into: string, from: string): string {
  const a = rootTag(into)
  const b = rootTag(from)
  if (!a || !b) return into
  let tag = a[0]
  for (const m of b[0].matchAll(/\sxmlns:([\w.-]+)="([^"]*)"/g)) {
    if (!new RegExp('\\sxmlns:' + escapeRe(m[1]!) + '=').test(tag)) {
      tag = tag.replace(/\s*(\/?)>$/, ' xmlns:' + m[1] + '="' + m[2] + '"$1>')
    }
  }
  const ignorable = /\smc:Ignorable="([^"]*)"/.exec(b[0])?.[1]
  if (ignorable) {
    const have = /\smc:Ignorable="([^"]*)"/.exec(tag)
    const list = new Set([...(have?.[1] ?? '').split(/\s+/), ...ignorable.split(/\s+/)])
    const declared = [...list].filter(
      (p) => p && new RegExp('\\sxmlns:' + escapeRe(p) + '=').test(tag),
    )
    if (have) tag = tag.replace(have[0], ' mc:Ignorable="' + declared.join(' ') + '"')
    else if (/\sxmlns:mc=/.test(tag)) {
      tag = tag.replace(/\s*(\/?)>$/, ' mc:Ignorable="' + declared.join(' ') + '"$1>')
    }
  }
  return into.slice(0, a.index) + tag + into.slice(a.index + a[0].length)
}

class Copier {
  /** other part -> base part, for parts copied in this join */
  private readonly renamed = new Map<string, string>()
  private readonly taken = new Set<string>()
  constructor(
    private readonly base: ZipPackage,
    private readonly other: ZipPackage,
  ) {}

  /** copy a part of the other file with everything it points at; returns its name in base */
  part(part: string): string {
    const done = this.renamed.get(part)
    if (done) return done
    const name = freshPartName(this.base, part, this.taken)
    this.taken.add(name)
    this.renamed.set(part, name)
    writeBytes(this.base, name, this.other.files.get(part) ?? new Uint8Array())
    const rels: Rel[] = []
    for (const rel of readRels(this.other, part)) {
      if (rel.external) rels.push(rel)
      else {
        const to = resolveTarget(part, rel.target)
        if (this.other.files.has(to)) {
          rels.push({ ...rel, target: relativeTarget(name, this.part(to)) })
        }
      }
    }
    if (rels.length > 0) writeRels(this.base, name, rels)
    declarePart(
      this.base,
      name,
      hasOverride(this.other, part) ? contentTypeOf(this.other, part) : null,
      defaultTypes(this.other),
    )
    return name
  }

  /**
   * point a fragment of fromPart (other) at relationships of toPart (base): each id it uses
   * gets a relationship in toPart, to a copy of the target
   */
  rels(fragment: string, fromPart: string, toPart: string): string {
    const used = referencedIds(fragment)
    if (used.size === 0) return fragment
    const source = new Map(readRels(this.other, fromPart).map((r) => [r.id, r]))
    const target = readRels(this.base, toPart)
    const map = new Map<string, string>()
    for (const id of used) {
      const rel = source.get(id)
      if (!rel) continue
      const to = rel.external
        ? rel.target
        : relativeTarget(toPart, this.part(resolveTarget(fromPart, rel.target)))
      const fresh = freshRelId(target)
      target.push({ ...rel, id: fresh, target: to })
      map.set(id, fresh)
    }
    writeRels(this.base, toPart, target)
    return fragment.replace(/(\sr:[A-Za-z]+=")([^"]*)"/g, (whole, head: string, id: string) => {
      const to = map.get(id)
      return to ? head + to + '"' : whole
    })
  }
}

/** the part of a given relationship kind of the main document */
function relatedPart(pkg: ZipPackage, main: string, kind: string): string | null {
  const rel = readRels(pkg, main).find((r) => r.kind === kind && !r.external)
  return rel ? resolveTarget(main, rel.target) : null
}

/** a whole part of the other file linked into base's main document (base had none of its kind) */
function linkWholePart(
  base: ZipPackage,
  baseMain: string,
  copier: Copier,
  otherPart: string,
  rel: Rel,
): void {
  const name = copier.part(otherPart)
  const rels = readRels(base, baseMain)
  rels.push({ ...rel, id: freshRelId(rels), target: relativeTarget(baseMain, name) })
  writeRels(base, baseMain, rels)
}

function styleElement(styles: string, id: string): string | null {
  const re = new RegExp(
    '<w:style\\b[^>]*w:styleId="' + escapeRe(id) + '"[^>]*>[\\s\\S]*?</w:style>',
  )
  return re.exec(styles)?.[0] ?? null
}

/** copy the styles the fragment uses that base lacks; returns the style elements added */
function bringStyles(
  base: ZipPackage,
  other: ZipPackage,
  baseMain: string,
  otherMain: string,
  copier: Copier,
  fragment: string,
  notes: DocxMergeNotes,
): string {
  const otherPart = relatedPart(other, otherMain, 'styles')
  if (!otherPart) return ''
  const basePart = relatedPart(base, baseMain, 'styles')
  if (!basePart) {
    linkWholePart(
      base,
      baseMain,
      copier,
      otherPart,
      readRels(other, otherMain).find((r) => r.kind === 'styles')!,
    )
    return ''
  }
  const theirs = readText(other, otherPart) ?? ''
  const ours = readText(base, basePart) ?? ''
  const wanted = [
    ...fragment.matchAll(/<w:(?:pStyle|rStyle|tblStyle|numStyle)\s+w:val="([^"]+)"/g),
  ].map((m) => m[1]!)
  const seen = new Set<string>()
  const added: string[] = []
  while (wanted.length > 0) {
    const id = wanted.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const mine = styleElement(theirs, id)
    if (!mine) continue
    const have = styleElement(ours, id)
    if (have) {
      if (have !== mine) notes.sharedStyles++
      continue
    }
    added.push(mine)
    for (const m of mine.matchAll(/<w:(?:basedOn|next|link)\s+w:val="([^"]+)"/g)) wanted.push(m[1]!)
  }
  if (added.length === 0) return ''
  writeText(
    base,
    basePart,
    mergeNamespaces(ours, theirs).replace('</w:styles>', added.join('') + '</w:styles>'),
  )
  return added.join('')
}

/** copy the lists the fragment uses; returns the fragment with their new numbers */
function bringNumbering(
  base: ZipPackage,
  other: ZipPackage,
  baseMain: string,
  otherMain: string,
  copier: Copier,
  fragment: string,
  addedStyles: string,
): string {
  const otherPart = relatedPart(other, otherMain, 'numbering')
  if (!otherPart) return fragment
  const baseStylesPart = relatedPart(base, baseMain, 'styles')
  const used = new Set([...fragment.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]!))
  // styles copied in this join may carry list numbers too
  for (const m of addedStyles.matchAll(/<w:numId\s+w:val="(\d+)"/g)) used.add(m[1]!)
  used.delete('0')
  if (used.size === 0) return fragment
  const basePart = relatedPart(base, baseMain, 'numbering')
  if (!basePart) {
    linkWholePart(
      base,
      baseMain,
      copier,
      otherPart,
      readRels(other, otherMain).find((r) => r.kind === 'numbering')!,
    )
    return fragment
  }
  const theirs = readText(other, otherPart) ?? ''
  let ours = readText(base, basePart) ?? ''
  let nextAbstract = maxNumber(ours, /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"/g)
  let nextNum = maxNumber(ours, /<w:num\b[^>]*w:numId="(\d+)"/g)
  const abstractMap = new Map<string, string>()
  const numMap = new Map<string, string>()
  const abstracts: string[] = []
  const nums: string[] = []
  for (const id of used) {
    const num = new RegExp('<w:num\\b[^>]*w:numId="' + id + '"[^>]*>[\\s\\S]*?</w:num>').exec(
      theirs,
    )?.[0]
    const abs = num ? /<w:abstractNumId\s+w:val="(\d+)"/.exec(num)?.[1] : undefined
    if (!num || abs === undefined) continue
    if (!abstractMap.has(abs)) {
      const el = new RegExp(
        '<w:abstractNum\\b[^>]*w:abstractNumId="' + abs + '"[^>]*>[\\s\\S]*?</w:abstractNum>',
      ).exec(theirs)?.[0]
      if (!el) continue
      const fresh = String(++nextAbstract)
      abstractMap.set(abs, fresh)
      const nsid = Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .toUpperCase()
        .padStart(8, '0')
      abstracts.push(
        el
          .replace(/(w:abstractNumId=")\d+"/, '$1' + fresh + '"')
          .replace(/<w:nsid\s+w:val="[0-9A-Fa-f]+"\s*\/>/, '<w:nsid w:val="' + nsid + '"/>'),
      )
    }
    const fresh = String(++nextNum)
    numMap.set(id, fresh)
    nums.push(
      num
        .replace(/(<w:num\b[^>]*w:numId=")\d+"/, '$1' + fresh + '"')
        .replace(/(<w:abstractNumId\s+w:val=")\d+"/, '$1' + abstractMap.get(abs) + '"'),
    )
  }
  ours = mergeNamespaces(ours, theirs)
  const firstNum = ours.search(/<w:num\b/)
  ours =
    firstNum >= 0
      ? ours.slice(0, firstNum) + abstracts.join('') + ours.slice(firstNum)
      : ours.replace('</w:numbering>', abstracts.join('') + '</w:numbering>')
  const cleanup = ours.search(/<w:numIdMacAtCleanup\b/)
  ours =
    cleanup >= 0
      ? ours.slice(0, cleanup) + nums.join('') + ours.slice(cleanup)
      : ours.replace('</w:numbering>', nums.join('') + '</w:numbering>')
  writeText(base, basePart, ours)
  const renumber = (xml: string): string =>
    xml.replace(/(<w:numId\s+w:val=")(\d+)"/g, (whole, head: string, id: string) => {
      const to = numMap.get(id)
      return to ? head + to + '"' : whole
    })
  if (baseStylesPart && addedStyles) {
    const styles = readText(base, baseStylesPart) ?? ''
    writeText(
      base,
      baseStylesPart,
      styles.replace(addedStyles, () => renumber(addedStyles)),
    )
  }
  return renumber(fragment)
}

/** copy the footnotes (or endnotes) the fragment refers to; returns it with their new ids */
function bringNotes(
  base: ZipPackage,
  other: ZipPackage,
  baseMain: string,
  otherMain: string,
  copier: Copier,
  fragment: string,
  kind: 'footnote' | 'endnote',
): string {
  const refRe = new RegExp('<w:' + kind + 'Reference\\b[^>]*w:id="(-?\\d+)"', 'g')
  const used = [...new Set([...fragment.matchAll(refRe)].map((m) => m[1]!))]
  if (used.length === 0) return fragment
  const relKind = kind + 's'
  const otherPart = relatedPart(other, otherMain, relKind)
  if (!otherPart) return fragment
  const basePart = relatedPart(base, baseMain, relKind)
  if (!basePart) {
    linkWholePart(
      base,
      baseMain,
      copier,
      otherPart,
      readRels(other, otherMain).find((r) => r.kind === relKind)!,
    )
    return fragment
  }
  const theirs = readText(other, otherPart) ?? ''
  let next = maxNumber(
    readText(base, basePart) ?? '',
    new RegExp('<w:' + kind + '\\b[^>]*w:id="(\\d+)"', 'g'),
  )
  const map = new Map<string, string>()
  const added: string[] = []
  for (const id of used) {
    const el = new RegExp(
      '<w:' + kind + '\\b[^>]*w:id="' + id + '"[^>]*>[\\s\\S]*?</w:' + kind + '>',
    ).exec(theirs)?.[0]
    if (!el) continue
    const fresh = String(++next)
    map.set(id, fresh)
    added.push(copier.rels(el.replace(/(w:id=")-?\d+"/, '$1' + fresh + '"'), otherPart, basePart))
  }
  const ours = readText(base, basePart) ?? ''
  writeText(
    base,
    basePart,
    mergeNamespaces(ours, theirs).replace(
      '</w:' + kind + 's>',
      added.join('') + '</w:' + kind + 's>',
    ),
  )
  return fragment.replace(
    new RegExp('(<w:' + kind + 'Reference\\b[^>]*w:id=")(-?\\d+)"', 'g'),
    (whole, head: string, id: string) => {
      const to = map.get(id)
      return to ? head + to + '"' : whole
    },
  )
}

/** a section that starts on a new page */
const startOnNewPage = (sectPr: string): string =>
  sectPr.replace(/<w:type\s+w:val="[^"]*"\s*\/>/, '<w:type w:val="nextPage"/>')

/** append the other file's body to base's as new sections (base is changed in place) */
export function appendDocx(base: ZipPackage, other: ZipPackage, notes: DocxMergeNotes): void {
  const a = readBody(base)
  const b = readBody(other)
  const copier = new Copier(base, other)
  let fragment = b.children.map((c) => c.xml).join('')
  let finalSectPr = b.sectPr
  // the joined file starts on a new page
  const firstBreak = b.children.findIndex(hasSectionBreak)
  if (firstBreak >= 0) {
    const s = paragraphSectPr(b.children[firstBreak]!)
    fragment = fragment.replace(s, startOnNewPage(s))
  } else finalSectPr = startOnNewPage(finalSectPr)
  // comments stay behind: their markers go
  notes.comments += (fragment.match(/<w:commentReference\b/g) ?? []).length
  fragment = fragment.replace(/<w:comment(?:RangeStart|RangeEnd|Reference)\b[^>]*\/>/g, '')
  // ids that must stay unique in one document
  fragment = fragment.replace(/\sw14:(?:paraId|textId)="[^"]*"/g, '')
  const baseXml = readText(base, a.part) ?? ''
  const bookmarkBase = maxNumber(baseXml, /<w:bookmark(?:Start|End)\b[^>]*w:id="(\d+)"/g) + 1
  fragment = fragment.replace(
    /(<w:bookmark(?:Start|End)\b[^>]*w:id=")(\d+)"/g,
    (_w, head: string, id: string) => head + (Number(id) + bookmarkBase) + '"',
  )
  fragment = fragment.replace(/<w:bookmarkStart\b[^>]*w:name="_GoBack"[^>]*\/>/g, '')
  const docPrBase = maxNumber(baseXml, /<wp:docPr\b[^>]*\sid="(\d+)"/g)
  fragment = fragment.replace(
    /(<wp:docPr\b[^>]*\sid=")(\d+)"/g,
    (_w, head: string, id: string) => head + (Number(id) + docPrBase) + '"',
  )
  // what the text points at
  const SECT = '<!--ttok-final-section-->'
  fragment = copier.rels(fragment + SECT + finalSectPr, b.part, a.part)
  const addedStyles = bringStyles(base, other, a.part, b.part, copier, fragment, notes)
  fragment = bringNumbering(base, other, a.part, b.part, copier, fragment, addedStyles)
  fragment = bringNotes(base, other, a.part, b.part, copier, fragment, 'footnote')
  fragment = bringNotes(base, other, a.part, b.part, copier, fragment, 'endnote')
  const at = fragment.indexOf(SECT)
  const body = fragment.slice(0, at)
  const lastSect = fragment.slice(at + SECT.length)
  const end = '</w:body></w:document>'
  const head = mergeNamespaces(a.head + end, b.head + end)
  const now = readBody(base)
  writeText(
    base,
    a.part,
    head.slice(0, head.length - end.length) +
      now.children.map((c) => c.xml).join('') +
      '<w:p><w:pPr>' +
      now.sectPr +
      '</w:pPr></w:p>' +
      body +
      lastSect +
      now.tail,
  )
}

export function docxText(pkg: ZipPackage): string {
  return readBody(pkg)
    .children.map((c) => textOf(c.xml))
    .join('')
}
