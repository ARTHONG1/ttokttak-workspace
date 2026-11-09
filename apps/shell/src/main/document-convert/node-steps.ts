import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { docxToOdt, isOdtOpenError, odtToDocx } from '@genoffice/odt-engine'
import { imagesToPdfBytes } from '../../../../pdf/src/main/images-to-pdf'
import { PdfLoadError, convertPdfFileToDocxLocal, ensurePdfium } from '../pdf2docx-local'
import { convertPdfFileToPptxLocal } from '../pdf2pptx-local'
import { convertPdfFileToXlsxLocal } from '../pdf2xlsx-local'
import { convertHwpContainer, hwpFirstPageSvg } from './hwp-container'
import { DOCX_HWPX_NOTE, docxToHwpx } from './docx-hwpx'
import { PNG_PAGE_LIMIT, pdfToPngZip } from './pdf-pages'
import { withPdfDocument } from '../../../../../packages/pdf2docx/src/extract/pdfium'
import type { RouteStep } from './routes'
import { ConvertStepError, type ConvertDeps, type StepJob, type StepOutcome } from './run'

/**
 * 문서 변환's engines on this machine: each route stage mapped to the converter the app
 * already has. Electron-free: the shell hands in its dialog-free exports.
 */

export interface NodeConvertHost {
  /** a document as a PDF: 똑딱서명's path (headless export, or LibreOffice on the web) */
  toPdf(input: string, output: string): Promise<void>
  /** the editors' dialog-free exports for the other formats */
  headless(input: string, output: string, format: 'html' | 'md' | 'docx'): Promise<void>
}

const SCANNED = '스캔한 문서라 글자를 고칠 수 없을 수 있어요.'

/** the PDF converters' notes ("page 3: ..."), said once in the user's words */
export function pdfConversionNotes(result: {
  warnings: string[]
  scannedDocument: boolean
}): string[] {
  if (result.scannedDocument) return [SCANNED]
  const pages = [
    ...new Set(
      result.warnings
        .map((w) => /^page (\d+)/.exec(w)?.[1])
        .filter((p): p is string => p !== undefined),
    ),
  ]
  if (pages.length === 0) return []
  const listed =
    pages.length > 5
      ? pages.slice(0, 5).join(', ') + '쪽 외 ' + (pages.length - 5) + '쪽'
      : pages.join(', ') + '쪽'
  return [listed + '은 모양을 그대로 옮기지 못해 그림으로 넣은 부분이 있어요.']
}

/** the ODT engine's report (what does not carry over), as one note */
export function odtReportNote(report: { count: number }[], into: 'ODT' | 'Word'): string[] {
  const n = report.reduce((sum, item) => sum + item.count, 0)
  return n > 0 ? ['서식 ' + n + '곳이 ' + into + '에서 조금 달라질 수 있어요.'] : []
}

const pdfPassword = (err: unknown): never => {
  if (err instanceof PdfLoadError && err.code === 'password-required') {
    throw new ConvertStepError('password')
  }
  throw err
}

const odtPassword = (err: unknown): never => {
  if (isOdtOpenError(err) && err.code === 'encrypted') throw new ConvertStepError('password')
  throw err
}

const pages = (n: number): string[] => [n + '쪽']

/** a finished PDF's page count, as a fact; none when the count cannot be read */
async function pdfPageFacts(path: string): Promise<string[]> {
  try {
    const m = await ensurePdfium()
    const bytes = new Uint8Array(await readFile(path))
    return pages(withPdfDocument(m, bytes, (doc) => m._FPDF_GetPageCount(doc)))
  } catch {
    return []
  }
}

async function runStep(host: NodeConvertHost, step: RouteStep, job: StepJob): Promise<StepOutcome> {
  const read = async () => new Uint8Array(await readFile(job.input))
  const write = (bytes: Uint8Array) => writeFile(job.output, bytes)
  // the format this stage writes: the route names it, also when it is a stage on the way
  const writes = extname(job.output).slice(1).toLowerCase()
  switch (step) {
    case 'to-pdf':
      await host.toPdf(job.input, job.output)
      // the page count only when the PDF is the result (a later stage reports its own)
      return job.format === 'pdf' ? { facts: await pdfPageFacts(job.output) } : {}
    case 'hwp-container': {
      const out = await convertHwpContainer(await read(), writes === 'hwp' ? 'hwp' : 'hwpx')
      await write(out)
      const previewSvg = await hwpFirstPageSvg(out)
      return previewSvg ? { previewSvg } : {}
    }
    case 'pdf-png': {
      const made = await pdfToPngZip(await read(), job.name, await ensurePdfium()).catch(
        pdfPassword,
      )
      await write(made.zip)
      return {
        facts: [made.pages + '쪽 그림'],
        warnings:
          made.total > made.pages
            ? [made.total + '쪽 중 앞 ' + PNG_PAGE_LIMIT + '쪽만 그림으로 바꿨어요.']
            : [],
      }
    }
    case 'pdf-docx': {
      const made = await convertPdfFileToDocxLocal(job.input).catch(pdfPassword)
      await write(made.docx)
      return { facts: pages(made.pages), warnings: pdfToWordNotes(job.format, made) }
    }
    case 'pdf-pptx': {
      const made = await convertPdfFileToPptxLocal(job.input).catch(pdfPassword)
      await write(made.pptx)
      return { facts: [made.pages + '장'], warnings: pdfConversionNotes(made) }
    }
    case 'pdf-xlsx': {
      const made = await convertPdfFileToXlsxLocal(job.input).catch(pdfPassword)
      await write(made.xlsx)
      return { facts: pages(made.pages), warnings: pdfConversionNotes(made) }
    }
    case 'docx-odt': {
      const made = await docxToOdt(await read())
      await write(made.odtBytes)
      return { warnings: odtReportNote(made.report, 'ODT') }
    }
    case 'odt-docx': {
      const made = await odtToDocx(await read()).catch(odtPassword)
      await write(made.docxBytes)
      return { warnings: odtReportNote(made.report, 'Word') }
    }
    case 'docs-export':
      await host.headless(job.input, job.output, writes === 'md' ? 'md' : 'html')
      return {}
    case 'html-docx':
      await host.headless(job.input, job.output, 'docx')
      return {}
    case 'images-pdf':
      // a photographed page lands on A4 (landscape for a wide photo), edge to edge
      await write(
        await imagesToPdfBytes([await read()], { paper: { w: 595.28, h: 841.89 }, marginPt: 0 }),
      )
      return { facts: ['1쪽'] }
    case 'docx-hwpx': {
      const out = await docxToHwpx(await read())
      await write(out)
      const previewSvg = job.format === 'hwpx' ? await hwpFirstPageSvg(out) : undefined
      return { warnings: [DOCX_HWPX_NOTE], ...(previewSvg ? { previewSvg } : {}) }
    }
  }
}

export function nodeConvertDeps(host: NodeConvertHost): ConvertDeps {
  return {
    fileSize: async (path) => (await stat(path)).size,
    readFile: async (path) => new Uint8Array(await readFile(path)),
    copyFile: (from, to) => copyFile(from, to),
    makeTempDir: () => mkdtemp(join(tmpdir(), 'ttokttak-convert-')),
    removeDir: (dir) => rm(dir, { recursive: true, force: true }),
    step: (step, job) => runStep(host, step, job),
  }
}
/**
 * PDF → Word's notes for the whole conversion. On the way to a Hangul document the page
 * notes would speak of a Word layout the result does not keep (it has its own note); a
 * scanned PDF is still said.
 */
export function pdfToWordNotes(
  format: string,
  result: { warnings: string[]; scannedDocument: boolean },
): string[] {
  if (format === 'hwp' || format === 'hwpx') return result.scannedDocument ? [SCANNED] : []
  return pdfConversionNotes(result)
}
