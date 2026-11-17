import { posix } from 'node:path'
import { hasPart, readText, removePart, writeText, type ZipPackage } from './zip'

/**
 * The Open Packaging parts of Word and PowerPoint files: relationships, content types, and
 * which parts are still reached from the package root. Relationship files are small, flat
 * lists of one element, so they are read and written as text; part XML is never reparsed here.
 */

export interface Rel {
  id: string
  /** the last segment of the type URI, e.g. 'slide', 'image' */
  kind: string
  type: string
  /** as written (XML-escaped) */
  target: string
  external: boolean
}

const attr = (element: string, name: string): string | null => {
  const m = new RegExp('\\s' + name + '="([^"]*)"').exec(element)
  return m ? m[1]! : null
}

export const xmlUnescape = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

export const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** the relationships part of a part ('' is the package root) */
export function relsPathOf(part: string): string {
  const dir = posix.dirname(part)
  const base = posix.basename(part)
  return (dir === '.' ? '' : dir + '/') + '_rels/' + base + '.rels'
}

export function parseRels(xml: string): Rel[] {
  const out: Rel[] = []
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const el = m[0]
    const id = attr(el, 'Id')
    const type = attr(el, 'Type')
    const target = attr(el, 'Target')
    if (!id || !type || target === null) continue
    out.push({
      id,
      type,
      kind: type.slice(type.lastIndexOf('/') + 1),
      target,
      external: attr(el, 'TargetMode') === 'External',
    })
  }
  return out
}

export function serializeRels(rels: Rel[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels
      .map(
        (r) =>
          '<Relationship Id="' +
          r.id +
          '" Type="' +
          r.type +
          '" Target="' +
          r.target +
          '"' +
          (r.external ? ' TargetMode="External"' : '') +
          '/>',
      )
      .join('') +
    '</Relationships>'
  )
}

export function readRels(pkg: ZipPackage, part: string): Rel[] {
  const xml = readText(pkg, relsPathOf(part))
  return xml ? parseRels(xml) : []
}

export function writeRels(pkg: ZipPackage, part: string, rels: Rel[]): void {
  writeText(pkg, relsPathOf(part), serializeRels(rels))
}

/** the part a relationship of the part points at (internal targets only) */
export function resolveTarget(fromPart: string, target: string): string {
  const raw = xmlUnescape(target).split('#')[0]!
  if (raw.startsWith('/')) return posix.normalize(raw.slice(1))
  const dir = posix.dirname(fromPart)
  return posix.normalize(posix.join(dir === '.' ? '' : dir, raw))
}

/** the target text a part writes to reach another part */
export function relativeTarget(fromPart: string, toPart: string): string {
  const dir = posix.dirname(fromPart)
  return xmlEscape(posix.relative(dir === '.' ? '' : dir, toPart))
}

/** a relationship id not yet used in the list */
export function freshRelId(rels: Rel[], used: Set<string> = new Set()): string {
  const taken = new Set([...rels.map((r) => r.id), ...used])
  let n = rels.length + 1
  while (taken.has('rId' + n)) n++
  return 'rId' + n
}

/** every part reached from the package root through internal relationships */
export function reachableParts(pkg: ZipPackage): Set<string> {
  const seen = new Set<string>()
  const queue: string[] = []
  for (const rel of readRels(pkg, '')) {
    if (rel.external) continue
    queue.push(resolveTarget('', rel.target))
  }
  while (queue.length > 0) {
    const part = queue.pop()!
    if (seen.has(part) || !hasPart(pkg, part)) continue
    seen.add(part)
    for (const rel of readRels(pkg, part)) {
      if (!rel.external) queue.push(resolveTarget(part, rel.target))
    }
  }
  return seen
}

const isRelsPart = (name: string): boolean => /(^|\/)_rels\/[^/]+\.rels$/.test(name)

/** the part a relationships file belongs to ('' for the root) */
function ownerOfRels(name: string): string {
  const dir = posix.dirname(posix.dirname(name))
  const base = posix.basename(name).replace(/\.rels$/, '')
  return dir === '.' ? base : dir + '/' + base
}

/**
 * Drop every part nothing reaches any more (a removed slide's notes, a picture only it used),
 * with its relationships and content type. The package root's own files stay.
 */
export function dropUnreachable(pkg: ZipPackage): number {
  const keep = reachableParts(pkg)
  let dropped = 0
  for (const name of [...pkg.order]) {
    if (name === '[Content_Types].xml' || name === '_rels/.rels') continue
    if (isRelsPart(name)) {
      if (keep.has(ownerOfRels(name))) continue
    } else if (keep.has(name)) continue
    removePart(pkg, name)
    dropped++
  }
  const types = readText(pkg, '[Content_Types].xml')
  if (types) {
    writeText(
      pkg,
      '[Content_Types].xml',
      types.replace(/<Override\b[^>]*\/>/g, (el) => {
        const name = attr(el, 'PartName')
        return name && !pkg.files.has(xmlUnescape(name).replace(/^\//, '')) ? '' : el
      }),
    )
  }
  return dropped
}

/** the content type declared for a part, by override or by its extension */
export function contentTypeOf(pkg: ZipPackage, part: string): string | null {
  const types = readText(pkg, '[Content_Types].xml') ?? ''
  for (const m of types.matchAll(/<Override\b[^>]*\/>/g)) {
    const name = attr(m[0], 'PartName')
    if (name && xmlUnescape(name).replace(/^\//, '') === part) return attr(m[0], 'ContentType')
  }
  const ext = posix.extname(part).slice(1).toLowerCase()
  for (const m of types.matchAll(/<Default\b[^>]*\/>/g)) {
    if ((attr(m[0], 'Extension') ?? '').toLowerCase() === ext) return attr(m[0], 'ContentType')
  }
  return null
}

/** declare a part's content type (an override), and an extension's default when it lacks one */
export function declarePart(
  pkg: ZipPackage,
  part: string,
  contentType: string | null,
  defaults: { extension: string; contentType: string }[] = [],
): void {
  let types = readText(pkg, '[Content_Types].xml') ?? ''
  for (const d of defaults) {
    const has = [...types.matchAll(/<Default\b[^>]*\/>/g)].some(
      (m) => (attr(m[0], 'Extension') ?? '').toLowerCase() === d.extension.toLowerCase(),
    )
    if (!has) {
      types = types.replace(
        '</Types>',
        '<Default Extension="' + d.extension + '" ContentType="' + d.contentType + '"/></Types>',
      )
    }
  }
  if (contentType) {
    types = types.replace(
      '</Types>',
      '<Override PartName="/' + xmlEscape(part) + '" ContentType="' + contentType + '"/></Types>',
    )
  }
  writeText(pkg, '[Content_Types].xml', types)
}

/** the Default entries of a package's content types */
export function defaultTypes(pkg: ZipPackage): { extension: string; contentType: string }[] {
  const types = readText(pkg, '[Content_Types].xml') ?? ''
  return [...types.matchAll(/<Default\b[^>]*\/>/g)]
    .map((m) => ({
      extension: attr(m[0], 'Extension') ?? '',
      contentType: attr(m[0], 'ContentType') ?? '',
    }))
    .filter((d) => d.extension && d.contentType)
}

/** whether a part has an override of its own (so a copy needs one too) */
export function hasOverride(pkg: ZipPackage, part: string): boolean {
  const types = readText(pkg, '[Content_Types].xml') ?? ''
  return [...types.matchAll(/<Override\b[^>]*\/>/g)].some(
    (m) => xmlUnescape(attr(m[0], 'PartName') ?? '').replace(/^\//, '') === part,
  )
}

/** a part name like the given one that the package does not have yet */
export function freshPartName(pkg: ZipPackage, wanted: string, taken: Set<string>): string {
  if (!pkg.files.has(wanted) && !taken.has(wanted)) return wanted
  const ext = posix.extname(wanted)
  const stem = wanted.slice(0, wanted.length - ext.length).replace(/\d+$/, '')
  for (let n = 1; ; n++) {
    const name = stem + n + ext
    if (!pkg.files.has(name) && !taken.has(name)) return name
  }
}

export { attr as xmlAttr }
