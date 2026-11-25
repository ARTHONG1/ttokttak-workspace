/**
 * 똑딱업무 > 똑딱정리: documents in (one, or several of one kind), the tidy-ups this run can
 * do with them shown as cards, the picked one done and handed back for download in the
 * documents' own format. The main process keeps the picked files (by token); the page only
 * sends the token, the action and the pages it picked.
 */

/** the kinds of document 똑딱정리 takes; HWP and HWPX are one kind (한글) */
export type OrganizeFamily = 'pdf' | 'hangul' | 'docx' | 'pptx'

export type OrganizeAction = 'merge' | 'split' | 'remove' | 'shrink'

/** one card: a tidy-up the picked documents can have */
export interface OrganizeCard {
  action: OrganizeAction
  title: string
  /** one line under it */
  summary: string
  /** set when the result may differ from the original: shown as 주의 with this text */
  caution?: string
}

export interface OrganizeFile {
  id: string
  /** the file's name without its extension */
  name: string
  /** lower case, without the dot */
  extension: string
  size: number
}

export type OrganizeOpenResult =
  | {
      ok: true
      token: string
      family: OrganizeFamily
      files: OrganizeFile[]
      cards: OrganizeCard[]
    }
  | { ok: false; error: string }

/** one page (slide, part) of a document, as the page picker shows it */
export interface OrganizeUnit {
  /** 0-based */
  index: number
  /** e.g. '3쪽', '슬라이드 3', '3번째 부분' */
  label: string
  /** the first words on it */
  text: string
  /** it starts inside a table or paragraph of the unit before: it can go only with that one */
  joinedToPrevious?: boolean
}

export type OrganizeUnitsResult =
  | {
      ok: true
      /** what one unit is called: '쪽', '슬라이드', '부분' */
      word: string
      units: OrganizeUnit[]
      /** how the picker draws the units: the PDF itself, SVG pages on request, or text only */
      preview: 'pdf' | 'svg' | 'text'
      /** what a unit is, when it is not a page (Word: the parts between page breaks) */
      note?: string
    }
  | { ok: false; error: string }

export type OrganizeSplitMode = 'each' | 'every' | 'pick'

export interface OrganizeRunRequest {
  token: string
  action: OrganizeAction
  /** merge: the files' ids in the order to join them */
  order?: string[]
  /** split: one file per unit, one per `every` units, or one file of the picked units */
  split?: { mode: OrganizeSplitMode; every?: number; pick?: number[] }
  /** remove: the units to take out (0-based) */
  remove?: number[]
}

export type OrganizeRunResult =
  | {
      ok: true
      /** the download's suggested name */
      fileName: string
      extension: string
      bytes: Uint8Array
      /** short facts about the result, e.g. '12쪽', '파일 3개' */
      facts: string[]
      /** what may differ from the original, in the user's words */
      warnings: string[]
      /** shrink: the size before, in bytes */
      before?: number
      /**
       * the result's id while it is kept for its preview: organizeUnits, organizePdfBytes and
       * organizePageSvg take it like a picked file's id (not for a ZIP)
       */
      previewId?: string
      /** a ZIP's files, by name */
      pieces?: string[]
    }
  | { ok: false; error: string }

/** sent while a tidy-up runs */
export interface OrganizeProgress {
  token: string
  label: string
}

/** 0-based units, sorted, as '3', '3-5' or '1,4' (1-based): for a file name and the page */
export function rangeLabel(units: number[]): string {
  const runs: string[] = []
  let a = units[0]!
  let b = a
  for (const u of units.slice(1).concat([-2])) {
    if (u === b + 1) b = u
    else {
      runs.push(a === b ? String(a + 1) : a + 1 + '-' + (b + 1))
      a = u
      b = u
    }
  }
  return runs.join(',')
}
