import { extname } from 'node:path'
import type { ConvertFormat, ConvertTarget } from '../../shared/convert-api'

/**
 * 문서 변환's route table: which formats each kind of document can be made into with the
 * engines the app already has, and the stages on the way. One table for both editions; a
 * route the web edition has not been checked for is left out there (web: false).
 */

export type Edition = 'desktop' | 'web'

export type SourceKind =
  'hwp' | 'hwpx' | 'docx' | 'odt' | 'sheet' | 'pptx' | 'pdf' | 'html' | 'md' | 'image' | 'epub'

/** one stage: an engine that turns one file into another */
export type RouteStep =
  | 'to-pdf'
  | 'hwp-container'
  | 'pdf-png'
  | 'pdf-docx'
  | 'pdf-pptx'
  | 'pdf-xlsx'
  | 'docx-odt'
  | 'odt-docx'
  | 'docs-export'
  | 'html-docx'
  | 'images-pdf'

export interface ConvertRoute {
  format: ConvertFormat
  steps: RouteStep[]
}

interface RouteRow extends ConvertRoute {
  /** shown on the web edition (its server converts; checked there) */
  web: boolean
}

const KIND_BY_EXTENSION: Record<string, SourceKind> = {
  hwp: 'hwp',
  hwpx: 'hwpx',
  docx: 'docx',
  odt: 'odt',
  xlsx: 'sheet',
  xlsm: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
  pptx: 'pptx',
  pdf: 'pdf',
  html: 'html',
  htm: 'html',
  md: 'md',
  markdown: 'md',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  epub: 'epub',
}

/** what the open dialog offers */
export const CONVERT_EXTENSIONS: readonly string[] = Object.keys(KIND_BY_EXTENSION)

export function sourceKindOf(path: string): SourceKind | null {
  return KIND_BY_EXTENSION[extname(path).slice(1).toLowerCase()] ?? null
}

const row = (format: ConvertFormat, steps: RouteStep[], web = true): RouteRow => ({
  format,
  steps,
  web,
})

const TABLE: Record<SourceKind, RouteRow[]> = {
  hwp: [row('pdf', ['to-pdf']), row('hwpx', ['hwp-container']), row('png', ['to-pdf', 'pdf-png'])],
  hwpx: [row('pdf', ['to-pdf']), row('hwp', ['hwp-container']), row('png', ['to-pdf', 'pdf-png'])],
  docx: [
    row('pdf', ['to-pdf']),
    row('odt', ['docx-odt']),
    row('html', ['docs-export']),
    row('md', ['docs-export']),
    row('png', ['to-pdf', 'pdf-png']),
  ],
  odt: [
    row('docx', ['odt-docx']),
    row('pdf', ['odt-docx', 'to-pdf']),
    row('html', ['odt-docx', 'docs-export']),
    row('md', ['odt-docx', 'docs-export']),
    row('png', ['odt-docx', 'to-pdf', 'pdf-png']),
  ],
  sheet: [row('pdf', ['to-pdf']), row('png', ['to-pdf', 'pdf-png'])],
  pptx: [row('pdf', ['to-pdf']), row('png', ['to-pdf', 'pdf-png'])],
  pdf: [
    row('docx', ['pdf-docx']),
    row('pptx', ['pdf-pptx']),
    row('xlsx', ['pdf-xlsx']),
    row('png', ['pdf-png']),
  ],
  html: [
    row('pdf', ['to-pdf'], false),
    row('docx', ['html-docx'], false),
    row('odt', ['html-docx', 'docx-odt'], false),
  ],
  md: [row('pdf', ['to-pdf'], false)],
  image: [row('pdf', ['images-pdf'])],
  epub: [],
}

const CARD: Record<ConvertFormat, { title: string; summary: string }> = {
  pdf: { title: 'PDF', summary: '공유·인쇄용' },
  hwp: { title: '한글 HWP', summary: '한글에서 바로 열어요' },
  hwpx: { title: 'HWPX', summary: '한글 표준 문서' },
  docx: { title: 'Word', summary: '내용을 고쳐 쓸 수 있어요' },
  odt: { title: 'ODT', summary: '오픈 문서 형식' },
  html: { title: 'HTML', summary: '웹 페이지로 보기' },
  md: { title: 'Markdown', summary: '글 내용만 깔끔하게' },
  pptx: { title: 'PowerPoint', summary: '쪽마다 슬라이드로' },
  xlsx: { title: 'Excel', summary: '표를 셀로 옮겨요' },
  png: { title: '이미지(PNG)', summary: '쪽마다 그림 한 장, ZIP으로 받아요' },
}

export const STEP_LABELS: Record<RouteStep, string> = {
  'to-pdf': 'PDF로 만들기',
  'hwp-container': '한글 엔진으로 다시 저장',
  'pdf-png': '쪽마다 그림으로',
  'pdf-docx': 'PDF의 글자·표를 Word로',
  'pdf-pptx': 'PDF 쪽을 슬라이드로',
  'pdf-xlsx': 'PDF의 표를 Excel로',
  'docx-odt': 'ODT로 옮기기',
  'odt-docx': 'Word로 옮기기',
  'docs-export': 'Word 편집기로 내보내기',
  'html-docx': 'HTML을 Word로',
  'images-pdf': '사진을 A4 쪽으로',
}

/** the file extension a format downloads as */
export function extensionOf(format: ConvertFormat): string {
  return format === 'png' ? 'zip' : format
}

/**
 * The rows this run offers. `canMakePdf` is false where nothing can print the document to a
 * PDF (a web server without its converters): routes through a PDF are left out at once,
 * instead of failing after a wait.
 */
function offered(kind: SourceKind, edition: Edition, canMakePdf: boolean): RouteRow[] {
  return TABLE[kind].filter(
    (r) => (edition === 'desktop' || r.web) && (canMakePdf || !r.steps.includes('to-pdf')),
  )
}

export function routeFor(
  kind: SourceKind,
  format: ConvertFormat,
  edition: Edition,
  canMakePdf = true,
): ConvertRoute | null {
  const found = offered(kind, edition, canMakePdf).find((r) => r.format === format)
  return found ? { format: found.format, steps: [...found.steps] } : null
}

export function targetsFor(kind: SourceKind, edition: Edition, canMakePdf = true): ConvertTarget[] {
  return offered(kind, edition, canMakePdf).map((r) => ({
    format: r.format,
    ...CARD[r.format],
    steps: r.steps.map((s) => STEP_LABELS[s]),
    extension: extensionOf(r.format),
  }))
}
