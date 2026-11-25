import { mkdtempSync, writeFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { openPptx } from '@genoffice/pptx-engine'
import { hwpToText, loadRhwpEngine } from '@genoffice/file-parse'
import { hangulPages, joinHangul, keepHangulPages } from '../src/main/organize/hangul'
import { OrganizeService, cardsFor, piecesOf } from '../src/main/organize/service'
import { droppedPaths } from '../src/main/dropped-paths'
import { recodePdfImageInJs, recodePictureInJs } from '../src/main/organize/pictures'
import { docxText } from '../src/main/organize/docx'
import { readText, readZip, writeText, writeZip } from '../src/main/organize/zip'
import { danglingRels } from '../src/main/organize/pptx'
import { rangeLabel, type OrganizeRunResult } from '../src/shared/organize-api'

const ROOT = join(__dirname, '..', '..', '..')
const HWP = join(ROOT, 'apps', 'hwp', 'tests', 'fixtures')
const PPTX = join(ROOT, 'packages', 'pptx-engine', 'tests', 'fixtures')
const SAMPLES = join(ROOT, 'web', 'runtime', 'samples')
const dir = mkdtempSync(join(tmpdir(), 'organize-'))

describe('documents dropped on a 똑딱업무 page', () => {
  it('takes absolute paths of the kinds it tidies, in order', () => {
    expect(droppedPaths(['/a/첫 문서.hwp', '/b/둘째.HWPX'])).toEqual([
      '/a/첫 문서.hwp',
      '/b/둘째.HWPX',
    ])
  })

  it('refuses what is not a list of absolute paths', () => {
    expect(droppedPaths('/a/x.pdf')).toBeNull()
    expect(droppedPaths([])).toBeNull()
    expect(droppedPaths(['x.pdf'])).toBeNull()
    expect(droppedPaths(['/a/x.pdf', 3])).toBeNull()
  })

  it('leaves the kind check to the service: a spreadsheet still gets its message', () => {
    expect(droppedPaths(['/a/표.xlsx'])).toEqual(['/a/표.xlsx'])
  })

  it("on the web edition takes only the session's own uploads", () => {
    const session = '/srv/sessions/s1'
    expect(droppedPaths([session + '/home/업로드/2026/x.pdf'], session)).toEqual([
      session + '/home/업로드/2026/x.pdf',
    ])
    expect(droppedPaths(['/etc/secret.pdf'], session)).toBeNull()
    expect(droppedPaths([session + '/../s2/home/x.pdf'], session)).toBeNull()
    expect(droppedPaths(['/srv/sessions/s10/x.pdf'], session)).toBeNull()
  })
})

const service = (): OrganizeService =>
  new OrganizeService({
    readFile: async (p) => new Uint8Array(await readFile(p)),
    fileSize: async (p) => (await stat(p)).size,
    recodePicture: recodePictureInJs,
    recodePdfImage: recodePdfImageInJs,
  })

const ok = (r: OrganizeRunResult): Extract<OrganizeRunResult, { ok: true }> => {
  if (!r.ok) throw new Error(r.error)
  return r
}

/** a photo-like JPEG: smooth colour with fine noise, so it does not compress to nothing */
function photo(w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4)
  let seed = 7
  for (let i = 0; i < w * h; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const x = i % w
    const y = Math.floor(i / w)
    data[i * 4] = (x * 255) / w + (seed % 40)
    data[i * 4 + 1] = (y * 255) / h + ((seed >> 8) % 40)
    data[i * 4 + 2] = 128 + ((seed >> 16) % 60)
    data[i * 4 + 3] = 255
  }
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, 95).data)
}

async function pdf(name: string, pages: number, picture?: Uint8Array): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595, 842])
    page.drawText(name + ' page ' + (p + 1), { x: 60, y: 760, size: 20, font })
    if (picture && p === 0) {
      const img = await doc.embedJpg(picture)
      page.drawImage(img, { x: 40, y: 200, width: 500, height: 333 })
    }
  }
  const path = join(dir, name + '.pdf')
  writeFileSync(path, await doc.save())
  return path
}

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
const p = (text: string, extra = ''): string =>
  '<w:p>' + extra + '<w:r><w:t>' + text + '</w:t></w:r></w:p>'
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
const sect = (w: number, h: number, header = ''): string =>
  '<w:sectPr>' +
  header +
  '<w:pgSz w:w="' +
  w +
  '" w:h="' +
  h +
  '"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
const drawing = (rid: string): string =>
  '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="3000000" cy="2000000"/><wp:docPr id="1" name="Picture 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' +
  rid +
  '"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'

async function docx(
  name: string,
  body: string,
  picture?: Uint8Array,
  header?: string,
): Promise<string> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      (header
        ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
        : '') +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      (picture
        ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>'
        : '') +
      (header
        ? '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
        : '') +
      '</Relationships>',
  )
  zip.file(
    'word/styles.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:styles ' +
      W +
      '><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="' +
      name +
      'Title"><w:name w:val="' +
      name +
      ' title"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style></w:styles>',
  )
  zip.file(
    'word/numbering.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:numbering ' +
      W +
      '><w:abstractNum w:abstractNumId="0"><w:nsid w:val="1234ABCD"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>',
  )
  if (header)
    zip.file(
      'word/header1.xml',
      '<?xml version="1.0" encoding="UTF-8"?><w:hdr ' + W + '>' + p(header) + '</w:hdr>',
    )
  if (picture) zip.file('word/media/image1.jpeg', picture)
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document ' +
      W +
      '><w:body>' +
      body +
      '</w:body></w:document>',
  )
  const path = join(dir, name + '.docx')
  writeFileSync(path, await zip.generateAsync({ type: 'uint8array' }))
  return path
}

describe('똑딱정리 cards', () => {
  it('shows only what a file can have, and 주의 where the result may differ', () => {
    // one file opens on its pages; several open on the merge
    expect(cardsFor('pdf', 1, 3).map((c) => [c.action, Boolean(c.caution)])).toEqual([
      ['remove', false],
      ['split', false],
      ['shrink', false],
      ['merge', false],
    ])
    expect(cardsFor('pdf', 1, 1).map((c) => c.action)).toEqual(['shrink', 'merge'])
    expect(cardsFor('hangul', 3, 0).map((c) => c.action)).toEqual(['merge'])
    expect(
      cardsFor('hangul', 1, 5)
        .filter((c) => c.caution)
        .map((c) => c.action),
    ).toEqual(['remove', 'split', 'merge'])
    expect(cardsFor('pptx', 1, 4).find((c) => c.action === 'remove')?.title).toBe('슬라이드 고르기')
    expect(cardsFor('pptx', 1, 4).find((c) => c.action === 'remove')?.summary).toContain(
      '고른 슬라이드를 빼거나',
    )
    expect(cardsFor('hangul', 1, 4).find((c) => c.action === 'remove')?.summary).toContain(
      '고른 쪽만 새 파일로',
    )
    expect(cardsFor('docx', 1, 1).map((c) => c.action)).toEqual(['shrink', 'merge'])
  })

  it('splits into pieces and names them by their pages', () => {
    expect(piecesOf(5, { mode: 'each' })).toEqual([[0], [1], [2], [3], [4]])
    expect(piecesOf(5, { mode: 'every', every: 2 })).toEqual([[0, 1], [2, 3], [4]])
    expect(piecesOf(5, { mode: 'pick', pick: [4, 0, 9, 0] })).toEqual([[0, 4]])
    expect(rangeLabel([0, 1, 2])).toBe('1-3')
    expect(rangeLabel([0, 2, 3])).toBe('1,3-4')
  })
})

describe('똑딱정리 PDF', () => {
  let a: string
  let b: string
  beforeAll(async () => {
    a = await pdf('A', 3, photo(3000, 2000))
    b = await pdf('B', 2)
  })

  it('takes pages out, splits, joins and shrinks', async () => {
    const s = service()
    const opened = await s.open([a])
    if (!opened.ok) throw new Error(opened.error)
    const id = opened.files[0]!.id
    const units = await s.units(opened.token, id)
    expect(units.ok && units.units.length).toBe(3)

    const removed = ok(
      await s.run({ token: opened.token, action: 'remove', remove: [1] }, () => {}),
    )
    expect((await PDFDocument.load(removed.bytes)).getPageCount()).toBe(2)

    const split = ok(
      await s.run({ token: opened.token, action: 'split', split: { mode: 'each' } }, () => {}),
    )
    expect(split.fileName).toBe('A-나눔.zip')
    expect(Object.keys((await JSZip.loadAsync(split.bytes)).files)).toEqual([
      'A-1쪽.pdf',
      'A-2쪽.pdf',
      'A-3쪽.pdf',
    ])

    const shrunk = ok(await s.run({ token: opened.token, action: 'shrink' }, () => {}))
    expect(shrunk.bytes.length).toBeLessThan(shrunk.before! / 2)
    expect((await PDFDocument.load(shrunk.bytes)).getPageCount()).toBe(3)

    const both = await s.open([a, b])
    if (!both.ok) throw new Error(both.error)
    expect(both.cards.map((c) => c.action)).toEqual(['merge'])
    const merged = ok(
      await s.run(
        { token: both.token, action: 'merge', order: [both.files[1]!.id, both.files[0]!.id] },
        () => {},
      ),
    )
    expect(merged.fileName).toBe('B-합본.pdf')
    expect((await PDFDocument.load(merged.bytes)).getPageCount()).toBe(5)
  })

  it('refuses mixed kinds and keeps at least one page', async () => {
    const s = service()
    const mixed = await s.open([a, join(SAMPLES, '독서 행사 안내문.docx')])
    expect(mixed.ok).toBe(false)
    const opened = await s.open([b])
    if (!opened.ok) throw new Error(opened.error)
    const all = await s.run({ token: opened.token, action: 'remove', remove: [0, 1] }, () => {})
    expect(all.ok).toBe(false)
  })

  it('keeps the last result for its preview, and names the files of a ZIP', async () => {
    const s = service()
    // the small PDF without a photo: this runs beside the whole suite
    const opened = await s.open([b])
    if (!opened.ok) throw new Error(opened.error)
    const removed = ok(
      await s.run({ token: opened.token, action: 'remove', remove: [0] }, () => {}),
    )
    expect(removed.previewId).toBeTruthy()
    const units = await s.units(opened.token, removed.previewId!)
    expect(units.ok && units.units.length).toBe(1)
    expect(units.ok && units.preview).toBe('pdf')
    expect(await s.pdfBytes(opened.token, removed.previewId!)).toEqual(removed.bytes)

    const split = ok(
      await s.run({ token: opened.token, action: 'split', split: { mode: 'each' } }, () => {}),
    )
    expect(split.previewId).toBeUndefined()
    expect(split.pieces).toEqual(['B-1쪽.pdf', 'B-2쪽.pdf'])
    // the next run lets the earlier result go
    expect((await s.units(opened.token, removed.previewId!)).ok).toBe(false)
  })
})

describe('똑딱정리 PowerPoint', () => {
  it('keeps chosen slides, joins decks and both open in the slide engine', async () => {
    const s = service()
    const one = join(PPTX, '01_standard_business.pptx')
    const two = join(PPTX, '05_unicode_cjk_emoji.pptx')
    const opened = await s.open([one])
    if (!opened.ok) throw new Error(opened.error)
    const units = await s.units(opened.token, opened.files[0]!.id)
    if (!units.ok) throw new Error(units.error)
    const n = units.units.length
    expect(n).toBeGreaterThan(1)
    const removed = ok(
      await s.run({ token: opened.token, action: 'remove', remove: [0] }, () => {}),
    )
    expect((await openPptx(removed.bytes)).deck.slides.length).toBe(n - 1)
    expect(danglingRels(await readZip(removed.bytes))).toEqual([])

    const pair = await s.open([one, two])
    if (!pair.ok) throw new Error(pair.error)
    const other = (await openPptx(new Uint8Array(await readFile(two)))).deck.slides.length
    const merged = ok(await s.run({ token: pair.token, action: 'merge' }, () => {}))
    expect((await openPptx(merged.bytes)).deck.slides.length).toBe(n + other)
    expect(danglingRels(await readZip(merged.bytes))).toEqual([])
  })
})

describe('똑딱정리 Word', () => {
  let parts: string
  let other: string
  beforeAll(async () => {
    parts = await docx(
      'Parts',
      p('one', '<w:pPr><w:pStyle w:val="PartsTitle"/></w:pPr>') +
        pageBreak +
        p('two') +
        '<w:p><w:pPr>' +
        sect(11906, 16838) +
        '</w:pPr></w:p>' +
        p('three') +
        sect(16838, 11906),
    )
    other = await docx(
      'Other',
      p('alpha', '<w:pPr><w:pStyle w:val="OtherTitle"/></w:pPr>') +
        drawing('rId3') +
        p('beta') +
        sect(11906, 16838, '<w:headerReference w:type="default" r:id="rId4"/>'),
      photo(2400, 1600),
      'other header',
    )
  })

  it('finds the parts between breaks and keeps some of them', async () => {
    const s = service()
    const opened = await s.open([parts])
    if (!opened.ok) throw new Error(opened.error)
    const units = await s.units(opened.token, opened.files[0]!.id)
    if (!units.ok) throw new Error(units.error)
    expect(units.units.map((u) => u.text)).toEqual(['one', 'two', 'three'])
    expect(opened.cards.find((c) => c.action === 'split')?.caution).toBeTruthy()

    const removed = ok(
      await s.run({ token: opened.token, action: 'remove', remove: [1] }, () => {}),
    )
    const pkg = await readZip(removed.bytes)
    expect(docxText(pkg)).toBe('onethree')
    // the last part keeps its own landscape page
    expect(new TextDecoder().decode(pkg.files.get('word/document.xml')!)).toMatch(
      /<w:pgSz w:w="16838" w:h="11906"\/><w:pgMar[^>]*\/><\/w:sectPr><\/w:body>/,
    )

    const first = ok(
      await s.run(
        { token: opened.token, action: 'split', split: { mode: 'pick', pick: [0] } },
        () => {},
      ),
    )
    const doc = new TextDecoder().decode(
      (await readZip(first.bytes)).files.get('word/document.xml')!,
    )
    expect(doc).not.toContain('w:type="page"')
    // the first part takes the portrait section settings that ruled it
    expect(doc).toContain('<w:pgSz w:w="11906" w:h="16838"/>')
  })

  it('joins files with their pictures, headers, styles and lists', async () => {
    const s = service()
    const opened = await s.open([parts, other])
    if (!opened.ok) throw new Error(opened.error)
    const merged = ok(await s.run({ token: opened.token, action: 'merge' }, () => {}))
    const pkg = await readZip(merged.bytes)
    expect(docxText(pkg)).toBe('onetwothreealphabeta')
    expect(danglingRels(pkg)).toEqual([])
    const styles = new TextDecoder().decode(pkg.files.get('word/styles.xml')!)
    expect(styles).toContain('w:styleId="OtherTitle"')
    // the copied style's list got a number of its own
    expect(styles).toMatch(/w:styleId="OtherTitle"[\s\S]*?<w:numId w:val="2"\/>/)
    expect([...pkg.files.keys()].filter((n) => n.startsWith('word/media/'))).toHaveLength(1)
    expect([...pkg.files.keys()]).toContain('word/header1.xml')
  })

  it('shrinks the pictures inside and keeps the text', async () => {
    const s = service()
    const opened = await s.open([other])
    if (!opened.ok) throw new Error(opened.error)
    const shrunk = ok(await s.run({ token: opened.token, action: 'shrink' }, () => {}))
    expect(shrunk.bytes.length).toBeLessThan(shrunk.before! / 2)
    expect(docxText(await readZip(shrunk.bytes))).toBe('alphabeta')
  })
})

describe('똑딱정리 Hangul', () => {
  const memo = join(HWP, 'memo-source.hwp')
  const plan = join(SAMPLES, '현장체험학습 운영계획(안).hwpx')
  const tables = join(HWP, 'header-footer-paper-tables.hwpx')

  it('takes pages out of an HWP and keeps the rest word for word', async () => {
    const s = service()
    const opened = await s.open([memo])
    if (!opened.ok) throw new Error(opened.error)
    const units = await s.units(opened.token, opened.files[0]!.id)
    if (!units.ok) throw new Error(units.error)
    expect(units.units).toHaveLength(40)
    const removed = ok(
      await s.run({ token: opened.token, action: 'remove', remove: [0, 5, 6] }, () => {}),
    )
    expect(removed.fileName).toBe('memo-source-정리.hwp')
    expect(removed.facts[0]).toBe('37쪽')
    expect(removed.warnings).toEqual([])
    const picked = ok(
      await s.run(
        { token: opened.token, action: 'split', split: { mode: 'pick', pick: [2, 3] } },
        () => {},
      ),
    )
    expect(picked.fileName).toBe('memo-source-3-4쪽.hwp')
    expect(picked.facts[0]).toBe('2쪽')
    // every page's layout is read to check tables and pictures: slow when the whole suite runs
  }, 120_000)

  // a page that starts partway through a paragraph (its first line the rest of one begun on
  // the page before): the engine's page position names only the paragraph, so the page was
  // taken for a clean one, cut, and refused at the text check with a vague "differs" (a real
  // 공문, 2026-11-21); the caret start shows where the page really begins
  it('knows a page that starts inside a paragraph, and says so before cutting', async () => {
    const { HwpDocument } = await loadRhwpEngine()
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    doc.insertText(0, 0, 0, '앞 문단')
    doc.splitParagraph(0, 0, 4)
    doc.insertText(0, 1, 0, '긴 문단 '.repeat(3000))
    const bytes = doc.exportHwp()
    doc.free()
    const pages = await hangulPages(bytes)
    expect(pages.length).toBeGreaterThan(2)
    // the long paragraph begins on the first page: every page after it starts inside it
    expect(pages.map((p) => p.joined)).toEqual([false, ...pages.slice(1).map(() => true)])
    await expect(keepHangulPages(bytes, 'hwp', [1])).rejects.toMatchObject({ reason: 'joined' })
  }, 60_000)

  // a cover page whose table stands in its own paragraph at the page's end, and a second
  // page of text. Cutting from the end of the paragraph before took the table along (a real
  // paper kept alone lost its title table), and the text check, which reads no tables, let
  // it through; cutting from the start of the cover kept the cover's table on page 2.
  async function coverWithTable(floating: boolean): Promise<Uint8Array> {
    const { HwpDocument } = await loadRhwpEngine()
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    doc.insertText(0, 0, 0, '표지 제목')
    if (floating) {
      doc.createTableEx(
        JSON.stringify({ sectionIdx: 0, paraIdx: 0, charOffset: 0, rowCount: 2, colCount: 2 }),
      )
    } else {
      doc.splitParagraph(0, 0, 5)
      doc.createTable(0, 1, 0, 2, 2)
    }
    const table = controlOf(doc, 'tbl')
    doc.insertTextInCell(0, table.para, table.controlIndex, 0, 0, 0, '표 안 글')
    const last = doc.getParagraphCount(0) - 1
    doc.breakAtCursor(0, last, 0, 'page')
    doc.insertText(0, doc.getParagraphCount(0) - 1, 0, '둘째 쪽 글')
    const bytes = doc.exportHwp()
    doc.free()
    return bytes
  }
  function controlOf(
    doc: { getControls(): string },
    id: string,
  ): { para: number; controlIndex: number } {
    const c = (
      JSON.parse(doc.getControls()) as { ctrlId: string; para: number; controlIndex: number }[]
    ).find((x) => x.ctrlId === id)
    if (!c) throw new Error('no ' + id)
    return c
  }
  async function tablesIn(bytes: Uint8Array): Promise<number> {
    const { HwpDocument } = await loadRhwpEngine()
    const doc = new HwpDocument(bytes)
    try {
      return (JSON.parse(doc.getControls()) as { ctrlId: string }[]).filter(
        (c) => c.ctrlId === 'tbl',
      ).length
    } finally {
      doc.free()
    }
  }

  it('keeps the table of a page kept, and leaves out the table of a page taken out', async () => {
    for (const floating of [false, true]) {
      const bytes = await coverWithTable(floating)
      expect(await hangulPages(bytes)).toHaveLength(2)
      const cover = await keepHangulPages(bytes, 'hwp', [0])
      expect(await tablesIn(cover.bytes)).toBe(1)
      const second = await keepHangulPages(bytes, 'hwp', [1])
      expect(await tablesIn(second.bytes)).toBe(0)
      expect(second.pages).toBe(1)
    }
  }, 60_000)

  it('refuses a page it cannot take out cleanly, and says which', async () => {
    const s = service()
    const opened = await s.open([join(HWP, 'master-page-next-section.hwpx')])
    if (!opened.ok) throw new Error(opened.error)
    const refused = await s.run({ token: opened.token, action: 'remove', remove: [1] }, () => {})
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.error).toContain('2쪽')
  }, 60_000)

  it("joins Hangul documents, HWP and HWPX together, into the first one's format", async () => {
    const s = service()
    const opened = await s.open([plan, tables])
    if (!opened.ok) throw new Error(opened.error)
    const merged = ok(await s.run({ token: opened.token, action: 'merge' }, () => {}))
    expect(merged.extension).toBe('hwpx')
    const text = await hwpToText(merged.bytes)
    expect(text).toContain(
      (
        (await hwpToText(new Uint8Array(await readFile(tables)))).trim().split('\n')[0] ?? ''
      ).trim(),
    )

    const mixed = await s.open([join(HWP, 'nested-form.hwp'), plan])
    if (!mixed.ok) throw new Error(mixed.error)
    const asHwp = ok(await s.run({ token: mixed.token, action: 'merge' }, () => {}))
    expect(asHwp.extension).toBe('hwp')
  }, 60_000)

  // an HWPX written by an XML library names its parts ns0:, ns1: (a real paper, 2026-11-21):
  // valid, read fine, but the join looked for 한/글's hh:, did not count its sections, and
  // showed only the first document (refused at the check, so nothing could be joined)
  it('joins an HWPX written with other XML prefixes', async () => {
    const { HwpDocument } = await loadRhwpEngine()
    const make = (words: string): Uint8Array => {
      const doc = HwpDocument.createEmpty()
      doc.createBlankDocument()
      doc.insertText(0, 0, 0, words)
      const made = doc.exportHwpxWithReport()
      const bytes = made.takeBytes()
      made.free()
      doc.free()
      return bytes
    }
    const renamed = async (words: string): Promise<Uint8Array> => {
      const pkg = await readZip(make(words))
      for (const [name, from, to] of [
        ['Contents/header.xml', 'hh', 'ns1'],
        ['Contents/section0.xml', 'hs', 'ns0'],
      ] as const) {
        const xml = readText(pkg, name) ?? ''
        writeText(
          pkg,
          name,
          xml.replace(new RegExp('(</?|xmlns:)' + from + '([:=])', 'g'), '$1' + to + '$2'),
        )
      }
      return writeZip(pkg)
    }
    const joined = await joinHangul(
      [
        { bytes: await renamed('첫째 문서의 글'), format: 'hwpx' },
        { bytes: await renamed('둘째 문서의 글'), format: 'hwpx' },
      ],
      'hwpx',
    )
    const text = await hwpToText(joined.bytes)
    expect(text).toContain('첫째 문서의 글')
    expect(text).toContain('둘째 문서의 글')
  }, 60_000)
})
