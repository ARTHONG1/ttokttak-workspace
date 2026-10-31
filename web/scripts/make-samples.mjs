// Builds the web trial's sample documents (web/runtime/samples). Run from program/: node web/scripts/make-samples.mjs
import { writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import JSZip from 'jszip'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'runtime', 'samples')
mkdirSync(OUT, { recursive: true })

// 한글: a school field-trip plan with a budget table to fix
copyFileSync(
  join(OUT, '..', '..', '..', '..', 'samples', '2026_현장체험학습_운영계획안.hwpx'),
  join(OUT, '현장체험학습 운영계획(안).hwpx'),
)

// 워드: a short notice to polish
const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 160, line: 360 },
    ...opts,
    children: [new TextRun({ text, font: 'Malgun Gothic', size: 22, ...(opts.run || {}) })],
  })
const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 320 },
          children: [
            new TextRun({
              text: '가을 독서 행사 안내',
              font: 'Malgun Gothic',
              size: 36,
              bold: true,
            }),
          ],
        }),
        p('도서관에서 가을 독서 행사를 합니다. 많이 오세요.'),
        p(
          '날짜는 11월 15일 토요일이고 시간은 오후 2시부터 4시까지 합니다. 장소는 도서관 2층 세미나실입니다.',
        ),
        p(
          '작가와의 대화, 책 교환 장터, 어린이 그림책 읽기 같은 것을 할 예정입니다. 신청은 도서관 홈페이지에서 하면 되고 선착순 50명까지 받습니다.',
        ),
        p('궁금한 거 있으면 도서관으로 전화 주세요. (02-123-4567)'),
      ],
    },
  ],
})
writeFileSync(join(OUT, '독서 행사 안내문.docx'), await Packer.toBuffer(doc))

// 엑셀: a small budget table without totals
const rows = [
  ['항목', '1분기', '2분기', '3분기', '4분기'],
  ['인건비', 12000000, 12000000, 12500000, 12500000],
  ['임차료', 3000000, 3000000, 3000000, 3000000],
  ['홍보비', 1500000, 2200000, 1800000, 2600000],
  ['교육비', 800000, 600000, 900000, 1200000],
  ['기타', 400000, 350000, 500000, 450000],
]
const col = (i) => String.fromCharCode(65 + i)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const sheetRows = rows
  .map(
    (r, ri) =>
      '<row r="' +
      (ri + 1) +
      '">' +
      r
        .map((v, ci) => {
          const ref = col(ci) + (ri + 1)
          const style = ri === 0 ? ' s="1"' : typeof v === 'number' ? ' s="2"' : ''
          return typeof v === 'number'
            ? '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>'
            : '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t>' + esc(v) + '</t></is></c>'
        })
        .join('') +
      '</row>',
  )
  .join('')
const zip = new JSZip()
zip.file(
  '[Content_Types].xml',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
)
zip.file(
  '_rels/.rels',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
)
zip.file(
  'xl/workbook.xml',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="예산" sheetId="1" r:id="rId1"/></sheets></workbook>',
)
zip.file(
  'xl/_rels/workbook.xml.rels',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
)
zip.file(
  'xl/styles.xml',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F6"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="0"/></cellXfs></styleSheet>',
)
zip.file(
  'xl/worksheets/sheet1.xml',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="5" width="14" customWidth="1"/></cols><sheetData>' +
    sheetRows +
    '</sheetData></worksheet>',
)
writeFileSync(
  join(OUT, '2027 예산표.xlsx'),
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
)
console.log('samples ready:', OUT)
