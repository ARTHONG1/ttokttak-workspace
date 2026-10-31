import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { XMLValidator } from 'fast-xml-parser'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const authorized = (changes, token) => changes.includes(token)

// Counts XML start elements without treating closing tags or occurrences in text as objects.
// These checks are intentionally conservative: they are structural regression guards,
// not substitutes for validation by the authoring application's XML schema/renderer.
export function tagCounts(xml) {
  const counts = new Map()
  for (const match of xml.matchAll(/<(?!(?:\?|!|\/))(?:(?:[\w.-]+):)?([\w.-]+)(?=[\s/>])/g)) {
    const name = match[1]
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

async function readZip(path) {
  const bytes = await readFile(path)
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const parts = new Map()
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir) parts.set(entry.name, await entry.async('nodebuffer'))
  }
  return parts
}

/** Compare contained objects; missing or altered protected components fail closed. */
export async function compareArchives({
  before,
  after,
  allowedChanges = [],
  protectedTags,
  protectedParts = /$^/,
}) {
  const details = {
    validation: 'ZIP + XML structural inspection; external application reopen not verified',
  }
  try {
    const first = await readZip(before)
    const second = await readZip(after)
    for (const [part, bytes] of second) {
      if (/\.(?:xml|rels)$/i.test(part)) {
        const verdict = XMLValidator.validate(bytes.toString('utf8'))
        if (verdict !== true) {
          throw new Error(`Malformed XML in ${part}: ${verdict.err?.msg ?? 'invalid XML'}`)
        }
      }
    }
    const unexpectedRemovals = []
    details.before = { parts: first.size }
    details.after = { parts: second.size }
    for (const [part, bytes] of first) {
      if (!second.has(part)) {
        if (!authorized(allowedChanges, `remove:${part}`))
          unexpectedRemovals.push(`missing part ${part}`)
        continue
      }
      const next = second.get(part)
      if (
        protectedParts.test(part) &&
        digest(bytes) !== digest(next) &&
        !authorized(allowedChanges, `edit:${part}`)
      ) {
        unexpectedRemovals.push(`protected part modified ${part}`)
      }
      if (!/\.xml$/i.test(part)) continue
      const oldCounts = tagCounts(bytes.toString('utf8'))
      const newCounts = tagCounts(next.toString('utf8'))
      for (const tag of protectedTags) {
        if (
          (oldCounts.get(tag) ?? 0) > (newCounts.get(tag) ?? 0) &&
          !authorized(allowedChanges, `remove:${tag}`) &&
          !authorized(allowedChanges, `remove:${part}:${tag}`)
        ) {
          unexpectedRemovals.push(
            `${part}: ${tag} ${oldCounts.get(tag) ?? 0} -> ${newCounts.get(tag) ?? 0}`,
          )
        }
      }
    }
    return { unexpectedRemovals, unreadable: false, details }
  } catch (error) {
    return {
      unexpectedRemovals: [],
      unreadable: true,
      details: { ...details, error: String(error) },
    }
  }
}
