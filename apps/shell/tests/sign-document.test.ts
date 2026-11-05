import { describe, expect, it, vi } from 'vitest'
import {
  SIGN_DOCUMENT_EXTENSIONS,
  documentToPdf,
  sofficeArgs,
  signSourceOf,
  webCanConvert,
  type SignDocumentDeps,
} from '../src/main/sign-document'

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n')

function deps(overrides: Partial<SignDocumentDeps> = {}): SignDocumentDeps & {
  removed: string[]
} {
  const removed: string[] = []
  return {
    removed,
    fileSize: async () => 1000,
    readFile: async () => PDF,
    convertToPdf: vi.fn(async () => {}),
    imagesToPdf: vi.fn(async () => PDF),
    makeTempDir: async () => '/tmp/sign-x',
    removeDir: async (dir) => {
      removed.push(dir)
    },
    ...overrides,
  }
}

describe('signSourceOf', () => {
  it.each([
    ['/a/계약서.pdf', 'pdf'],
    ['/a/가정통신문.HWP', 'convert'],
    ['/a/a.hwpx', 'convert'],
    ['/a/a.docx', 'convert'],
    ['/a/a.xlsx', 'convert'],
    ['/a/a.pptx', 'convert'],
    ['/a/scan.JPG', 'image'],
    ['/a/scan.jpeg', 'image'],
    ['/a/scan.png', 'image'],
  ])('%s → %s', (path, kind) => {
    expect(signSourceOf(path)).toBe(kind)
  })

  it('refuses what it cannot turn into a PDF', () => {
    expect(signSourceOf('/a/a.doc')).toBeNull()
    expect(signSourceOf('/a/a.zip')).toBeNull()
    expect(signSourceOf('/a/noext')).toBeNull()
  })

  it('offers every extension it takes in the open dialog', () => {
    for (const ext of SIGN_DOCUMENT_EXTENSIONS) expect(signSourceOf('/a/x.' + ext)).not.toBeNull()
  })
})

describe('documentToPdf', () => {
  it('hands a PDF back as it is, named after the file', async () => {
    const d = deps()
    const result = await documentToPdf('/docs/동의서.pdf', d)
    expect(result).toEqual({ ok: true, name: '동의서', bytes: PDF, converted: false })
    expect(d.convertToPdf).not.toHaveBeenCalled()
  })

  it('refuses a .pdf that is not a PDF', async () => {
    const d = deps({ readFile: async () => new TextEncoder().encode('hello') })
    const result = await documentToPdf('/docs/a.pdf', d)
    expect(result.ok).toBe(false)
  })

  it('converts a Hangul document in a temporary folder and removes the folder', async () => {
    const d = deps()
    const result = await documentToPdf('/docs/가정통신문.hwp', d)
    expect(d.convertToPdf).toHaveBeenCalledWith(
      '/docs/가정통신문.hwp',
      '/tmp/sign-x/가정통신문.pdf',
    )
    expect(result).toEqual({ ok: true, name: '가정통신문', bytes: PDF, converted: true })
    expect(d.removed).toEqual(['/tmp/sign-x'])
  })

  it('says what to do when the conversion fails, and still removes the folder', async () => {
    const d = deps({
      convertToPdf: vi.fn(async () => {
        throw new Error('hwp export timed out')
      }),
    })
    const result = await documentToPdf('/docs/a.docx', d)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('PDF로 바꾸지 못했어요')
    expect(d.removed).toEqual(['/tmp/sign-x'])
  })

  it('puts a photo on a page', async () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const d = deps({ readFile: async () => photo })
    const result = await documentToPdf('/docs/scan.jpg', d)
    expect(d.imagesToPdf).toHaveBeenCalledWith([photo])
    expect(result).toEqual({ ok: true, name: 'scan', bytes: PDF, converted: true })
  })

  it('refuses a file over the size limit before reading it', async () => {
    const readFile = vi.fn(async () => PDF)
    const d = deps({ fileSize: async () => 200 * 1024 * 1024, readFile })
    const result = await documentToPdf('/docs/big.pdf', d)
    expect(result.ok).toBe(false)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('refuses an unsupported file', async () => {
    const result = await documentToPdf('/docs/a.doc', deps())
    expect(result.ok).toBe(false)
  })

  it('says at once where a Hangul document can be signed when this run cannot convert', async () => {
    const d = deps({ canConvert: () => false })
    const result = await documentToPdf('/docs/a.hwp', d)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('PDF와 사진')
    expect(d.convertToPdf).not.toHaveBeenCalled()
    // a PDF still goes through
    expect((await documentToPdf('/docs/a.pdf', d)).ok).toBe(true)
  })
})

describe('the web edition', () => {
  it('converts Hangul with the server Chromium and office documents with LibreOffice', () => {
    const both = { WEB_PDF_CHROMIUM: '/usr/bin/chromium', WEB_SOFFICE: '/usr/bin/soffice' }
    expect(webCanConvert('/a/x.hwp', both)).toBe(true)
    expect(webCanConvert('/a/x.HWPX', both)).toBe(true)
    expect(webCanConvert('/a/x.docx', both)).toBe(true)
    expect(webCanConvert('/a/x.pptx', both)).toBe(true)
    // a server without them (a local preview) says so instead of failing after a wait
    expect(webCanConvert('/a/x.hwp', { WEB_SOFFICE: '/usr/bin/soffice' })).toBe(false)
    expect(webCanConvert('/a/x.docx', { WEB_PDF_CHROMIUM: '/usr/bin/chromium' })).toBe(false)
  })

  it('runs LibreOffice headless, with a profile of its own, into the given folder', () => {
    const args = sofficeArgs('/w/계획.docx', '/tmp/out', '/tmp/profile')
    expect(args).toContain('--headless')
    expect(args).toContain('-env:UserInstallation=file:///tmp/profile')
    expect(args.slice(-5)).toEqual(['--convert-to', 'pdf', '--outdir', '/tmp/out', '/w/계획.docx'])
  })
})
