import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type { SignDocumentResult } from '../shared/home-api'

/**
 * 똑딱서명's way in: the document the user picked, as a PDF to sign. A PDF comes back as it
 * is, a photo becomes a page, and every other document goes through the app's own
 * dialog-free PDF export (the same pages the editor's File menu exports) in a temporary
 * folder that is removed afterwards.
 */

/** what the open dialog offers */
export const SIGN_DOCUMENT_EXTENSIONS = [
  'pdf',
  'hwp',
  'hwpx',
  'docx',
  'xlsx',
  'xlsm',
  'xls',
  'csv',
  'pptx',
  'jpg',
  'jpeg',
  'png',
] as const

/** the largest document taken in, and the largest PDF handed to the page */
export const SIGN_MAX_BYTES = 100 * 1024 * 1024

export type SignSource = 'pdf' | 'image' | 'convert'

const CONVERTED = new Set(['hwp', 'hwpx', 'docx', 'xlsx', 'xlsm', 'xls', 'csv', 'pptx'])
const IMAGES = new Set(['jpg', 'jpeg', 'png'])

export function signSourceOf(path: string): SignSource | null {
  const ext = extname(path).slice(1).toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (IMAGES.has(ext)) return 'image'
  if (CONVERTED.has(ext)) return 'convert'
  return null
}

export interface SignDocumentDeps {
  fileSize(path: string): Promise<number>
  readFile(path: string): Promise<Uint8Array>
  /** the app's headless PDF export; throws when no PDF was written */
  convertToPdf(input: string, outPath: string): Promise<void>
  imagesToPdf(images: Uint8Array[]): Promise<Uint8Array>
  makeTempDir(): Promise<string>
  removeDir(dir: string): Promise<void>
  /**
   * whether this run can turn the document into a PDF (always, on the desktop); a document
   * it cannot is refused at once with where it can be signed, instead of failing after a wait
   */
  canConvert?: (path: string) => boolean
}

/** the file system side of SignDocumentDeps; the conversions come from the caller */
export function nodeSignDeps(
  convert: Pick<SignDocumentDeps, 'convertToPdf' | 'imagesToPdf' | 'canConvert'>,
): SignDocumentDeps {
  return {
    fileSize: async (path) => (await stat(path)).size,
    readFile: async (path) => new Uint8Array(await readFile(path)),
    makeTempDir: () => mkdtemp(join(tmpdir(), 'ttokttak-sign-')),
    removeDir: (dir) => rm(dir, { recursive: true, force: true }),
    ...convert,
  }
}

const isPdf = (bytes: Uint8Array): boolean =>
  bytes.length > 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-'

const UNSUPPORTED =
  '이 파일은 서명할 수 없어요. PDF, 한글, 워드, 엑셀, PPT, 사진(JPG·PNG) 파일을 골라 주세요.'
const TOO_BIG = '파일이 너무 커요. 100MB까지 올릴 수 있어요.'
const NOT_CONVERTED =
  '문서를 PDF로 바꾸지 못했어요. 문서를 편집기에서 열어 PDF로 내보낸 뒤, 그 PDF를 올려 주세요.'
const NO_CONVERSION_HERE =
  '웹 버전에서는 PDF와 사진(JPG·PNG)에 서명할 수 있어요. 한글·워드·엑셀·PPT 문서는 PDF로 저장해 올리거나, PC에 설치한 똑딱작업실에서 올려 주세요.'

export async function documentToPdf(
  path: string,
  deps: SignDocumentDeps,
): Promise<SignDocumentResult> {
  const source = signSourceOf(path)
  if (!source) return { ok: false, error: UNSUPPORTED }
  if (source === 'convert' && deps.canConvert && !deps.canConvert(path)) {
    return { ok: false, error: NO_CONVERSION_HERE }
  }
  const name = basename(path, extname(path))
  try {
    if ((await deps.fileSize(path)) > SIGN_MAX_BYTES) return { ok: false, error: TOO_BIG }
  } catch {
    return { ok: false, error: '파일을 읽지 못했어요.' }
  }
  if (source === 'pdf') {
    const bytes = await deps.readFile(path).catch(() => null)
    if (!bytes || !isPdf(bytes)) return { ok: false, error: 'PDF 파일을 읽지 못했어요.' }
    return { ok: true, name, bytes, converted: false }
  }
  if (source === 'image') {
    try {
      const bytes = await deps.imagesToPdf([await deps.readFile(path)])
      return { ok: true, name, bytes, converted: true }
    } catch {
      return { ok: false, error: '사진을 읽지 못했어요. JPG나 PNG 사진을 골라 주세요.' }
    }
  }
  const dir = await deps.makeTempDir()
  try {
    const outPath = join(dir, name + '.pdf')
    await deps.convertToPdf(path, outPath)
    const bytes = await deps.readFile(outPath)
    if (!isPdf(bytes) || bytes.byteLength > SIGN_MAX_BYTES) throw new Error('no PDF')
    return { ok: true, name, bytes, converted: true }
  } catch (err) {
    console.warn('[sign] could not convert', basename(path), err)
    return { ok: false, error: NOT_CONVERTED }
  } finally {
    await deps.removeDir(dir).catch(() => {})
  }
}

/**
 * The web edition's conversions: its browser frames cannot print to PDF, so the server does
 * it. A Hangul document still goes through the hidden HWP view, whose print page the
 * server's Chromium prints (web/runtime/server-pdf.cjs, WEB_PDF_CHROMIUM); Word, Excel and
 * PowerPoint documents go through LibreOffice (WEB_SOFFICE).
 */
export function webCanConvert(path: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return /\.hwpx?$/i.test(path) ? Boolean(env.WEB_PDF_CHROMIUM) : Boolean(env.WEB_SOFFICE)
}

/**
 * The app's way to make a PDF of a document, shared by 똑딱서명 and 문서 변환: on the web
 * edition (WEB_SESSION_DIR) with LibreOffice, office documents go through it; everything
 * else, and every Hangul document, through the editors' dialog-free export (`headless`).
 */
export function pdfConverterFor(
  env: NodeJS.ProcessEnv,
  headless: (input: string, outPath: string) => Promise<void>,
): (input: string, outPath: string) => Promise<void> {
  const web = Boolean(env.WEB_SESSION_DIR)
  const soffice = env.WEB_SOFFICE
  return async (input, outPath) => {
    if (web && soffice && !/\.hwpx?$/i.test(input)) {
      await officeToPdf(input, outPath, soffice)
      return
    }
    await headless(input, outPath)
  }
}

/** LibreOffice's command line for one document: headless, its own profile, PDF into `outDir` */
export function sofficeArgs(input: string, outDir: string, profileDir: string): string[] {
  return [
    '--headless',
    '--norestore',
    '--nolockcheck',
    '-env:UserInstallation=file://' + profileDir,
    '--convert-to',
    'pdf',
    '--outdir',
    outDir,
    input,
  ]
}

/** `input` as a PDF at `outPath`, made by LibreOffice (`soffice`) in a scratch folder */
export async function officeToPdf(input: string, outPath: string, soffice: string): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'ttokttak-office-'))
  try {
    const outDir = join(work, 'out')
    await new Promise<void>((resolve, reject) => {
      execFile(
        soffice,
        sofficeArgs(input, outDir, join(work, 'profile')),
        { timeout: 120_000 },
        (err) => (err ? reject(err) : resolve()),
      )
    })
    await rename(join(outDir, basename(input, extname(input)) + '.pdf'), outPath)
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
