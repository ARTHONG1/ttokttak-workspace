import { posix } from 'node:path'
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
  xmlAttr,
  xmlEscape,
  xmlUnescape,
  type Rel,
} from './opc'
import { readText, writeBytes, writeText, type ZipPackage } from './zip'

/**
 * 똑딱정리 for PowerPoint files, slide by slide. Keeping some slides drops the others from the
 * slide list and then every part only they reached (their notes, pictures, charts), so the
 * file stays a normal deck. Joining decks copies each later deck's slides with everything they
 * stand on (layouts, masters, themes, pictures, charts, notes) under fresh part names, so each
 * slide keeps its own look.
 */

const PRESENTATION = 'ppt/presentation.xml'
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'

export class PptxShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PptxShapeError'
  }
}

export interface SlideRef {
  /** the p:sldId id */
  id: number
  rid: string
  part: string
}

function presentationXml(pkg: ZipPackage): string {
  const xml = readText(pkg, PRESENTATION)
  if (!xml) throw new PptxShapeError('no presentation part')
  return xml
}

export function slidesOf(pkg: ZipPackage): SlideRef[] {
  const xml = presentationXml(pkg)
  const rels = new Map(readRels(pkg, PRESENTATION).map((r) => [r.id, r]))
  const list = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(xml)?.[1] ?? ''
  const out: SlideRef[] = []
  for (const m of list.matchAll(/<p:sldId\b[^>]*\/>/g)) {
    const id = Number(xmlAttr(m[0], 'id'))
    const rid = xmlAttr(m[0], 'r:id')
    const rel = rid ? rels.get(rid) : undefined
    if (!rid || !rel || !Number.isFinite(id)) throw new PptxShapeError('a slide without its part')
    out.push({ id, rid, part: resolveTarget(PRESENTATION, rel.target) })
  }
  return out
}

/** the words on a slide, in order, for the picker */
export function slideText(pkg: ZipPackage, part: string): string {
  const xml = readText(pkg, part) ?? ''
  return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
    .map((m) => xmlUnescape(m[1]!))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function setSlideCount(pkg: ZipPackage, count: number): void {
  const app = readText(pkg, 'docProps/app.xml')
  if (app && /<Slides>\d+<\/Slides>/.test(app)) {
    writeText(
      pkg,
      'docProps/app.xml',
      app.replace(/<Slides>\d+<\/Slides>/, '<Slides>' + count + '</Slides>'),
    )
  }
}

/** the deck with only the slides at these positions (0-based), in their order */
export function keepSlides(pkg: ZipPackage, keep: number[]): void {
  const slides = slidesOf(pkg)
  const kept = new Set(keep)
  const dropped = slides.filter((_, i) => !kept.has(i))
  if (dropped.length === 0) return
  if (dropped.length === slides.length) throw new PptxShapeError('no slide left')
  const goneIds = new Set(dropped.map((s) => String(s.id)))
  const goneRids = new Set(dropped.map((s) => s.rid))
  let xml = presentationXml(pkg)
  xml = xml.replace(/<p:sldId\b[^>]*\/>/g, (el) =>
    goneRids.has(xmlAttr(el, 'r:id') ?? '') ? '' : el,
  )
  // sections and custom shows name slides too
  xml = xml.replace(/<p14:sldId\b[^>]*\/>/g, (el) =>
    goneIds.has(xmlAttr(el, 'id') ?? '') ? '' : el,
  )
  xml = xml.replace(/<p:sld\b[^>]*\/>/g, (el) =>
    goneRids.has(xmlAttr(el, 'r:id') ?? '') ? '' : el,
  )
  writeText(pkg, PRESENTATION, xml)
  writeRels(
    pkg,
    PRESENTATION,
    readRels(pkg, PRESENTATION).filter((r) => !goneRids.has(r.id)),
  )
  dropUnreachable(pkg)
  setSlideCount(pkg, slides.length - dropped.length)
}

/** the slide size a deck declares, as 'cx x cy' */
export function slideSizeOf(pkg: ZipPackage): string {
  const el = /<p:sldSz\b[^>]*\/>/.exec(presentationXml(pkg))?.[0] ?? ''
  return (xmlAttr(el, 'cx') ?? '?') + 'x' + (xmlAttr(el, 'cy') ?? '?')
}

const isCommentRel = (r: Rel): boolean =>
  r.kind === 'comments' || r.kind === 'commentAuthors' || r.kind === 'authors'

function notesMasterOf(pkg: ZipPackage): string | null {
  const rel = readRels(pkg, PRESENTATION).find((r) => r.kind === 'notesMaster')
  return rel ? resolveTarget(PRESENTATION, rel.target) : null
}

/** the highest id among the masters and their layouts (they share one number space) */
function maxMasterId(pkg: ZipPackage): number {
  let max = 2147483647
  const xml = presentationXml(pkg)
  for (const m of xml.matchAll(/<p:sldMasterId\b[^>]*\/>/g))
    max = Math.max(max, Number(xmlAttr(m[0], 'id')) || 0)
  for (const rel of readRels(pkg, PRESENTATION)) {
    if (rel.kind !== 'slideMaster') continue
    const master = readText(pkg, resolveTarget(PRESENTATION, rel.target)) ?? ''
    for (const m of master.matchAll(/<p:sldLayoutId\b[^>]*\/>/g)) {
      max = Math.max(max, Number(xmlAttr(m[0], 'id')) || 0)
    }
  }
  return max
}

export interface MergeNotes {
  /** later decks whose slide size differs from the first deck's */
  otherSize: number
  /** comments not carried over */
  comments: number
}

/** append every slide of 'other' to 'base' (base is changed in place) */
export function appendDeck(
  base: ZipPackage,
  other: ZipPackage,
  label: string,
  notes: MergeNotes,
): void {
  if (slideSizeOf(base) !== slideSizeOf(other)) notes.otherSize++
  const slides = slidesOf(other)
  const baseNotesMaster = notesMasterOf(base)
  // every part the slides stand on
  const parts: string[] = []
  const seen = new Set<string>()
  const queue = slides.map((s) => s.part)
  while (queue.length > 0) {
    const part = queue.shift()!
    if (seen.has(part) || !other.files.has(part)) continue
    seen.add(part)
    parts.push(part)
    for (const rel of readRels(other, part)) {
      if (rel.external || isCommentRel(rel)) continue
      if (rel.kind === 'notesMaster' && baseNotesMaster) continue
      queue.push(resolveTarget(part, rel.target))
    }
  }
  const taken = new Set<string>()
  const renamed = new Map<string, string>()
  for (const part of parts) {
    const name = freshPartName(base, part, taken)
    taken.add(name)
    renamed.set(part, name)
  }
  let nextMasterId = maxMasterId(base)
  const newMasters: string[] = []
  let otherNotesMaster: string | null = null
  for (const part of parts) {
    const name = renamed.get(part)!
    let bytes = other.files.get(part)!
    const rels = readRels(other, part)
    if (/^ppt\/slideMasters\/[^/]+\.xml$/.test(part)) {
      newMasters.push(name)
      const xml = new TextDecoder()
        .decode(bytes)
        .replace(
          /(<p:sldLayoutId\b[^>]*\bid=")(\d+)"/g,
          (_m, head: string) => head + ++nextMasterId + '"',
        )
      bytes = new TextEncoder().encode(xml)
    }
    if (/^ppt\/notesMasters\/[^/]+\.xml$/.test(part)) otherNotesMaster = name
    if (/^ppt\/slides\/[^/]+\.xml$/.test(part) && rels.some(isCommentRel)) {
      notes.comments += rels.filter(isCommentRel).length
      const xml = new TextDecoder().decode(bytes).replace(/<(\w+):commentRel\b[^>]*\/>/g, '')
      bytes = new TextEncoder().encode(xml)
    }
    writeBytes(base, name, bytes)
    const out: Rel[] = []
    for (const rel of rels) {
      if (isCommentRel(rel)) continue
      if (rel.external) {
        out.push(rel)
        continue
      }
      const target = resolveTarget(part, rel.target)
      const to =
        rel.kind === 'notesMaster' && baseNotesMaster ? baseNotesMaster : renamed.get(target)
      if (!to) continue
      out.push({ ...rel, target: relativeTarget(name, to) })
    }
    if (out.length > 0 || readRels(other, part).length > 0) writeRels(base, name, out)
    const type = hasOverride(other, part) ? contentTypeOf(other, part) : null
    declarePart(base, name, type, defaultTypes(other))
  }
  // the presentation: masters, notes master, slides, and a section when the deck has sections
  let xml = presentationXml(base)
  const presRels = readRels(base, PRESENTATION)
  const used = new Set<string>()
  const addRel = (kind: string, to: string): string => {
    const id = freshRelId(presRels, used)
    used.add(id)
    presRels.push({
      id,
      kind,
      type: REL_BASE + kind,
      target: relativeTarget(PRESENTATION, to),
      external: false,
    })
    return id
  }
  const masterEls = newMasters
    .map(
      (m) => '<p:sldMasterId id="' + ++nextMasterId + '" r:id="' + addRel('slideMaster', m) + '"/>',
    )
    .join('')
  xml = xml.replace('</p:sldMasterIdLst>', masterEls + '</p:sldMasterIdLst>')
  if (!baseNotesMaster && otherNotesMaster) {
    const el =
      '<p:notesMasterIdLst><p:notesMasterId r:id="' +
      addRel('notesMaster', otherNotesMaster) +
      '"/></p:notesMasterIdLst>'
    xml = xml.replace(/(<\/p:sldMasterIdLst>)/, '$1' + el)
  }
  let nextSlideId = Math.max(
    255,
    ...[...xml.matchAll(/<p:sldId\b[^>]*\/>/g)].map((m) => Number(xmlAttr(m[0], 'id')) || 0),
  )
  const ids: number[] = []
  const slideEls = slides
    .map((s) => {
      const id = ++nextSlideId
      ids.push(id)
      return '<p:sldId id="' + id + '" r:id="' + addRel('slide', renamed.get(s.part)!) + '"/>'
    })
    .join('')
  if (xml.includes('</p:sldIdLst>')) xml = xml.replace('</p:sldIdLst>', slideEls + '</p:sldIdLst>')
  else if (/<p:sldIdLst\s*\/>/.test(xml))
    xml = xml.replace(/<p:sldIdLst\s*\/>/, '<p:sldIdLst>' + slideEls + '</p:sldIdLst>')
  else xml = xml.replace(/<p:sldSz\b/, '<p:sldIdLst>' + slideEls + '</p:sldIdLst><p:sldSz')
  if (xml.includes('</p14:sectionLst>')) {
    const guid = '{' + crypto.randomUUID().toUpperCase() + '}'
    const section =
      '<p14:section name="' +
      xmlEscape(label) +
      '" id="' +
      guid +
      '"><p14:sldIdLst>' +
      ids.map((id) => '<p14:sldId id="' + id + '"/>').join('') +
      '</p14:sldIdLst></p14:section>'
    xml = xml.replace('</p14:sectionLst>', section + '</p14:sectionLst>')
  }
  writeText(base, PRESENTATION, xml)
  writeRels(base, PRESENTATION, presRels)
  setSlideCount(base, slidesOf(base).length)
}

/** every internal relationship points at a part the package has */
export function danglingRels(pkg: ZipPackage): string[] {
  const out: string[] = []
  for (const name of pkg.order) {
    const m = /^(.*?)_rels\/([^/]+)\.rels$/.exec(name)
    if (!m) continue
    const owner = (m[1] ?? '') + m[2]
    for (const rel of readRels(pkg, owner === '' ? '' : owner)) {
      if (rel.external) continue
      const to = resolveTarget(owner, rel.target)
      if (!pkg.files.has(to)) out.push(owner + ' -> ' + to)
    }
  }
  return out
}

export const pptxPartDir = (part: string): string => posix.dirname(part)
