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

describe('targetsFor', () => {
  const formats = (kind: SourceKind, edition: 'desktop' | 'web') =>
    targetsFor(kind, edition).map((t) => t.format)

  it('offers what the built-in engines make, in a fixed order', () => {
    expect(formats('hwp', 'desktop')).toEqual(['pdf', 'hwpx', 'png'])
    expect(formats('hwpx', 'desktop')).toEqual(['pdf', 'hwp', 'png'])
    expect(formats('docx', 'desktop')).toEqual(['pdf', 'odt', 'html', 'md', 'png'])
    expect(formats('odt', 'desktop')).toEqual(['docx', 'pdf', 'html', 'md', 'png'])
    expect(formats('pdf', 'desktop')).toEqual(['docx', 'hwp', 'hwpx', 'pptx', 'xlsx', 'png'])
    expect(formats('html', 'desktop')).toEqual(['pdf', 'docx', 'odt'])
    expect(formats('md', 'desktop')).toEqual(['pdf'])
    expect(formats('image', 'desktop')).toEqual(['pdf'])
  })

  it('leaves out on the web what the web edition has not been checked for', () => {
    expect(formats('docx', 'web')).toEqual(['pdf', 'odt', 'html', 'md', 'png'])
    expect(formats('html', 'web')).toEqual([])
    expect(formats('pdf', 'web')).toEqual(['docx', 'hwp', 'hwpx', 'pptx', 'xlsx', 'png'])
    expect(formats('md', 'web')).toEqual([])
  })

  it('has no card for a document nothing can be made of yet', () => {
    expect(targetsFor('epub', 'desktop')).toEqual([])
  })

  it('leaves out routes through a PDF where nothing can print one', () => {
    expect(targetsFor('docx', 'web', false).map((t) => t.format)).toEqual(['odt', 'html', 'md'])
    expect(targetsFor('hwp', 'web', false).map((t) => t.format)).toEqual(['hwpx'])
    expect(targetsFor('pdf', 'web', false).map((t) => t.format)).toEqual([
      'docx',
      'hwp',
      'hwpx',
      'pptx',
      'xlsx',
      'png',
    ])
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
})

describe('routeFor', () => {
  it('chains the engines a format needs', () => {
    expect(routeFor('odt', 'pdf', 'desktop')?.steps).toEqual(['odt-docx', 'to-pdf'])
    expect(routeFor('hwp', 'png', 'desktop')?.steps).toEqual(['to-pdf', 'pdf-png'])
    expect(routeFor('html', 'odt', 'desktop')?.steps).toEqual(['html-docx', 'docx-odt'])
    expect(routeFor('hwp', 'hwpx', 'web')?.steps).toEqual(['hwp-container'])
  })

  it('turns a PDF into a Hangul document through Word, the HWP saved by the Hangul engine', () => {
    expect(routeFor('pdf', 'hwpx', 'desktop')?.steps).toEqual(['pdf-docx', 'docx-hwpx'])
    expect(routeFor('pdf', 'hwp', 'web')?.steps).toEqual(['pdf-docx', 'docx-hwpx', 'hwp-container'])
  })

  it('says on a PDF → Hangul card that the content moves and the layout does not', () => {
    const hwp = targetsFor('pdf', 'desktop').find((t) => t.format === 'hwp')!
    expect(hwp.summary).toContain('기본 양식')
    // a Hangul card for a Hangul document keeps its usual words
    expect(targetsFor('hwpx', 'desktop').find((t) => t.format === 'hwp')!.summary).toBe(
      '한글에서 바로 열어요',
    )
  })

  it('has no route the table does not list', () => {
    expect(routeFor('sheet', 'hwp', 'desktop')).toBeNull()
    expect(routeFor('html', 'docx', 'web')).toBeNull()
  })
})
