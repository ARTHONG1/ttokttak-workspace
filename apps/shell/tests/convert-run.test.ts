import { describe, expect, it, vi } from 'vitest'
import { HwpConvertError } from '../src/main/document-convert/hwp-container'
import type { RouteStep } from '../src/main/document-convert/routes'
import {
  CONVERT_ERRORS,
  ConvertStepError,
  outputLooksRight,
  runConversion,
  type ConvertDeps,
} from '../src/main/document-convert/run'

const enc = (s: string) => new TextEncoder().encode(s)
const PDF = enc('%PDF-1.7\n')
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

/** fake engines over an in-memory disk: each step writes its output file */
function fakeDeps(
  outputs: Partial<Record<RouteStep, Uint8Array>>,
  overrides: Partial<ConvertDeps> = {},
) {
  const disk = new Map<string, Uint8Array>([['/in/회의록 (최종).odt', ZIP]])
  const calls: { step: RouteStep; input: string; output: string; name: string }[] = []
  const removed: string[] = []
  const deps: ConvertDeps = {
    fileSize: async (path) => disk.get(path)?.byteLength ?? 0,
    readFile: async (path) => {
      const bytes = disk.get(path)
      if (!bytes) throw new Error('no file ' + path)
      return bytes
    },
    makeTempDir: async () => '/tmp/convert-1',
    removeDir: async (dir) => {
      removed.push(dir)
    },
    copyFile: async (from, to) => {
      disk.set(to, disk.get(from)!)
    },
    step: vi.fn(async (step: RouteStep, job: { input: string; output: string; name: string }) => {
      calls.push({ step, input: job.input, output: job.output, name: job.name })
      disk.set(job.output, outputs[step] ?? new Uint8Array())
      return step === 'to-pdf' ? { facts: ['2쪽'] } : { warnings: ['서식 1곳이 달라져요.'] }
    }),
    ...overrides,
  }
  return { deps, calls, removed }
}

const request = (onStep = vi.fn()) => ({
  path: '/in/회의록 (최종).odt',
  kind: 'odt' as const,
  format: 'pdf' as const,
  edition: 'desktop' as const,
  onStep,
})

describe('runConversion', () => {
  it('runs the stages in order, each one reading what the one before wrote', async () => {
    const { deps, calls, removed } = fakeDeps({ 'odt-docx': ZIP, 'to-pdf': PDF })
    const onStep = vi.fn()
    const result = await runConversion(request(onStep), deps)
    expect(calls.map((c) => c.step)).toEqual(['odt-docx', 'to-pdf'])
    // the engines work on a copy in the temporary folder, never on the original
    expect(calls[0].input).toBe('/tmp/convert-1/source.odt')
    expect(calls[0].name).toBe('회의록 (최종)')
    expect(calls[1].input).toBe(calls[0].output)
    expect(onStep.mock.calls).toEqual([
      [1, 2, 'Word로 옮기기'],
      [2, 2, 'PDF로 만들기'],
    ])
    expect(result).toEqual({
      ok: true,
      fileName: '회의록 (최종).pdf',
      extension: 'pdf',
      bytes: PDF,
      facts: ['2쪽'],
      warnings: ['서식 1곳이 달라져요.'],
      previewPdf: PDF,
    })
    expect(removed).toEqual(['/tmp/convert-1'])
  })

  it('does not hand out an empty or wrong-looking result', async () => {
    const { deps, removed } = fakeDeps({ 'odt-docx': ZIP, 'to-pdf': new Uint8Array() })
    expect(await runConversion(request(), deps)).toEqual({
      ok: false,
      error: CONVERT_ERRORS.failed,
    })
    expect(removed).toEqual(['/tmp/convert-1'])
  })

  it('stops a Hangul conversion that would change the text', async () => {
    const { deps } = fakeDeps(
      {},
      {
        step: async () => {
          throw new HwpConvertError('mismatch')
        },
      },
    )
    const result = await runConversion({ ...request(), kind: 'hwp', format: 'hwpx' }, deps)
    expect(result).toEqual({ ok: false, error: CONVERT_ERRORS.hwpMismatch })
  })

  it('says a locked document needs its password', async () => {
    const { deps } = fakeDeps(
      {},
      {
        step: async () => {
          throw new ConvertStepError('password')
        },
      },
    )
    expect(await runConversion(request(), deps)).toEqual({
      ok: false,
      error: CONVERT_ERRORS.password,
    })
  })

  it('refuses a file over 100MB before any engine runs', async () => {
    const { deps } = fakeDeps({}, { fileSize: async () => 101 * 1024 * 1024 })
    expect(await runConversion(request(), deps)).toEqual({
      ok: false,
      error: CONVERT_ERRORS.tooBig,
    })
    expect(deps.step).not.toHaveBeenCalled()
  })

  it('refuses a format the route table has no route for', async () => {
    const { deps } = fakeDeps({})
    const result = await runConversion({ ...request(), kind: 'epub', format: 'pdf' }, deps)
    expect(result).toEqual({ ok: false, error: CONVERT_ERRORS.noRoute })
    expect(deps.step).not.toHaveBeenCalled()
  })

  it('goes through the formats on the way, each stage writing its own kind of file', async () => {
    const HWP = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2])
    const { deps, calls } = fakeDeps({
      'to-pdf': PDF,
      'pdf-docx': ZIP,
      'docx-hwpx': ZIP,
      'hwp-container': HWP,
    })
    const onStep = vi.fn()
    const result = await runConversion({ ...request(onStep), kind: 'sheet', format: 'hwp' }, deps)
    expect(calls.map((c) => c.output)).toEqual([
      '/tmp/convert-1/work-1.pdf',
      '/tmp/convert-1/work-2.docx',
      '/tmp/convert-1/work-3.hwpx',
      '/tmp/convert-1/work-4.hwp',
    ])
    for (let i = 1; i < calls.length; i++) expect(calls[i].input).toBe(calls[i - 1].output)
    expect(onStep.mock.calls.map((c) => c[1])).toEqual([4, 4, 4, 4])
    expect(result).toMatchObject({ ok: true, fileName: '회의록 (최종).hwp', bytes: HWP })
  })

  it('carries a Hangul stage preview SVG on PDF → HWP and PDF → HWPX conversions', async () => {
    const HWP = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2])
    const { deps } = fakeDeps(
      { 'pdf-docx': ZIP, 'docx-hwpx': ZIP, 'hwp-container': HWP },
      {
        step: vi.fn(async (step, job) => {
          if (step === 'pdf-docx' || step === 'docx-hwpx') {
            return {
              ...(step === 'docx-hwpx' ? { previewSvg: '<svg>hwpx-page-1</svg>' } : {}),
            }
          }
          if (step === 'hwp-container') {
            return { previewSvg: '<svg>hwp-page-1</svg>' }
          }
          void job
          return {}
        }),
        readFile: async (path) => (path.endsWith('.hwp') ? HWP : ZIP),
        fileSize: async () => 128,
        copyFile: async () => {},
      },
    )
    const hwpResult = await runConversion(
      { ...request(), path: '/in/원고.pdf', kind: 'pdf', format: 'hwp' },
      deps,
    )
    expect(hwpResult).toMatchObject({
      ok: true,
      fileName: '원고.hwp',
      previewSvg: '<svg>hwp-page-1</svg>',
    })
    const hwpxResult = await runConversion(
      { ...request(), path: '/in/원고.pdf', kind: 'pdf', format: 'hwpx' },
      deps,
    )
    expect(hwpxResult).toMatchObject({
      ok: true,
      fileName: '원고.hwpx',
      previewSvg: '<svg>hwpx-page-1</svg>',
    })
  })
})

describe('outputLooksRight', () => {
  it('knows each format by its first bytes', () => {
    expect(outputLooksRight('pdf', PDF)).toBe(true)
    expect(outputLooksRight('pdf', ZIP)).toBe(false)
    expect(outputLooksRight('hwp', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0]))).toBe(true)
    expect(outputLooksRight('docx', ZIP)).toBe(true)
    expect(outputLooksRight('png', ZIP)).toBe(true)
    expect(outputLooksRight('html', enc('<p>안녕</p>'))).toBe(true)
    expect(outputLooksRight('md', enc('  \n'))).toBe(false)
  })
})
