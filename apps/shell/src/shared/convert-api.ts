/**
 * 똑딱업무 > 문서 변환: one document in, the formats this run can make of it shown as cards,
 * the picked one made and handed back for download. The main process keeps the picked file
 * (by token); the page only ever sends the token and the format.
 */

/** what a document can be turned into; 'png' is every page as a picture, in one ZIP */
export type ConvertFormat =
  'pdf' | 'hwp' | 'hwpx' | 'docx' | 'odt' | 'html' | 'md' | 'pptx' | 'xlsx' | 'png'

/** one card: a format this document can be made into, and the steps on the way */
export interface ConvertTarget {
  format: ConvertFormat
  /** the card's title, e.g. 'Word' */
  title: string
  /** one line under it */
  summary: string
  /** the steps shown while it runs */
  steps: string[]
  /** the extension of the file it downloads ('zip' for png) */
  extension: string
}

export type ConvertOpenResult =
  | {
      ok: true
      token: string
      /** the file's name without its extension */
      name: string
      /** the file's extension, lower case, without the dot */
      extension: string
      size: number
      targets: ConvertTarget[]
    }
  | { ok: false; error: string }

export type ConvertRunResult =
  | {
      ok: true
      /** the download's suggested name: the original name with the new extension */
      fileName: string
      extension: string
      bytes: Uint8Array
      /** short facts about the result, e.g. the page count */
      facts: string[]
      /** what may differ from the original, in the user's words */
      warnings: string[]
      /** the last PDF made on the way (or the result itself), for a first-page preview */
      previewPdf?: Uint8Array
      /** the first page of a finished Hangul document as SVG, for a first-page preview */
      previewSvg?: string
    }
  | { ok: false; error: string }

/** sent while a conversion runs: step `step` of `total` has started */
export interface ConvertProgress {
  token: string
  step: number
  total: number
  label: string
}
