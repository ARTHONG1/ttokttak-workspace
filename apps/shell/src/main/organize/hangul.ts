import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { loadRhwpEngine } from '@genoffice/file-parse'
import { openHwp, writeContainer } from '../../../../hwp/src/main/hwp5-file'
import { readImageInfo } from '../../../../pdf/src/main/images-to-pdf'
import { shrinkPicture, type PictureRecoder } from './pictures'
import { readText, readZip, writeBytes, writeText, writeZip, type ZipPackage } from './zip'

/**
 * 똑딱정리 for Hangul documents (HWP and HWPX), through the engine the Hangul editor runs.
 * Pages are taken out the way a person would select them and press Delete, from the end of
 * the paragraph before the page to the end of its last paragraph, so the rest keeps its own
 * paragraph settings. Every result is opened again and its pages' text compared with the
 * original's; one that reads differently, or whose paper settings moved, is not handed out.
 */

export class HangulOrganizeError extends Error {
  constructor(
    readonly reason:
      'password' | 'unreadable' | 'mismatch' | 'joined' | 'sections' | 'whole-section' | 'nothing',
    readonly page?: number,
  ) {
    super('hangul organize: ' + reason)
    this.name = 'HangulOrganizeError'
  }
}

type Engine = Awaited<ReturnType<typeof loadRhwpEngine>>
type Doc = InstanceType<Engine['HwpDocument']>

interface PagePos {
  sec: number
  para: number
  charOffset: number
}

async function open(bytes: Uint8Array): Promise<Doc> {
  const { HwpDocument } = await loadRhwpEngine()
  try {
    return new HwpDocument(new Uint8Array(bytes))
  } catch (err) {
    throw new HangulOrganizeError(/password|encrypt/i.test(String(err)) ? 'password' : 'unreadable')
  }
}

const pageText = (doc: Doc, page: number): string => {
  const raw = doc.getPageText(page)
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : raw
  } catch {
    return raw
  }
}

const squeeze = (text: string): string => text.replace(/\s+/g, '')

function positions(doc: Doc): PagePos[] {
  const n = doc.pageCount()
  const out: PagePos[] = []
  // getPositionOfPage names the paragraph a page starts in, never how far into it: a page
  // whose first line is the rest of a paragraph begun on the page before read as a clean
  // one, was cut, and only the text check refused it, with a vague "differs". The caret
  // starts (the editor's MovePage) say where the page really begins.
  let carets: { para?: number; pos?: number }[]
  try {
    carets = JSON.parse(doc.getPageCaretStarts()) as { para?: number; pos?: number }[]
  } catch {
    carets = []
  }
  for (let p = 0; p < n; p++) {
    const pos = JSON.parse(doc.getPositionOfPage(p)) as Partial<PagePos> & { ok?: boolean }
    const sec = pos.sec ?? 0
    const para = pos.para ?? 0
    let charOffset = pos.charOffset ?? 0
    const caret = carets[p]
    if (p > 0 && charOffset === 0 && caret?.para === para && (caret.pos ?? 0) > 0) {
      try {
        // the caret counts inline controls too: only text before it on the page before counts
        const before = doc.logicalToTextOffset(sec, para, caret.pos!)
        if (before > 0 && before < doc.getParagraphLength(sec, para)) charOffset = before
      } catch {
        // an engine without the conversion: the paragraph start stands
      }
    }
    out.push({ sec, para, charOffset })
  }
  return out
}

function exportAs(doc: Doc, format: 'hwp' | 'hwpx'): Uint8Array {
  const made = format === 'hwpx' ? doc.exportHwpxWithReport() : doc.exportHwpWithReport()
  try {
    return made.takeBytes()
  } finally {
    made.free()
  }
}

export interface HangulPage {
  text: string
  /** the page starts inside a paragraph or table of the page before */
  joined: boolean
}

export async function hangulPages(bytes: Uint8Array): Promise<HangulPage[]> {
  const doc = await open(bytes)
  try {
    return positions(doc).map((pos, p) => ({
      text: pageText(doc, p).replace(/\s+/g, ' ').trim(),
      joined: pos.charOffset > 0,
    }))
  } finally {
    doc.free()
  }
}

export async function hangulPageSvg(bytes: Uint8Array, page: number): Promise<string | null> {
  const doc = await open(bytes)
  try {
    if (page < 0 || page >= doc.pageCount()) return null
    const svg = doc.renderPageSvg(page)
    return svg.trimStart().startsWith('<svg') ? svg : null
  } finally {
    doc.free()
  }
}

/** consecutive pages as [first, last] runs */
export function runsOf(pages: number[]): [number, number][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last && last[1] === p - 1) last[1] = p
    else out.push([p, p])
  }
  return out
}

/** take the pages [a, b] out of the open document (positions are the original's) */
function deleteRun(doc: Doc, pos: PagePos[], a: number, b: number): void {
  const s = pos[a]!
  const e = pos[b + 1]
  if (s.charOffset > 0) throw new HangulOrganizeError('joined', a)
  if (e && e.charOffset > 0) throw new HangulOrganizeError('joined', b + 1)
  const count = doc.getParagraphCount(s.sec)
  let endPara: number
  if (!e) {
    if (s.sec !== doc.getSectionCount() - 1) throw new HangulOrganizeError('sections', a)
    endPara = count
  } else if (e.sec === s.sec) endPara = e.para
  else if (e.sec === s.sec + 1 && e.para === 0) endPara = count
  else throw new HangulOrganizeError('sections', a)
  if (endPara <= s.para) throw new HangulOrganizeError('joined', a)
  const last = endPara - 1
  if (s.para > 0) {
    const before = s.para - 1
    doc.deleteRange(
      s.sec,
      before,
      doc.getParagraphLength(s.sec, before),
      last,
      doc.getParagraphLength(s.sec, last),
    )
  } else {
    // the first paragraph of a section holds its settings (paper, columns): it stays, and the
    // first paragraph after the pages moves up into it, keeping that paragraph's own shape
    if (endPara === count) throw new HangulOrganizeError('whole-section', a)
    const starts = JSON.parse(doc.getPageCaretStarts()) as {
      list: number
      para: number
      pos: number
    }[]
    const caret = starts[a]
    const from = caret && caret.para === 0 ? caret.pos : 0
    const shape = (JSON.parse(doc.getParaPropertiesAt(s.sec, endPara)) as { paraShapeId?: number })
      .paraShapeId
    doc.deleteRange(s.sec, 0, from, endPara, 0)
    if (typeof shape === 'number') doc.setParaShapeId(s.sec, 0, shape)
  }
}

export interface HangulResult {
  bytes: Uint8Array
  pages: number
  warnings: string[]
}

const pageDefs = (doc: Doc): string[] =>
  Array.from({ length: doc.getSectionCount() }, (_, s) => doc.getPageDef(s))

/** check a result: the kept pages' text, the sections and their paper */
async function verify(
  result: Uint8Array,
  want: string,
  sections: number,
  defs: string[] | null,
): Promise<number> {
  const back = await open(result).catch(() => {
    throw new HangulOrganizeError('mismatch')
  })
  try {
    const n = back.pageCount()
    const got = squeeze(Array.from({ length: n }, (_, p) => pageText(back, p)).join(''))
    if (got !== squeeze(want)) throw new HangulOrganizeError('mismatch')
    if (back.getSectionCount() !== sections) throw new HangulOrganizeError('mismatch')
    if (defs && pageDefs(back).join('|') !== defs.join('|'))
      throw new HangulOrganizeError('mismatch')
    return n
  } finally {
    back.free()
  }
}

/** the document with only the given pages (0-based), in the original's format */
export async function keepHangulPages(
  bytes: Uint8Array,
  format: 'hwp' | 'hwpx',
  keep: number[],
): Promise<HangulResult> {
  const doc = await open(bytes)
  try {
    const pos = positions(doc)
    const n = pos.length
    const kept = new Set(keep.filter((p) => p >= 0 && p < n))
    if (kept.size === 0) throw new HangulOrganizeError('nothing')
    const gone = Array.from({ length: n }, (_, p) => p).filter((p) => !kept.has(p))
    const texts = Array.from({ length: n }, (_, p) => pageText(doc, p))
    const sections = doc.getSectionCount()
    const defs = pageDefs(doc)
    // a run that crosses into another section is taken out section by section
    const runs: [number, number][] = []
    for (const [a, b] of runsOf(gone)) {
      let start = a
      for (let p = a + 1; p <= b; p++) {
        if (pos[p]!.sec !== pos[p - 1]!.sec) {
          runs.push([start, p - 1])
          start = p
        }
      }
      runs.push([start, b])
    }
    for (const [a, b] of runs.reverse()) deleteRun(doc, pos, a, b)
    const out = exportAs(doc, format)
    const want = texts.filter((_, p) => kept.has(p)).join('')
    const pages = await verify(out, want, sections, defs)
    const warnings: string[] = []
    if (pages !== kept.size) {
      warnings.push(
        '쪽 수가 ' +
          kept.size +
          '쪽이 아니라 ' +
          pages +
          '쪽이에요. 쪽 사이가 달라졌는지 확인해 주세요.',
      )
    }
    return { bytes: out, pages, warnings }
  } finally {
    doc.free()
  }
}

export async function hangulPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await open(bytes)
  try {
    return doc.pageCount()
  } finally {
    doc.free()
  }
}

// ------------------------------------------------------------------ pictures

/** the pictures stored in an HWPX (BinData/), shrunk; the document checked again after */
export async function shrinkHangul(
  bytes: Uint8Array,
  format: 'hwp' | 'hwpx',
  recode: PictureRecoder,
  onPicture: (done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; recoded: number }> {
  const doc = await open(bytes)
  const before = { pages: doc.pageCount(), text: squeeze(doc.getTextFileText()) }
  doc.free()
  let out: Uint8Array
  let recoded = 0
  if (format === 'hwpx') {
    const pkg = await readZip(bytes)
    const names = pkg.order.filter((n) => /^BinData\/[^/]+\.(?:jpe?g|png)$/i.test(n))
    for (const [i, name] of names.entries()) {
      const made = await shrinkPicture(pkg.files.get(name)!, recode)
      if (made) {
        writeBytes(pkg, name, made)
        recoded++
      }
      onPicture(i + 1, names.length)
    }
    if (recoded === 0) return { bytes, recoded }
    out = await writeZip(pkg)
  } else {
    const opened = openHwp(bytes)
    if (!opened) throw new HangulOrganizeError('unreadable')
    const paths = opened.cfb.FullPaths.map((p, i) => ({ p, e: opened.cfb.FileIndex[i]! })).filter(
      ({ p, e }) => e.type === 2 && /\/BinData\/[^/]+$/i.test(p),
    )
    for (const [i, { e }] of paths.entries()) {
      const raw = Buffer.from((e.content ?? []) as Uint8Array)
      let picture: Buffer = raw
      let deflated = false
      if (!readImageInfo(raw)) {
        try {
          picture = inflateRawSync(raw)
          deflated = true
        } catch {
          onPicture(i + 1, paths.length)
          continue
        }
      }
      const made = readImageInfo(picture) ? await shrinkPicture(picture, recode) : null
      if (made) {
        const content = deflated ? deflateRawSync(made) : Buffer.from(made)
        e.content = content
        e.size = content.length
        recoded++
      }
      onPicture(i + 1, paths.length)
    }
    if (recoded === 0) return { bytes, recoded }
    out = new Uint8Array(writeContainer(opened.cfb))
  }
  const back = await open(out).catch(() => {
    throw new HangulOrganizeError('mismatch')
  })
  try {
    if (back.pageCount() !== before.pages || squeeze(back.getTextFileText()) !== before.text) {
      throw new HangulOrganizeError('mismatch')
    }
  } finally {
    back.free()
  }
  return { bytes: out, recoded }
}

// ------------------------------------------------------------------ joining

const LISTS: [string, string][] = [
  ['borderFills', 'borderFill'],
  ['charProperties', 'charPr'],
  ['tabProperties', 'tabPr'],
  ['numberings', 'numbering'],
  ['bullets', 'bullet'],
  ['paraProperties', 'paraPr'],
  ['styles', 'style'],
  ['memoProperties', 'memoPr'],
]
const REF: Record<string, string> = {
  charPrIDRef: 'charPr',
  paraPrIDRef: 'paraPr',
  styleIDRef: 'style',
  nextStyleIDRef: 'style',
  borderFillIDRef: 'borderFill',
  tabPrIDRef: 'tabPr',
  memoShapeIDRef: 'memoPr',
  outlineShapeIDRef: 'numbering',
}
const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER']
const FONT_ATTR: Record<string, string> = {
  hangul: 'HANGUL',
  latin: 'LATIN',
  hanja: 'HANJA',
  japanese: 'JAPANESE',
  other: 'OTHER',
  symbol: 'SYMBOL',
  user: 'USER',
}

function block(h: string, cont: string): RegExpExecArray | null {
  return new RegExp('<hh:' + cont + '\\b[^>]*?(/>|>([\\s\\S]*?)</hh:' + cont + '>)').exec(h)
}

function items(h: string, cont: string, tag: string): string[] {
  const m = block(h, cont)
  if (!m || m[2] === undefined) return []
  return [
    ...m[2].matchAll(
      new RegExp('<hh:' + tag + '\\b[^>]*?(?:/>|>[\\s\\S]*?</hh:' + tag + '>)', 'g'),
    ),
  ].map((x) => x[0])
}

const itemId = (x: string): number => Number(/\bid="(\d+)"/.exec(x)?.[1] ?? 0)

function fontItems(h: string, lang: string): string[] {
  const m = new RegExp('<hh:fontface lang="' + lang + '"[^>]*>([\\s\\S]*?)</hh:fontface>').exec(h)
  return m
    ? [...m[1]!.matchAll(/<hh:font\b[^>]*?(?:\/>|>[\s\S]*?<\/hh:font>)/g)].map((x) => x[0])
    : []
}

const setId = (x: string, id: number): string => x.replace(/\bid="\d+"/, 'id="' + id + '"')

function remapRefs(
  x: string,
  off: Record<string, number>,
  fontOff: Record<string, number>,
  binMap: Map<string, string>,
): string {
  x = x.replace(
    new RegExp('\\b(' + Object.keys(REF).join('|') + ')="(\\d+)"', 'g'),
    (whole, a: string, v: string) => {
      const n = Number(v)
      if (n >= 0xffffffff) return whole
      return a + '="' + (n + (off[REF[a]!] ?? 0)) + '"'
    },
  )
  x = x.replace(
    /(<hh:heading\b[^>]*?type=")(\w+)("[^>]*?idRef=")(\d+)(")/g,
    (whole, a: string, type: string, b: string, v: string, c: string) =>
      type === 'NUMBER' || type === 'BULLET'
        ? a + type + b + (Number(v) + (off[type === 'BULLET' ? 'bullet' : 'numbering'] ?? 0)) + c
        : whole,
  )
  x = x.replace(
    /<hh:fontRef\b([^>]*)/g,
    (_w, attrs: string) =>
      '<hh:fontRef' +
      attrs.replace(
        /\b(hangul|latin|hanja|japanese|other|symbol|user)="(\d+)"/g,
        (_a, lang: string, v: string) =>
          lang + '="' + (Number(v) + (fontOff[FONT_ATTR[lang]!] ?? 0)) + '"',
      ),
  )
  return x.replace(
    /\bbinaryItemIDRef="([^"]+)"/g,
    (_w, id: string) => 'binaryItemIDRef="' + (binMap.get(id) ?? id) + '"',
  )
}

function appendItems(h: string, cont: string, tag: string, add: string[]): string {
  let m = block(h, cont)
  if (!m) {
    h = h.replace('</hh:refList>', '<hh:' + cont + ' itemCnt="0"></hh:' + cont + '></hh:refList>')
    m = block(h, cont)
    if (!m) return h
  }
  if (m[2] === undefined) {
    const open = m[0].replace(/\/>$/, '>') + '</hh:' + cont + '>'
    h = h.slice(0, m.index) + open + h.slice(m.index + m[0].length)
    m = block(h, cont)!
  }
  const count = items(h, cont, tag).length + add.length
  const end = m.index + m[0].length - ('</hh:' + cont + '>').length
  h = h.slice(0, end) + add.join('') + h.slice(end)
  return h.replace(new RegExp('(<hh:' + cont + '\\b[^>]*?itemCnt=")\\d+(")'), '$1' + count + '$2')
}

const sectionNames = (pkg: ZipPackage): string[] =>
  pkg.order
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))

/** append the sections of other HWPX packages to base's, each keeping its own look */
export function appendHwpx(base: ZipPackage, adds: ZipPackage[]): void {
  let h = readText(base, 'Contents/header.xml') ?? ''
  let hpf = readText(base, 'Contents/content.hpf') ?? ''
  if (!h || !hpf) throw new HangulOrganizeError('unreadable')
  let nsec = sectionNames(base).length
  for (const src of adds) {
    const sh = readText(src, 'Contents/header.xml') ?? ''
    const shpf = readText(src, 'Contents/content.hpf') ?? ''
    const off: Record<string, number> = {}
    // continue each list right after the existing one: the engine reads some ids as positions
    for (const [cont, tag] of LISTS) {
      const have = items(h, cont, tag)
      const mine = items(sh, cont, tag)
      const first = mine.length ? Math.min(...mine.map(itemId)) : 0
      off[tag] = (have.length ? Math.max(...have.map(itemId)) + 1 : first) - first
    }
    const fontOff: Record<string, number> = {}
    for (const lang of LANGS) {
      const have = fontItems(h, lang)
      const mine = fontItems(sh, lang)
      const first = mine.length ? Math.min(...mine.map(itemId)) : 0
      fontOff[lang] = (have.length ? Math.max(...have.map(itemId)) + 1 : first) - first
    }
    const binMap = new Map<string, string>()
    for (const it of shpf.match(/<opf:item\b[^>]*\/>/g) ?? []) {
      const id = /\bid="([^"]+)"/.exec(it)?.[1]
      const href = /\bhref="([^"]+)"/.exec(it)?.[1]
      if (!id || !href || !href.startsWith('BinData/') || !src.files.has(href)) continue
      const newId = 'm' + nsec + '_' + id
      const newHref = 'BinData/m' + nsec + '_' + href.slice('BinData/'.length)
      binMap.set(id, newId)
      writeBytes(base, newHref, src.files.get(href)!)
      const item = it
        .replace('id="' + id + '"', 'id="' + newId + '"')
        .replace('href="' + href + '"', 'href="' + newHref + '"')
      hpf = hpf.replace('</opf:manifest>', item + '</opf:manifest>')
    }
    for (const lang of LANGS) {
      const add = fontItems(sh, lang).map((f) => setId(f, itemId(f) + fontOff[lang]!))
      if (add.length === 0) continue
      const re = new RegExp(
        '(<hh:fontface lang="' +
          lang +
          '"[^>]*fontCnt=")(\\d+)("[^>]*>)([\\s\\S]*?)(</hh:fontface>)',
      )
      const m = re.exec(h)
      if (!m) throw new HangulOrganizeError('unreadable')
      h =
        h.slice(0, m.index) +
        m[1] +
        (Number(m[2]) + add.length) +
        m[3] +
        m[4] +
        add.join('') +
        m[5] +
        h.slice(m.index + m[0].length)
    }
    const names = new Set([...h.matchAll(/<hh:style\b[^>]*\bname="([^"]*)"/g)].map((m) => m[1]!))
    const sections = sectionNames(src)
    const firstSection = readText(src, sections[0] ?? '') ?? ''
    const outline = /outlineShapeIDRef="(\d+)"/.exec(firstSection)
    const outlineNum = outline ? Number(outline[1]) + off.numbering! : null
    for (const [cont, tag] of LISTS) {
      const add: string[] = []
      for (const item of items(sh, cont, tag)) {
        let x = remapRefs(setId(item, itemId(item) + off[tag]!), off, fontOff, binMap)
        if (tag === 'paraPr' && outlineNum !== null) {
          // outline headings follow the document's first numbering: point them at their own
          x = x.replace(
            /(<hh:heading\b[^>]*?)type="OUTLINE"([^>]*?)idRef="\d+"/,
            (_w, a: string, b: string) => a + 'type="NUMBER"' + b + 'idRef="' + outlineNum + '"',
          )
        }
        if (tag === 'style') {
          const name = /\bname="([^"]*)"/.exec(x)?.[1]
          if (name !== undefined && names.has(name)) {
            x = x.replace('name="' + name + '"', 'name="' + name + ' 사본(' + nsec + ')"')
            x = x.replace(/\bengName="[^"]*"/, 'engName=""')
          }
        }
        add.push(x)
      }
      if (add.length) h = appendItems(h, cont, tag, add)
    }
    for (const name of sections) {
      let body = remapRefs(readText(src, name) ?? '', off, fontOff, binMap)
      // a header or footer carries on into later sections: give a section without its own
      // an empty one, so the document before does not show on its pages
      for (const kind of ['header', 'footer']) {
        if (body.includes('<hp:' + kind + ' ')) continue
        const empty =
          '<hp:ctrl><hp:' +
          kind +
          ' id="0" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" ' +
          'lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" ' +
          'textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="0" paraPrIDRef="' +
          off.paraPr +
          '" styleIDRef="' +
          off.style +
          '" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="' +
          off.charPr +
          '"/></hp:p></hp:subList>' +
          '</hp:' +
          kind +
          '></hp:ctrl>'
        body = body.replace('</hp:secPr>', '</hp:secPr>' + empty)
      }
      // page numbers carry on too: a document without its own shows none
      if (!body.includes('<hp:pageNum ')) {
        body = body.replace(
          '</hp:secPr>',
          '</hp:secPr><hp:ctrl><hp:pageNum pos="NONE" formatType="DIGIT" sideChar=""/></hp:ctrl>',
        )
      }
      const fresh = 'Contents/section' + nsec + '.xml'
      writeText(base, fresh, body)
      hpf = hpf.replace(
        '</opf:manifest>',
        '<opf:item id="section' +
          nsec +
          '" href="' +
          fresh +
          '" media-type="application/xml"/></opf:manifest>',
      )
      hpf = hpf.replace(
        '</opf:spine>',
        '<opf:itemref idref="section' + nsec + '" linear="yes"/></opf:spine>',
      )
      nsec++
    }
  }
  h = h.replace(/(<hh:head\b[^>]*\bsecCnt=")\d+/, '$1' + nsec)
  writeText(base, 'Contents/header.xml', h)
  writeText(base, 'Contents/content.hpf', hpf)
}

/** an HWP or HWPX document as an HWPX package (the engine writes the HWP one) */
async function asHwpx(bytes: Uint8Array, format: 'hwp' | 'hwpx'): Promise<ZipPackage> {
  if (format === 'hwpx') return readZip(bytes)
  const doc = await open(bytes)
  try {
    return await readZip(exportAs(doc, 'hwpx'), { trusted: true })
  } finally {
    doc.free()
  }
}

/** join documents in order into the first one's format; checked by its text after */
export async function joinHangul(
  inputs: { bytes: Uint8Array; format: 'hwp' | 'hwpx' }[],
  format: 'hwp' | 'hwpx',
): Promise<HangulResult> {
  let want = ''
  let pagesBefore = 0
  for (const input of inputs) {
    const doc = await open(input.bytes)
    try {
      const n = doc.pageCount()
      pagesBefore += n
      want += Array.from({ length: n }, (_, p) => pageText(doc, p)).join('')
    } finally {
      doc.free()
    }
  }
  const packages: ZipPackage[] = []
  for (const input of inputs) packages.push(await asHwpx(input.bytes, input.format))
  const base = packages[0]!
  appendHwpx(base, packages.slice(1))
  let out = await writeZip(base)
  const doc = await open(out).catch(() => {
    throw new HangulOrganizeError('mismatch')
  })
  let pages: number
  try {
    pages = doc.pageCount()
    if (format === 'hwp') out = exportAs(doc, 'hwp')
  } finally {
    doc.free()
  }
  const back = await open(out).catch(() => {
    throw new HangulOrganizeError('mismatch')
  })
  try {
    pages = back.pageCount()
    const got = squeeze(Array.from({ length: pages }, (_, p) => pageText(back, p)).join(''))
    if (got !== squeeze(want)) throw new HangulOrganizeError('mismatch')
  } finally {
    back.free()
  }
  const warnings: string[] = []
  if (pages !== pagesBefore)
    warnings.push('쪽 수가 ' + pagesBefore + '쪽이 아니라 ' + pages + '쪽이에요.')
  return { bytes: out, pages, warnings }
}
