import { hwpToText, loadRhwpEngine } from '@genoffice/file-parse'

/**
 * 문서 변환: an HWP document saved as HWPX, or the other way round, by the engine the
 * Hangul editor runs. The result is opened again and its body text compared with the
 * original's; a result that reads differently is not handed out (a damaged Hangul document
 * is worse than no conversion).
 */

export type HwpConvertReason = 'password' | 'unreadable' | 'mismatch'

export class HwpConvertError extends Error {
  constructor(readonly reason: HwpConvertReason) {
    super('HWP conversion failed: ' + reason)
    this.name = 'HwpConvertError'
  }
}

/** the same text with line ends tidied: a container change may move trailing spaces */
const comparable = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join('\n')

function readError(err: unknown): HwpConvertError {
  return new HwpConvertError(/password/i.test(String(err)) ? 'password' : 'unreadable')
}

export async function convertHwpContainer(
  bytes: Uint8Array,
  target: 'hwp' | 'hwpx',
): Promise<Uint8Array> {
  // reading the text first also runs the reader's zip-size gate on an HWPX
  let before: string
  try {
    before = await hwpToText(bytes)
  } catch (err) {
    throw readError(err)
  }
  const { HwpDocument } = await loadRhwpEngine()
  let out: Uint8Array
  let doc: InstanceType<typeof HwpDocument> | null = null
  try {
    doc = new HwpDocument(new Uint8Array(bytes))
    const made = target === 'hwpx' ? doc.exportHwpxWithReport() : doc.exportHwpWithReport()
    try {
      out = made.takeBytes()
    } finally {
      made.free()
    }
  } catch (err) {
    throw readError(err)
  } finally {
    doc?.free()
  }
  let after: string
  try {
    after = await hwpToText(out)
  } catch {
    throw new HwpConvertError('mismatch')
  }
  if (comparable(after) !== comparable(before)) throw new HwpConvertError('mismatch')
  return out
}

/** The first page of an HWP or HWPX document drawn as an SVG by the Hangul engine, or undefined. */
export async function hwpFirstPageSvg(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const { HwpDocument } = await loadRhwpEngine()
    const doc = new HwpDocument(new Uint8Array(bytes))
    try {
      if (doc.pageCount() < 1) return undefined
      const svg = doc.renderPageSvg(0)
      return svg.trimStart().startsWith('<svg') ? svg : undefined
    } finally {
      doc.free()
    }
  } catch {
    return undefined
  }
}
