import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import init from '@rhwp/core'
import { hwpToText } from '@genoffice/file-parse'
import { docxToHwpx } from '../src/main/document-convert/docx-hwpx'
import { convertHwpContainer } from '../src/main/document-convert/hwp-container'

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'

const para = (text: string) => '<w:p><w:r><w:t xml:space="preserve">' + text + '</w:t></w:r></w:p>'
const cell = (text: string) => '<w:tc>' + para(text) + '</w:tc>'
const tableRow = (cells: string[]) => '<w:tr>' + cells.map(cell).join('') + '</w:tr>'

const PICTURE =
  '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="p"/>' +
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
  '<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
  '<pic:blipFill><a:blip r:embed="rIdImg"/></pic:blipFill><pic:spPr/></pic:pic>' +
  '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'

// a 1×1 PNG
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/** a Word document like the ones 문서 변환's PDF → Word stage writes */
async function wordDocument(withPicture = false): Promise<Uint8Array> {
  const body =
    para('2026학년도 2학기 현장체험학습 운영 계획(안)') +
    para('1. 운영 목적') +
    para('- 교과 내용과 연계한 체험 활동으로 탐구하는 힘을 기름.') +
    '<w:tbl>' +
    tableRow(['구분', '활동 내용', '소요 예산(원)']) +
    tableRow(['1차', '3~4학년 과학관 탐구 체험', '4,500,000']) +
    tableRow(['2차', '5~6학년 경주 역사 유적 답사', '6,000,000']) +
    tableRow(['합계', '학년별 현장체험학습 2회', '10,500,000']) +
    '</w:tbl>' +
    para('3. 안전 및 협조 사항') +
    (withPicture ? PICTURE : '')
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/p.png"/></Relationships>',
  )
  if (withPicture) zip.file('word/media/p.png', PNG)
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document ' +
      W +
      ' ' +
      R +
      '><w:body>' +
      body +
      '</w:body></w:document>',
  )
  return zip.generateAsync({ type: 'uint8array' })
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

describe('docxToHwpx', () => {
  it('carries the text over word for word, spacing included, as an HWPX document', async () => {
    const hwpx = await docxToHwpx(await wordDocument())
    expect([...hwpx.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    const text = await hwpToText(hwpx)
    expect(text).toContain('2026학년도 2학기 현장체험학습 운영 계획(안)')
    expect(text).toContain('교과 내용과 연계한 체험 활동으로 탐구하는 힘을 기름.')
    expect(text).toContain('3. 안전 및 협조 사항')
  })

  it('keeps the table rows in their order and adds nothing of its own', async () => {
    const text = lines(await hwpToText(await docxToHwpx(await wordDocument())))
    const at = (s: string) => text.findIndex((l) => l.includes(s))
    expect(at('1차')).toBeGreaterThan(-1)
    expect(at('1차')).toBeLessThan(at('2차'))
    expect(at('2차')).toBeLessThan(at('합계'))
    expect(text.some((l) => l === '끝.' || l.endsWith(' 끝.'))).toBe(false)
  })

  it('brings the pictures along', async () => {
    const hwpx = await docxToHwpx(await wordDocument(true))
    const zip = await JSZip.loadAsync(hwpx)
    const pictures = Object.keys(zip.files).filter(
      (n) => n.startsWith('BinData/') && !zip.files[n].dir,
    )
    expect(pictures).toEqual(['BinData/image_001.png'])
  })

  it('makes a document the Hangul engine saves as HWP without losing a word', async () => {
    const hwpx = await docxToHwpx(await wordDocument())
    const hwp = await convertHwpContainer(hwpx, 'hwp')
    expect([...hwp.subarray(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0])
    expect(await hwpToText(hwp)).toContain('5~6학년 경주 역사 유적 답사')
  })

  it('refuses a document with nothing in it', async () => {
    const zip = await JSZip.loadAsync(await wordDocument())
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document ' + W + '><w:body/></w:document>',
    )
    await expect(docxToHwpx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow()
  })
})
