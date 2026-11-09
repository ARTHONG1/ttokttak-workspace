import { extname } from 'node:path'
import type { ConvertFormat, ConvertTarget } from '../../shared/convert-api'

/**
 * 문서 변환's routes: every engine the app already has, as the format it reads and the one it
 * writes, and for each document the shortest chain of them to every format it can become.
 * One graph for both editions; an engine the web edition has not been checked for is left
 * out there (web: false).
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
  | 'docx-hwpx'

export interface ConvertRoute {
  format: ConvertFormat
  steps: RouteStep[]
  /** the extension of the file each stage writes; the last one is the result's */
  outputs: string[]
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

/**
 * A file on the way: the formats the engines read and write. A spreadsheet is 'xlsx', a
 * photo 'image', the pictures of the pages 'png' (downloaded as a ZIP).
 */
type FileKind = ConvertFormat | 'image'

const START: Record<SourceKind, FileKind | null> = {
  hwp: 'hwp',
  hwpx: 'hwpx',
  docx: 'docx',
  odt: 'odt',
  sheet: 'xlsx',
  pptx: 'pptx',
  pdf: 'pdf',
  html: 'html',
  md: 'md',
  image: 'image',
  // nothing reads an e-book yet
  epub: null,
}

interface Edge {
  step: RouteStep
  from: FileKind
  to: FileKind
  /** checked on the web edition (its server converts) */
  web: boolean
}

const edges = (step: RouteStep, from: FileKind[], to: FileKind, web = true): Edge[] =>
  from.map((f) => ({ step, from: f, to, web }))

/**
 * Every engine the app has, as what it reads and what it writes. A format no engine makes
 * directly is reached through the others: a Hangul document becomes slides by way of a PDF.
 * The order breaks ties between routes of the same length.
 */
const EDGES: Edge[] = [
  ...edges('to-pdf', ['hwp', 'hwpx', 'docx', 'xlsx', 'pptx'], 'pdf'),
  ...edges('to-pdf', ['html', 'md'], 'pdf', false),
  ...edges('hwp-container', ['hwp'], 'hwpx'),
  ...edges('hwp-container', ['hwpx'], 'hwp'),
  ...edges('images-pdf', ['image'], 'pdf'),
  ...edges('docx-odt', ['docx'], 'odt'),
  ...edges('odt-docx', ['odt'], 'docx'),
  ...edges('docs-export', ['docx'], 'html'),
  ...edges('docs-export', ['docx'], 'md'),
  ...edges('html-docx', ['html'], 'docx', false),
  ...edges('docx-hwpx', ['docx'], 'hwpx'),
  ...edges('pdf-docx', ['pdf'], 'docx'),
  ...edges('pdf-pptx', ['pdf'], 'pptx'),
  ...edges('pdf-xlsx', ['pdf'], 'xlsx'),
  ...edges('pdf-png', ['pdf'], 'png'),
]

/** the order of the cards among routes of the same length */
const FORMAT_ORDER: ConvertFormat[] = [
  'pdf',
  'hwp',
  'hwpx',
  'docx',
  'odt',
  'pptx',
  'xlsx',
  'html',
  'md',
  'png',
]

/** a PDF's words and tables moved into a new Hangul document: the layout is not kept */
const PDF_TO_HANGUL = '글과 표를 옮겨요 · 모양은 한글 기본 양식'
/** a document printed to a PDF and read back into an editable format */
const VIA_PDF = 'PDF를 거쳐 옮겨요 · 모양이 조금 달라질 수 있어요'
const FROM_PDF: RouteStep[] = ['pdf-docx', 'pdf-pptx', 'pdf-xlsx']

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
  'docx-hwpx': '한글 문서로 내용 옮기기',
}

/** the file extension a format downloads as */
export function extensionOf(format: ConvertFormat): string {
  return format === 'png' ? 'zip' : format
}

/**
 * The shortest route from a document to each format it can be made into, with the engines
 * this run has: edges the web edition has not been checked for are left out there, and where
 * nothing can print a PDF (a web server without its converters) routes through one go at
 * once, instead of failing after a wait.
 */
function shortestRoutes(
  kind: SourceKind,
  edition: Edition,
  canMakePdf: boolean,
): Map<ConvertFormat, Edge[]> {
  const start = START[kind]
  const found = new Map<ConvertFormat, Edge[]>()
  if (!start) return found
  const usable = EDGES.filter(
    (e) => (edition === 'desktop' || e.web) && (canMakePdf || e.step !== 'to-pdf'),
  )
  const reached = new Map<FileKind, Edge[]>([[start, []]])
  let frontier: FileKind[] = [start]
  while (frontier.length > 0) {
    const next: FileKind[] = []
    for (const at of frontier) {
      for (const edge of usable) {
        if (edge.from !== at || reached.has(edge.to)) continue
        reached.set(edge.to, [...reached.get(at)!, edge])
        next.push(edge.to)
      }
    }
    frontier = next
  }
  for (const [file, path] of reached) {
    if (file !== start && file !== 'image') found.set(file, path)
  }
  return found
}

const routeOf = (format: ConvertFormat, path: Edge[]): ConvertRoute => ({
  format,
  steps: path.map((e) => e.step),
  outputs: path.map((e) => (e.to === 'png' ? 'zip' : e.to)),
})

function summaryOf(kind: SourceKind, route: ConvertRoute): string {
  const fromPdf = route.steps.some((s) => FROM_PDF.includes(s))
  if (fromPdf && (route.format === 'hwp' || route.format === 'hwpx')) return PDF_TO_HANGUL
  if (fromPdf && kind !== 'pdf') return VIA_PDF
  return CARD[route.format].summary
}

export function routeFor(
  kind: SourceKind,
  format: ConvertFormat,
  edition: Edition,
  canMakePdf = true,
): ConvertRoute | null {
  const path = shortestRoutes(kind, edition, canMakePdf).get(format)
  return path ? routeOf(format, path) : null
}

export function targetsFor(kind: SourceKind, edition: Edition, canMakePdf = true): ConvertTarget[] {
  return [...shortestRoutes(kind, edition, canMakePdf)]
    .map(([format, path]) => routeOf(format, path))
    .sort(
      (a, b) =>
        a.steps.length - b.steps.length ||
        FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format),
    )
    .map((route) => ({
      format: route.format,
      title: CARD[route.format].title,
      summary: summaryOf(kind, route),
      steps: route.steps.map((s) => STEP_LABELS[s]),
      extension: extensionOf(route.format),
    }))
}
