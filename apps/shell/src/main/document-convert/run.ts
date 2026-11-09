import { basename, extname, join } from 'node:path'
import type { ConvertFormat, ConvertRunResult } from '../../shared/convert-api'
import { HwpConvertError } from './hwp-container'
import {
  STEP_LABELS,
  extensionOf,
  routeFor,
  type Edition,
  type RouteStep,
  type SourceKind,
} from './routes'

/**
 * 문서 변환's runner: the route for (document kind, format), stage by stage, each engine
 * reading the file the stage before wrote, all inside one temporary folder that is removed
 * afterwards. The original is copied in first and never opened by an engine. A result that
 * is empty or does not look like its format is not handed out.
 */

/** the largest document taken in, and the largest result handed out */
export const CONVERT_MAX_BYTES = 100 * 1024 * 1024

export const CONVERT_ERRORS = {
  tooBig: '파일이 너무 커요. 100MB까지 올릴 수 있어요.',
  resultTooBig: '바꾼 파일이 100MB를 넘어 내려받을 수 없어요.',
  noRoute: '이 문서는 아직 그 형식으로 바꿀 수 없어요.',
  password: '암호가 걸린 문서예요. 암호를 풀고 다시 올려 주세요.',
  hwpMismatch: '한글 문서를 그대로 옮기지 못해 변환을 멈췄어요. 원본은 그대로예요.',
  failed: '변환하지 못했어요. 문서를 편집기에서 열어 확인해 주세요.',
} as const

/** what an engine stage throws when the reason matters to the user */
export class ConvertStepError extends Error {
  constructor(readonly reason: 'password' | 'failed') {
    super('conversion step failed: ' + reason)
    this.name = 'ConvertStepError'
  }
}

export interface StepJob {
  input: string
  /** the file this stage writes; its extension says which format (see ConvertRoute.outputs) */
  output: string
  /** the format the whole conversion makes */
  format: ConvertFormat
  /** the original file's name without its extension */
  name: string
}

export interface StepOutcome {
  warnings?: string[]
  facts?: string[]
  previewSvg?: string
}

export interface ConvertDeps {
  fileSize(path: string): Promise<number>
  readFile(path: string): Promise<Uint8Array>
  copyFile(from: string, to: string): Promise<void>
  makeTempDir(): Promise<string>
  removeDir(dir: string): Promise<void>
  /** one stage: job.input → job.output */
  step(step: RouteStep, job: StepJob): Promise<StepOutcome>
}

const startsWith = (bytes: Uint8Array, head: number[]): boolean =>
  bytes.length > head.length && head.every((b, i) => bytes[i] === b)

const ZIP_HEAD = [0x50, 0x4b, 0x03, 0x04]

export function outputLooksRight(format: ConvertFormat, bytes: Uint8Array): boolean {
  switch (format) {
    case 'pdf':
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
    case 'hwp':
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])
    case 'html':
    case 'md':
      return new TextDecoder().decode(bytes).trim().length > 0
    default:
      return startsWith(bytes, ZIP_HEAD)
  }
}

function errorText(err: unknown): string {
  if (err instanceof HwpConvertError) {
    return err.reason === 'password'
      ? CONVERT_ERRORS.password
      : err.reason === 'mismatch'
        ? CONVERT_ERRORS.hwpMismatch
        : CONVERT_ERRORS.failed
  }
  if (err instanceof ConvertStepError && err.reason === 'password') return CONVERT_ERRORS.password
  return CONVERT_ERRORS.failed
}

export async function runConversion(
  req: {
    path: string
    kind: SourceKind
    format: ConvertFormat
    edition: Edition
    /** false where nothing can print a PDF (see routeFor) */
    canMakePdf?: boolean
    onStep(step: number, total: number, label: string): void
  },
  deps: ConvertDeps,
): Promise<ConvertRunResult> {
  const route = routeFor(req.kind, req.format, req.edition, req.canMakePdf ?? true)
  if (!route) return { ok: false, error: CONVERT_ERRORS.noRoute }
  try {
    if ((await deps.fileSize(req.path)) > CONVERT_MAX_BYTES) {
      return { ok: false, error: CONVERT_ERRORS.tooBig }
    }
  } catch {
    return { ok: false, error: CONVERT_ERRORS.failed }
  }
  const name = basename(req.path, extname(req.path))
  const extension = extensionOf(req.format)
  const dir = await deps.makeTempDir()
  try {
    let input = join(dir, 'source' + extname(req.path).toLowerCase())
    await deps.copyFile(req.path, input)
    const warnings: string[] = []
    const facts: string[] = []
    let previewPdf: Uint8Array | undefined
    let previewSvg: string | undefined
    for (const [i, step] of route.steps.entries()) {
      req.onStep(i + 1, route.steps.length, STEP_LABELS[step])
      const output = join(dir, 'work-' + (i + 1) + '.' + route.outputs[i])
      const outcome = await deps.step(step, { input, output, format: req.format, name })
      warnings.push(...(outcome.warnings ?? []))
      facts.push(...(outcome.facts ?? []))
      if (outcome.previewSvg) previewSvg = outcome.previewSvg
      if (output.endsWith('.pdf')) previewPdf = await deps.readFile(output)
      input = output
    }
    if ((await deps.fileSize(input)) > CONVERT_MAX_BYTES) {
      return { ok: false, error: CONVERT_ERRORS.resultTooBig }
    }
    const bytes = await deps.readFile(input)
    if (!outputLooksRight(req.format, bytes)) throw new Error('the result is empty or malformed')
    return {
      ok: true,
      fileName: name + '.' + extension,
      extension,
      bytes,
      facts,
      warnings,
      ...(previewPdf ? { previewPdf } : {}),
      ...(previewSvg ? { previewSvg } : {}),
    }
  } catch (err) {
    console.warn('[convert] failed', req.kind, '→', req.format, err)
    return { ok: false, error: errorText(err) }
  } finally {
    await deps.removeDir(dir).catch(() => {})
  }
}
