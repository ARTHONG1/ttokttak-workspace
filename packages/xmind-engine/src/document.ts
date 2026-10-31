import type JSZip from 'jszip'
import { fileNames, loadArchive, readEntry, rewriteArchive } from './archive'
import { serializeSheets } from './content'
import { CONTENT_ENTRY, THUMBNAIL_ENTRY } from './entry-names'
import { checkContentStructure } from './structure-check'
import type { XmindSheet } from './types'
import { sheetToView, type ViewSheet } from './view'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

export interface XmindSaveOptions {
  /**
   * A new preview picture (PNG) for a save that rewrites the file. Leave it out
   * when no picture could be made: the one in the file then stays. Anything that
   * is not a PNG counts as left out.
   */
  thumbnail?: Uint8Array | null
  /** timestamp for rewritten archive entries; the current time when left out */
  now?: Date
}

/**
 * A map file that opened. It holds the file's original bytes and the source
 * tree, and is the only thing that can produce bytes to save. A file that did
 * not open as `ok` never becomes a document, so there is nothing to save it
 * with.
 *
 * The class is not exported from the package: documents come from `openXmind`
 * and the create functions only.
 *
 * Changing the map means changing the source tree: edit `sheets` in place (the
 * objects are the live tree) or swap a sheet with `replaceSheet`, then call
 * `markChanged`. `save` rewrites `content.json` from the tree when the document
 * was marked, and also when the tree no longer serialises the way it did at the
 * baseline, so an edit nobody marked is still written. That comparison can only
 * ever err towards writing: two trees that serialise alike would be written
 * alike.
 */
export class XmindDocument {
  /** the whole file as last opened or saved */
  #baseline: Uint8Array
  /** `serializeSheets` of the tree at the baseline */
  #baselineContent: string
  #zip: JSZip
  #sheets: XmindSheet[]
  #marked = false

  /** @internal Use `openXmind` or `createXmindDocument`. */
  constructor(baseline: Uint8Array, zip: JSZip, sheets: XmindSheet[], baselineContent: string) {
    this.#baseline = baseline
    this.#zip = zip
    this.#sheets = sheets
    this.#baselineContent = baselineContent
  }

  /**
   * The source tree: one entry per sheet, in file order. These are the live
   * objects, including every key the engine does not model.
   */
  get sheets(): XmindSheet[] {
    return this.#sheets
  }

  /** Puts another tree in a sheet's place and marks the document changed. */
  replaceSheet(index: number, sheet: XmindSheet): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.#sheets.length) {
      throw new Error(`xmind: there is no sheet ${index}`)
    }
    const check = checkContentStructure([sheet])
    if (!check.ok) throw new Error(`xmind: ${check.problem}`)
    this.#sheets[index] = sheet
    this.#marked = true
  }

  /** Records that the source tree was edited, so the next save rewrites `content.json`. */
  markChanged(): void {
    this.#marked = true
  }

  /**
   * Whether the next save writes a new file rather than the baseline's bytes.
   * True once marked; otherwise it compares the tree with the baseline, which
   * costs one serialisation of the tree.
   */
  get changed(): boolean {
    if (this.#marked) return true
    try {
      return serializeSheets(this.#sheets) !== this.#baselineContent
    } catch {
      return true
    }
  }

  /** The view data of every sheet, built fresh from the source tree. */
  viewSheets(): ViewSheet[] {
    return this.#sheets.map((sheet, index) => sheetToView(sheet, index))
  }

  /** Names of the files inside the archive, in archive order. */
  get entryNames(): string[] {
    return fileNames(this.#zip)
  }

  /** The bytes of a file inside the archive (a picture, the preview), or null. */
  readEntry(name: string): Promise<Uint8Array | null> {
    return readEntry(this.#zip, name)
  }

  /**
   * The bytes to write to disk.
   *
   * Unchanged: the baseline, byte for byte, whatever else was passed.
   * Changed: the same archive with `content.json` rewritten from the source
   * tree. Every other entry goes out as it came in, except the preview picture
   * when a new one is passed. `manifest.json` is never touched.
   *
   * The result becomes the new baseline, so the next save without further
   * edits returns these bytes again, and "the old picture" is then the one
   * written here. Throws instead of producing a file that would not open.
   */
  async save(options: XmindSaveOptions = {}): Promise<Uint8Array> {
    const content = this.#serialize()
    if (!this.#marked && content === this.#baselineContent) return new Uint8Array(this.#baseline)
    const check = checkContentStructure(this.#sheets)
    if (!check.ok) throw new Error(`xmind: cannot save, ${check.problem}`)

    const replacements = new Map<string, Uint8Array>()
    replacements.set(CONTENT_ENTRY, new TextEncoder().encode(content))
    if (isPng(options.thumbnail)) {
      replacements.set(THUMBNAIL_ENTRY, new Uint8Array(options.thumbnail))
    }
    const saved = await rewriteArchive(this.#baseline, replacements, options.now ?? new Date())

    this.#zip = await loadArchive(saved)
    this.#baseline = saved
    this.#baselineContent = content
    this.#marked = false
    return new Uint8Array(saved)
  }

  #serialize(): string {
    try {
      return serializeSheets(this.#sheets)
    } catch (error) {
      throw new Error('xmind: cannot save, the map cannot be written as JSON', { cause: error })
    }
  }
}

function isPng(bytes: Uint8Array | null | undefined): bytes is Uint8Array {
  return (
    bytes != null &&
    bytes.byteLength > PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
}
