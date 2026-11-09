import { describe, expect, it } from 'vitest'
import {
  CONVERT_EXTENSIONS,
  routeFor,
  sourceKindOf,
  targetsFor,
  type SourceKind,
} from '../src/main/document-convert/routes'

describe('sourceKindOf', () => {
  it.each([
    ['/a/계획.HWP', 'hwp'],
    ['/a/a.hwpx', 'hwpx'],
    ['/a/a.docx', 'docx'],
    ['/a/a.odt', 'odt'],
    ['/a/a.xls', 'sheet'],
    ['/a/a.xlsm', 'sheet'],
    ['/a/a.csv', 'sheet'],
    ['/a/a.pptx', 'pptx'],
    ['/a/a.pdf', 'pdf'],
    ['/a/a.htm', 'html'],
    ['/a/a.markdown', 'md'],
    ['/a/scan.JPEG', 'image'],
    ['/a/book.epub', 'epub'],
  ])('%s → %s', (path, kind) => {
    expect(sourceKindOf(path)).toBe(kind)
  })

  it('knows nothing it cannot read', () => {
    expect(sourceKindOf('/a/a.zip')).toBeNull()
    expect(sourceKindOf('/a/noext')).toBeNull()
  })

  it('offers every extension it takes in the open dialog', () => {
    for (const ext of CONVERT_EXTENSIONS) expect(sourceKindOf('/a/x.' + ext)).not.toBeNull()
  })
})

const ALL = ['pdf', 'hwp', 'hwpx', 'docx', 'odt', 'pptx', 'xlsx', 'html', 'md', 'png'] as const
/** the format a document already is, which has no card of its own */
const OWN: Partial<Record<SourceKind, string>> = {
  hwp: 'hwp',
  hwpx: 'hwpx',
  docx: 'docx',
  odt: 'odt',
  sheet: 'xlsx',
  pptx: 'pptx',
  pdf: 'pdf',
  html: 'html',
  md: 'md',
}

describe('targetsFor', () => {
  const formats = (kind: SourceKind, edition: 'desktop' | 'web', canMakePdf = true) =>
    targetsFor(kind, edition, canMakePdf).map((t) => t.format)

  it.each(['hwp', 'hwpx', 'docx', 'odt', 'sheet', 'pptx', 'pdf', 'html', 'md', 'image'] as const)(
    'turns a %s document into every other format on the desktop',
    (kind) => {
      expect([...formats(kind, 'desktop')].sort()).toEqual(
        ALL.filter((f) => f !== OWN[kind]).sort(),
      )
    },
  )

  it('lists the shorter routes first', () => {
    for (const kind of ['hwp', 'docx', 'sheet', 'pdf'] as const) {
      const lengths = targetsFor(kind, 'desktop').map((t) => t.steps.length)
      expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
    }
    expect(formats('hwp', 'desktop').slice(0, 2)).toEqual(['pdf', 'hwpx'])
  })

  it('leaves out on the web what the web edition has not been checked for', () => {
    expect(formats('html', 'web')).toEqual([])
    expect(formats('md', 'web')).toEqual([])
    expect(formats('hwp', 'web')).toContain('pptx')
  })

  it('has no card for a document nothing can be made of yet', () => {
    expect(targetsFor('epub', 'desktop')).toEqual([])
  })

  it('leaves out routes through a PDF where nothing can print one', () => {
    expect(formats('hwp', 'web', false)).toEqual(['hwpx'])
    expect(formats('docx', 'web', false)).toEqual(['hwpx', 'odt', 'html', 'md', 'hwp'])
    expect([...formats('pdf', 'web', false)].sort()).toEqual(ALL.filter((f) => f !== 'pdf').sort())
    expect(routeFor('docx', 'pdf', 'web', false)).toBeNull()
  })

  it('shows one step per stage of the route, and downloads pictures as a ZIP', () => {
    const kinds: SourceKind[] = [
      'hwp',
      'hwpx',
      'docx',
      'odt',
      'sheet',
      'pptx',
      'pdf',
      'html',
      'md',
      'image',
    ]
    for (const kind of kinds) {
      for (const target of targetsFor(kind, 'desktop')) {
        expect(target.steps).toHaveLength(routeFor(kind, target.format, 'desktop')!.steps.length)
        expect(target.extension).toBe(target.format === 'png' ? 'zip' : target.format)
        expect(target.title).not.toBe('')
      }
    }
  })

  it('says on a card when the route goes through a PDF', () => {
    const viaPdf = targetsFor('hwp', 'desktop').find((t) => t.format === 'pptx')!
    expect(viaPdf.summary).toContain('PDF를 거쳐')
    // a PDF itself, and a route without a PDF, keep their usual words
    expect(targetsFor('pdf', 'desktop').find((t) => t.format === 'pptx')!.summary).toBe(
      '쪽마다 슬라이드로',
    )
    expect(targetsFor('docx', 'desktop').find((t) => t.format === 'odt')!.summary).toBe(
      '오픈 문서 형식',
    )
  })
})

describe('routeFor', () => {
  it('keeps the direct routes as they were', () => {
    expect(routeFor('hwp', 'pdf', 'desktop')?.steps).toEqual(['to-pdf'])
    expect(routeFor('hwp', 'hwpx', 'web')?.steps).toEqual(['hwp-container'])
    expect(routeFor('odt', 'pdf', 'desktop')?.steps).toEqual(['odt-docx', 'to-pdf'])
    expect(routeFor('hwp', 'png', 'desktop')?.steps).toEqual(['to-pdf', 'pdf-png'])
    expect(routeFor('html', 'odt', 'desktop')?.steps).toEqual(['html-docx', 'docx-odt'])
    expect(routeFor('docx', 'md', 'desktop')?.steps).toEqual(['docs-export'])
    expect(routeFor('image', 'pdf', 'desktop')?.steps).toEqual(['images-pdf'])
  })

  it('goes through another format when there is no direct engine', () => {
    expect(routeFor('hwp', 'pptx', 'desktop')?.steps).toEqual(['to-pdf', 'pdf-pptx'])
    expect(routeFor('hwp', 'docx', 'desktop')?.steps).toEqual(['to-pdf', 'pdf-docx'])
    expect(routeFor('pptx', 'xlsx', 'desktop')?.steps).toEqual(['to-pdf', 'pdf-xlsx'])
    expect(routeFor('docx', 'hwp', 'desktop')?.steps).toEqual(['docx-hwpx', 'hwp-container'])
    expect(routeFor('sheet', 'hwp', 'desktop')?.steps).toEqual([
      'to-pdf',
      'pdf-docx',
      'docx-hwpx',
      'hwp-container',
    ])
    expect(routeFor('hwpx', 'html', 'desktop')?.steps).toEqual([
      'to-pdf',
      'pdf-docx',
      'docs-export',
    ])
  })

  it('names the file each stage writes, ending in the format asked for', () => {
    expect(routeFor('docx', 'hwp', 'desktop')?.outputs).toEqual(['hwpx', 'hwp'])
    expect(routeFor('hwpx', 'md', 'desktop')?.outputs).toEqual(['pdf', 'docx', 'md'])
    expect(routeFor('pdf', 'png', 'desktop')?.outputs).toEqual(['zip'])
    expect(routeFor('pptx', 'xlsx', 'desktop')?.outputs).toEqual(['pdf', 'xlsx'])
  })

  it('turns a PDF into a Hangul document through Word, the HWP saved by the Hangul engine', () => {
    expect(routeFor('pdf', 'hwpx', 'desktop')?.steps).toEqual(['pdf-docx', 'docx-hwpx'])
    expect(routeFor('pdf', 'hwp', 'web')?.steps).toEqual(['pdf-docx', 'docx-hwpx', 'hwp-container'])
  })

  it('says on a card into Hangul through a PDF that the content moves and the layout does not', () => {
    expect(targetsFor('pdf', 'desktop').find((t) => t.format === 'hwp')!.summary).toContain(
      '기본 양식',
    )
    expect(targetsFor('pptx', 'desktop').find((t) => t.format === 'hwpx')!.summary).toContain(
      '기본 양식',
    )
    // a Hangul card for a Hangul document keeps its usual words
    expect(targetsFor('hwpx', 'desktop').find((t) => t.format === 'hwp')!.summary).toBe(
      '한글에서 바로 열어요',
    )
  })

  it('has no route to the format a document already is, or from one nothing reads', () => {
    expect(routeFor('hwp', 'hwp', 'desktop')).toBeNull()
    expect(routeFor('sheet', 'xlsx', 'desktop')).toBeNull()
    expect(routeFor('epub', 'pdf', 'desktop')).toBeNull()
    expect(routeFor('html', 'docx', 'web')).toBeNull()
  })
})
