import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { decodeText, readTableFile, xlsxText } from '../src/main/table-file'
import { rosterNames } from '../src/renderer/src/record/record-core'
import { entriesFromText } from '../src/renderer/src/record/record-similarity'

/** a small workbook: shared strings, an inline string, a number, a gap and two sheets */
async function workbook(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns:r="r"><sheets><sheet name="명렬표" sheetId="2" r:id="rId9"/><sheet name="다른" sheetId="1" r:id="rId1"/></sheets></workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId9" Target="worksheets/sheet2.xml"/></Relationships>',
  )
  zip.file(
    'xl/sharedStrings.xml',
    '<sst><si><t>번호</t></si><si><t>성명</t></si><si><r><t>김</t></r><r><t>하늘</t></r></si><si><t xml:space="preserve">이 바다 </t></si></sst>',
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>다른 시트</t></is></c></row></sheetData></worksheet>',
  )
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2"><v>1</v></c><c r="C2" t="s"><v>2</v></c></row>' +
      '<row r="3"><c r="A3"><v>2</v></c><c r="C3" t="s"><v>3</v></c></row>' +
      '<row r="4"><c r="A4" t="inlineStr"><is><t>탭&amp;\n줄</t></is></c></row>' +
      '</sheetData></worksheet>',
  )
  return zip.generateAsync({ type: 'uint8array' })
}

describe('명렬표 and 글 files', () => {
  it("read a workbook's first sheet as tab-separated rows, columns in place", async () => {
    expect(await xlsxText(await workbook())).toBe('번호\t\t성명\n1\t\t김하늘\n2\t\t이 바다\n탭& 줄')
  })

  it('give the 생기부 page its students', async () => {
    const text = await xlsxText(await workbook())
    expect(rosterNames(text)).toEqual(['김하늘', '이 바다'])
  })

  it('read CSV as UTF-8, or EUC-KR from older Korean Excel', () => {
    expect(decodeText(new TextEncoder().encode('\uFEFF이름,글\n김하늘,가'))).toBe(
      '이름,글\n김하늘,가',
    )
    // "이름" in EUC-KR
    expect(decodeText(new Uint8Array([0xc0, 0xcc, 0xb8, 0xa7]))).toBe('이름')
  })

  it('open from disk, refuse the old .xls and other kinds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'saenggibu-table-'))
    writeFileSync(
      join(dir, '글.csv'),
      '이름,글\n김하늘,탐구에 적극적으로 참여함.\n이바다,발표를 잘함.',
    )
    const csv = await readTableFile(join(dir, '글.csv'))
    expect(csv).toMatchObject({ ok: true, name: '글.csv', truncated: false })
    if (csv.ok) expect(entriesFromText(csv.text).map((e) => e.name)).toEqual(['김하늘', '이바다'])
    writeFileSync(join(dir, '옛.xls'), 'x')
    expect(await readTableFile(join(dir, '옛.xls'))).toMatchObject({ ok: false })
    writeFileSync(join(dir, '문서.pdf'), 'x')
    expect(await readTableFile(join(dir, '문서.pdf'))).toMatchObject({ ok: false })
  })
})
